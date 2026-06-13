import { Router, Request, Response } from "express";
import { prisma } from "@omniblitz/database";

const router = Router();

// 1. Get all conversations
router.get("/", async (req: Request, res: Response) => {
  try {
    const rawTenantId = req.query.tenantId;
    const { facebookPageId, status } = req.query;

    // Tenant ID ကို string သေချာပေါက်ဖြစ်အောင် စစ်ထုတ်ခြင်း (Error Line 51 ကို ဖြေရှင်းချက်)
    const tenantId = typeof rawTenantId === "string" ? rawTenantId : undefined;

    if (!tenantId) {
      res.status(400).json({ error: "tenantId is required and must be a string" });
      return;
    }

    const targetPageId = typeof facebookPageId === "string" ? facebookPageId : undefined;
    const targetStatus = typeof status === "string" ? (status as any) : undefined;

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        facebookPageId: targetPageId,
        status: targetStatus,
      },
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

    // ID က string သေချာပေါက်ဖြစ်စေရန် စစ်ထုတ်ခြင်း
    const targetId = typeof id === "string" ? id : undefined;

    const conversation = await prisma.conversation.findUnique({
      where: { id: targetId },
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

    // ID နှင့် Status ကို string သေချာပေါက် ဖြစ်စေရန် စစ်ထုတ်ခြင်း (Error Line 78 ကို ဖြေရှင်းချက်)
    const targetId = typeof id === "string" ? id : undefined;
    const targetStatus = typeof status === "string" ? status : undefined;

    const updated = await prisma.conversation.update({
      where: { id: targetId },
      data: { status: targetStatus as any },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;