import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";

const APP_SECRET = process.env.FB_APP_SECRET ?? "";

/**
 * Verifies the X-Hub-Signature-256 header on incoming Facebook webhooks.
 * Must run on the raw request body (before JSON parsing).
 */
export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  if (!signature || !APP_SECRET) {
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  next();
}
