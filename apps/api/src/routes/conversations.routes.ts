import { Router, Request, Response } from "express";
import { prisma } from "@omniblitz/database";

const router = Router();

// 1. Get all conversations
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;
    const { facebookPageId, status } = req.query;

    if (!tenantId) {
      res.status(400).json({ error: "tenantId is required" });
      return;
    }

    // TypeScript Array Type Error မတက်အောင် သေချာ String စစ်ထုတ်ခြင်း
    const targetPageId = typeof facebookPageId === "string" ? facebookPageId : undefined;
    const targetStatus = typeof status === "string" ? (status as any) : undefined;

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        facebookPageId: targetPageId,
        status: targetStatus,
      },
      // Relation တွေဖြစ်တဲ့ messengerUser နဲ့ facebookPage ကို ပါအောင် include လုပ်ပေးခြင်း
      include: {
        messengerUser: true,
        facebookPage: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
      take: 50,
    });

    res.json({ conversations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get single conversation details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messengerUser: true,
        facebookPage: true,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json(conversation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Update conversation status
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const targetStatus = typeof status === "string" ? status : undefined;

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: targetStatus as any },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;