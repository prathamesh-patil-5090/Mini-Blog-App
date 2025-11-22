import { PrismaClient } from "@prisma/client";
import env from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log:
      process.env.APP_STAGE === "dev" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.APP_STAGE !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
