import { Router, Request, Response } from "express";
import { prisma } from "@omniblitz/database";

const router = Router();
const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION ?? "v21.0";

/**
 * POST /api/conversations/:id/messages
 * Send an outbound reply from the dashboard.
 */
router.post("/:id/messages", async (req: Request, res: Response) => {
  const { id: conversationId } = req.params;
  const { text, tenantId, userId } = req.body as {
    text: string;
    tenantId: string;
    userId?: string;
  };

  if (!text?.trim() || !tenantId) {
    res.status(400).json({ error: "text and tenantId are required" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: {
      messengerUser: true,
      facebookPage: true,
    },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const psid = conversation.messengerUser.psid;
  const pageId = conversation.facebookPage.pageId;
  const token = conversation.facebookPage.pageAccessToken;

  const fbResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: token,
      }),
    }
  );

  const fbResult = (await fbResponse.json()) as {
    message_id?: string;
    error?: { message: string };
  };

  if (!fbResponse.ok || fbResult.error) {
    res.status(502).json({
      error: "Facebook send failed",
      detail: fbResult.error?.message,
    });
    return;
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      facebookMid: fbResult.message_id ?? null,
      direction: "OUTBOUND",
      contentType: "TEXT",
      text,
      sentByUserId: userId ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  res.status(201).json({ message });
});

/**
 * GET /api/conversations?tenantId=...
 * List conversations for the dashboard inbox.
 */
router.get("/", async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  const conversations = await prisma.conversation.findMany({
    where: { tenantId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messengerUser: true,
      facebookPage: { select: { pageName: true, pictureUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 50,
  });

  res.json({ conversations });
});

export default router;
