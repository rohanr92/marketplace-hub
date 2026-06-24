import { db } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";

async function main() {
  const email = "owner@menina.test";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed user already exists:", email);
    return;
  }

  const tenant = await db.tenant.create({ data: { name: "Menina Step" } });
  await db.user.create({
    data: {
      email,
      password: await hashPassword("password123"),
      role: "owner",
      tenantId: tenant.id,
    },
  });

  console.log("Seeded tenant + login:");
  console.log("  email:    " + email);
  console.log("  password: password123");
}

main().then(() => process.exit(0));
