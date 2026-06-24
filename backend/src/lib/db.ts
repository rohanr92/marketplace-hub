import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Strip sslmode from the URL (it triggers a pg deprecation warning) and set SSL
// explicitly via the adapter option instead. Neon requires SSL.
const rawUrl = process.env.DATABASE_URL ?? "";
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

const adapter = new PrismaPg({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export const db = new PrismaClient({ adapter });
