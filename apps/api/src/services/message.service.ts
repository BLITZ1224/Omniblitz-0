import {
  prisma,
  MessageContentType,
  MessageDirection,
  AttachmentType,
} from "@omniblitz/database";
import type { PageContext, IncomingMessage } from "../types/messenger.types.js";

const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION ?? "v21.0";

/**
 * Resolves a Facebook Page ID to its tenant context.
 * This is the core routing lookup for multi-tenant webhook handling.
 */
export async function resolvePageContext(
  facebookPageId: string
): Promise<PageContext | null> {
  const page = await prisma.facebookPage.findUnique({
    where: { pageId: facebookPageId, isActive: true },
    select: {
      id: true,
      pageId: true,
      tenantId: true,
      pageAccessToken: true,
      pageName: true,
    },
  });

  if (!page) return null;

  return {
    pageDbId: page.id,
    pageId: page.pageId,
    tenantId: page.tenantId,
    pageAccessToken: page.pageAccessToken,
    pageName: page.pageName,
  };
}

/**
 * Upserts the Messenger end-user (PSID) for a given page.
 */
export async function upsertMessengerUser(
  psid: string,
  pageDbId: string,
  pageAccessToken: string
) {
  let firstName: string | undefined;
  let lastName: string | undefined;
  let profilePicUrl: string | undefined;

  try {
    const profile = await fetchUserProfile(psid, pageAccessToken);
    firstName = profile.first_name;
    lastName = profile.last_name;
    profilePicUrl = profile.profile_pic;
  } catch {
    // Profile fetch is best-effort; proceed without it
  }

  return prisma.messengerUser.upsert({
    where: { psid_facebookPageId: { psid, facebookPageId: pageDbId } },
    create: {
      psid,
      facebookPageId: pageDbId,
      firstName,
      lastName,
      profilePicUrl,
    },
    update: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(profilePicUrl && { profilePicUrl }),
    },
  });
}

async function fetchUserProfile(psid: string, pageAccessToken: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${psid}?fields=first_name,last_name,profile_pic&access_token=${pageAccessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json() as Promise<{
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
  }>;
}

/**
 * Gets or creates a conversation between a Messenger user and a Page.
 */
export async function upsertConversation(
  tenantId: string,
  pageDbId: string,
  messengerUserId: string
) {
  return prisma.conversation.upsert({
    where: {
      facebookPageId_messengerUserId: {
        facebookPageId: pageDbId,
        messengerUserId,
      },
    },
    create: { tenantId, facebookPageId: pageDbId, messengerUserId },
    update: {},
  });
}

/**
 * Maps Facebook attachment type to our schema enums.
 */
function mapAttachmentType(
  fbType: string
): { contentType: MessageContentType; attachmentType: AttachmentType } {
  switch (fbType) {
    case "image":
      return {
        contentType: MessageContentType.IMAGE,
        attachmentType: AttachmentType.IMAGE,
      };
    case "audio":
      return {
        contentType: MessageContentType.AUDIO,
        attachmentType: AttachmentType.AUDIO,
      };
    case "video":
      return {
        contentType: MessageContentType.VIDEO,
        attachmentType: AttachmentType.VIDEO,
      };
    case "file":
      return {
        contentType: MessageContentType.FILE,
        attachmentType: AttachmentType.FILE,
      };
    default:
      return {
        contentType: MessageContentType.FALLBACK,
        attachmentType: AttachmentType.FILE,
      };
  }
}

/**
 * Persists an inbound message and its attachments to the database.
 */
export async function persistInboundMessage(
  conversationId: string,
  message: IncomingMessage,
  rawPayload: unknown
) {
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const primaryType = hasAttachments
    ? mapAttachmentType(message.attachments![0].type).contentType
    : message.sticker_id
      ? MessageContentType.STICKER
      : MessageContentType.TEXT;

  const saved = await prisma.message.create({
    data: {
      conversationId,
      facebookMid: message.mid,
      direction: MessageDirection.INBOUND,
      contentType: primaryType,
      text: message.text ?? null,
      rawPayload: rawPayload as object,
      attachments: hasAttachments
        ? {
            create: message.attachments!.map((att) => {
              const mapped = mapAttachmentType(att.type);
              return {
                type: mapped.attachmentType,
                url: att.payload.url ?? "",
                mimeType: null,
              };
            }),
          }
        : undefined,
    },
    include: { attachments: true },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      unreadCount: { increment: 1 },
      status: "OPEN",
    },
  });

  return saved;
}

/**
 * Logs a raw webhook event for audit and debugging.
 */
export async function logWebhookEvent(
  pageDbId: string | null,
  eventType: string,
  payload: unknown,
  processed: boolean,
  error?: string
) {
  return prisma.webhookEvent.create({
    data: {
      facebookPageId: pageDbId,
      eventType,
      payload: payload as object,
      processed,
      error,
    },
  });
}
