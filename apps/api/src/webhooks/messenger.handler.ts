import { Request, Response } from "express";
import type {
  MessengerWebhookPayload,
  MessengerWebhookEntry,
  MessengerMessagingEvent,
  PageContext,
} from "../types/messenger.types.js";
import {
  resolvePageContext,
  upsertMessengerUser,
  upsertConversation,
  persistInboundMessage,
  logWebhookEvent,
} from "../services/message.service.js";

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// GET  /webhooks/messenger  — Facebook webhook verification handshake
// POST /webhooks/messenger  — Inbound message delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles Facebook's webhook verification challenge (GET).
 */
export function handleWebhookVerification(
  req: Request,
  res: Response
): void {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[webhook] Verification successful");
    res.status(200).send(challenge);
    return;
  }

  console.warn("[webhook] Verification failed — invalid token");
  res.sendStatus(403);
}

/**
 * Central webhook handler — routes every incoming event by Page ID.
 *
 * Flow:
 *   payload.entry[].id  →  lookup FacebookPage  →  tenantId
 *   payload.entry[].messaging[]  →  process per event type
 */
export async function handleWebhookEvent(
  req: Request,
  res: Response
): Promise<void> {
  // Facebook expects a 200 within 20 seconds; respond immediately, process async
  res.sendStatus(200);

  const payload = req.body as MessengerWebhookPayload;

  if (payload.object !== "page" || !Array.isArray(payload.entry)) {
    console.warn("[webhook] Ignoring non-page payload");
    return;
  }

  for (const entry of payload.entry) {
    processEntry(entry, payload).catch((err) => {
      console.error(
        `[webhook] Unhandled error for page ${entry.id}:`,
        err
      );
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry-level routing: Page ID → Tenant context
// ─────────────────────────────────────────────────────────────────────────────

async function processEntry(
  entry: MessengerWebhookEntry,
  fullPayload: MessengerWebhookPayload
): Promise<void> {
  const facebookPageId = entry.id;

  // ── Step 1: Route by Page ID ──────────────────────────────────────────────
  const pageContext = await resolvePageContext(facebookPageId);

  if (!pageContext) {
    console.warn(
      `[webhook] No registered page for ID ${facebookPageId} — event dropped`
    );
    await logWebhookEvent(null, "unknown_page", fullPayload, false, `Page ${facebookPageId} not found`);
    return;
  }

  console.log(
    `[webhook] Routing to tenant=${pageContext.tenantId} page="${pageContext.pageName}" (${facebookPageId})`
  );

  if (!entry.messaging?.length) {
    await logWebhookEvent(pageContext.pageDbId, "empty_messaging", fullPayload, true);
    return;
  }

  // ── Step 2: Process each messaging event ──────────────────────────────────
  for (const event of entry.messaging) {
    await processMessagingEvent(event, pageContext, fullPayload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-level dispatch
// ─────────────────────────────────────────────────────────────────────────────

async function processMessagingEvent(
  event: MessengerMessagingEvent,
  ctx: PageContext,
  fullPayload: MessengerWebhookPayload
): Promise<void> {
  try {
    if (event.message) {
      await handleInboundMessage(event, ctx, fullPayload);
    } else if (event.delivery) {
      await handleDeliveryReceipt(event, ctx);
    } else if (event.read) {
      await handleReadReceipt(event, ctx);
    } else if (event.postback) {
      await handlePostback(event, ctx, fullPayload);
    } else {
      await logWebhookEvent(ctx.pageDbId, "unhandled_event", event, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] Error processing event for page ${ctx.pageId}:`, message);
    await logWebhookEvent(ctx.pageDbId, "processing_error", event, false, message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbound message handler (text, image, audio, video, file)
// ─────────────────────────────────────────────────────────────────────────────

async function handleInboundMessage(
  event: MessengerMessagingEvent,
  ctx: PageContext,
  fullPayload: MessengerWebhookPayload
): Promise<void> {
  const psid = event.sender.id;
  const message = event.message!;

  // Skip echo messages sent by the page itself
  if ("is_echo" in message && (message as Record<string, unknown>).is_echo) {
    return;
  }

  // ── Step 3: Upsert Messenger user ─────────────────────────────────────────
  const messengerUser = await upsertMessengerUser(
    psid,
    ctx.pageDbId,
    ctx.pageAccessToken
  );

  // ── Step 4: Upsert conversation ───────────────────────────────────────────
  const conversation = await upsertConversation(
    ctx.tenantId,
    ctx.pageDbId,
    messengerUser.id
  );

  // ── Step 5: Persist message + attachments ─────────────────────────────────
  const saved = await persistInboundMessage(
    conversation.id,
    message,
    { event, entry_page_id: ctx.pageId }
  );

  const attachmentSummary = saved.attachments
    .map((a) => a.type)
    .join(", ");

  console.log(
    `[webhook] Saved ${saved.contentType} message ${saved.id}` +
      (attachmentSummary ? ` [${attachmentSummary}]` : "") +
      ` conv=${conversation.id} tenant=${ctx.tenantId}`
  );

  await logWebhookEvent(ctx.pageDbId, "message_received", fullPayload, true);

  // TODO: Emit real-time event to dashboard (WebSocket / SSE / Redis pub-sub)
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery & read receipts
// ─────────────────────────────────────────────────────────────────────────────

async function handleDeliveryReceipt(
  event: MessengerMessagingEvent,
  ctx: PageContext
): Promise<void> {
  const mids = event.delivery?.mids;
  if (!mids?.length) return;

  const { prisma } = await import("@omniblitz/database");

  await prisma.message.updateMany({
    where: { facebookMid: { in: mids } },
    data: { deliveredAt: new Date(event.timestamp) },
  });

  await logWebhookEvent(ctx.pageDbId, "delivery", event, true);
}

async function handleReadReceipt(
  event: MessengerMessagingEvent,
  ctx: PageContext
): Promise<void> {
  const watermark = event.read?.watermark;
  if (!watermark) return;

  const { prisma } = await import("@omniblitz/database");

  await prisma.message.updateMany({
    where: {
      conversation: { facebookPageId: ctx.pageDbId },
      direction: "OUTBOUND",
      createdAt: { lte: new Date(watermark) },
      readAt: null,
    },
    data: { readAt: new Date(event.timestamp), isRead: true },
  });

  await logWebhookEvent(ctx.pageDbId, "read", event, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Postback handler (button clicks, Get Started, etc.)
// ─────────────────────────────────────────────────────────────────────────────

async function handlePostback(
  event: MessengerMessagingEvent,
  ctx: PageContext,
  fullPayload: MessengerWebhookPayload
): Promise<void> {
  const psid = event.sender.id;
  const postback = event.postback!;

  const messengerUser = await upsertMessengerUser(
    psid,
    ctx.pageDbId,
    ctx.pageAccessToken
  );

  const conversation = await upsertConversation(
    ctx.tenantId,
    ctx.pageDbId,
    messengerUser.id
  );

  const { prisma, MessageDirection, MessageContentType } = await import(
    "@omniblitz/database"
  );

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      facebookMid: postback.mid ?? null,
      direction: MessageDirection.INBOUND,
      contentType: MessageContentType.TEXT,
      text: `[Postback] ${postback.title}: ${postback.payload}`,
      rawPayload: event as object,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      unreadCount: { increment: 1 },
    },
  });

  await logWebhookEvent(ctx.pageDbId, "postback", fullPayload, true);
}
