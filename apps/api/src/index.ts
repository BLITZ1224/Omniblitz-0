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

// CORS Error ကင်းဝေးစေရန် Localhost ကော၊ Vercel Domain အားလုံးကိုပါ Array ဖြင့် စနစ်တကျ ခွင့်ပြုပေးလိုက်ပါသည်
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://omniblitz-0-web.vercel.app",
    /\.vercel\.app$/ // Vercel ရဲ့ preview link တွေပါ အလုပ်လုပ်စေရန်
  ],
  credentials: true
}));

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