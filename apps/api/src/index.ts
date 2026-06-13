import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import webhookRoutes from "./routes/webhooks.routes.js";
import conversationRoutes from "./routes/conversations.routes.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();
const PORT = Number(process.env.API_PORT) || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000" }));

// JSON body parser for all routes EXCEPT webhooks (webhooks need raw body)
app.use((req, res, next) => {
  if (req.path.startsWith("/webhooks/")) return next();
  express.json()(req, res, next);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "omniblitz-api" });
});

app.use("/webhooks", webhookRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log(`[api] Omniblitz API running on http://localhost:${PORT}`);
  console.log(`[api] Webhook endpoint: http://localhost:${PORT}/webhooks/messenger`);
});
