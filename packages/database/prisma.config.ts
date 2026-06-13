import { defineConfig } from "prisma/config";
import path from "path";
import dotenv from "dotenv";

// absolute path နဲ့ မဖြစ်မနေ .env ကို အတင်းဆွဲဖတ်ခိုင်းတာပါ
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});