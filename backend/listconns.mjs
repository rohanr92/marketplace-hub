import { db } from "./src/lib/db.js";
const conns = await db.connection.findMany({ where: { type: "mirakl" } });
console.log("=== CONNECTED MIRAKL MARKETPLACES ===");
for (const c of conns) {
  console.log(`${c.label}  |  ${c.baseUrl}  |  active=${c.active}`);
}
process.exit(0);
