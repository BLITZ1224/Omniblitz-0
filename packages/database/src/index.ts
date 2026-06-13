import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
// Local လမ်းကြောင်းအဟောင်းအစား Standard လမ်းကြောင်း `@prisma/client` သို့ ပြောင်းလဲထားပါသည်
import { PrismaClient } from "@prisma/client";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(packageRoot, "../../../.env") });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Render က PostgreSQL အတွက် Neon DB Driver ချိတ်ဆက်မှု အပိုင်း
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Type များ အပြင်သို့ ပြန်ထုတ်ပေးရန် လမ်းကြောင်းကိုလည်း ပြောင်းလဲထားပါသည်
export * from "@prisma/client";