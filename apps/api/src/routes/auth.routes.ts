import { Router, Request, Response } from "express";
import { prisma } from "@omniblitz/database";

const router = Router();
const GRAPH_VERSION = process.env.FB_GRAPH_API_VERSION ?? "v21.0";
const FB_APP_ID = process.env.FB_APP_ID ?? "";
const FB_APP_SECRET = process.env.FB_APP_SECRET ?? "";

/**
 * GET /api/auth/facebook/callback
 * OAuth callback after Facebook Login — exchanges code for tokens,
 * fetches managed pages, and stores them for the tenant.
 */
router.get("/facebook/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state" });
    return;
  }

  let tenantId: string;
  let userId: string;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    ) as { tenantId: string; userId: string };
    tenantId = parsed.tenantId;
    userId = parsed.userId;
  } catch {
    res.status(400).json({ error: "Invalid state parameter" });
    return;
  }

  const redirectUri = `${process.env.API_BASE_URL}/api/auth/facebook/callback`;

  const tokenRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?` +
      new URLSearchParams({
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      })
  );

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: { message: string };
  };

  if (!tokenData.access_token) {
    res.status(502).json({
      error: "Token exchange failed",
      detail: tokenData.error?.message,
    });
    return;
  }

  const userToken = tokenData.access_token;

  const pagesRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${userToken}`
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      category?: string;
      picture?: { data?: { url?: string } };
    }>;
  };

  const pages = pagesData.data ?? [];
  const connected = [];

  const meRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me?access_token=${userToken}`
  );
  const meData = (await meRes.json()) as { id?: string };
  const facebookUserId = meData.id ?? userId;

  for (const page of pages) {
    const saved = await prisma.facebookPage.upsert({
      where: { pageId: page.id },
      create: {
        tenantId,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        category: page.category,
        pictureUrl: page.picture?.data?.url,
      },
      update: {
        pageName: page.name,
        pageAccessToken: page.access_token,
        category: page.category,
        pictureUrl: page.picture?.data?.url,
        isActive: true,
      },
    });
    connected.push(saved);
  }

  await prisma.facebookAccount.upsert({
    where: { facebookUserId },
    create: {
      userId,
      facebookUserId,
      accessToken: userToken,
    },
    update: { accessToken: userToken },
  });

  res.json({
    message: `Connected ${connected.length} page(s)`,
    pages: connected.map((p) => ({
      id: p.id,
      pageId: p.pageId,
      pageName: p.pageName,
    })),
  });
});

/**
 * GET /api/auth/facebook/login-url?tenantId=...&userId=...
 * Returns the Facebook Login URL for the dashboard to redirect to.
 */
router.get("/facebook/login-url", (req: Request, res: Response) => {
  const { tenantId, userId } = req.query as {
    tenantId?: string;
    userId?: string;
  };

  if (!tenantId || !userId) {
    res.status(400).json({ error: "tenantId and userId are required" });
    return;
  }

  const state = Buffer.from(
    JSON.stringify({ tenantId, userId })
  ).toString("base64url");

  const redirectUri = `${process.env.API_BASE_URL}/api/auth/facebook/callback`;
  const scopes = [
    "pages_show_list",
    "pages_messaging",
    "pages_manage_metadata",
  ].join(",");

  const url =
    `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?` +
    new URLSearchParams({
      client_id: FB_APP_ID,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      response_type: "code",
    });

  res.json({ url });
});

export default router;
