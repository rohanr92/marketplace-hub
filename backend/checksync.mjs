import { db } from "./src/lib/db.js";

console.log("=== CHANNEL SYNC STATUS (all must be syncEnabled:true to receive stock updates) ===");
const conns = await db.connection.findMany({ where: { type: "mirakl" } });
for (const c of conns) {
  console.log(`${c.label.padEnd(28)} active=${c.active}  syncEnabled=${c.syncEnabled}`);
}

console.log("\n=== SHOPIFY CONNECTIONS ===");
const shops = await db.connection.findMany({ where: { type: "shopify" } });
for (const c of shops) {
  console.log(`${c.label.padEnd(28)} active=${c.active}  baseUrl=${c.baseUrl}  hasWebhookSecret=${!!c.webhookSecretEnc}`);
}
process.exit(0);
