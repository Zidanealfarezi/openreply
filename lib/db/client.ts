import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import { withConnectionRetry } from "./retry";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    keepAlive: true,
    idleTimeoutMillis: 5_000,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      $allOperations({ args, query }) {
        return withConnectionRetry(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});
