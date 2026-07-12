import { db } from "./src/lib/db.js";

const conns = await db.connection.findMany({ where: { type: "mirakl" } });
console.log("=== MIRAKL CONNECTIONS ===");
for (const c of conns) {
  console.log(`${c.id}  |  ${c.label}  |  ${c.baseUrl}  |  active=${c.active}  |  lastSyncAt=${c.lastSyncAt ?? "never"}`);
}
process.exit(0);
