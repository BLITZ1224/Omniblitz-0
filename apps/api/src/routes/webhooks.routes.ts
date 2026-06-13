import {
  Router,
  raw,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { verifyWebhookSignature } from "../middleware/verifyWebhookSignature.js";
import {
  handleWebhookVerification,
  handleWebhookEvent,
} from "../webhooks/messenger.handler.js";

const router = Router();

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Facebook requires signature verification on the raw body.
 * We capture rawBody via a verify callback, then parse JSON manually.
 */
router.use(
  "/messenger",
  raw({ type: "application/json", verify: captureRawBody })
);

router.get("/messenger", handleWebhookVerification);
router.post("/messenger", verifyWebhookSignature, parseJsonBody, handleWebhookEvent);

function captureRawBody(
  req: RawBodyRequest,
  _res: Response,
  buf: Buffer
): void {
  req.rawBody = buf;
}

function parseJsonBody(
  req: RawBodyRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    req.body = JSON.parse(req.rawBody?.toString("utf8") ?? "{}");
    next();
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
  }
}

export default router;
