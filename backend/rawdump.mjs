import { db } from "./src/lib/db.js";
import { fetchMiraklOrderById } from "./src/services/mirakl.js";

const conn = await db.connection.findFirst({ where: { type: "mirakl", baseUrl: { contains: "nordstrom" } } });
const raw = await fetchMiraklOrderById(conn, "1049076950-50000-A");

console.log("=== FULL ORDER LINE JSON (every field Nordstrom sends) ===");
for (const line of (raw.order_lines ?? [])) {
  console.log(JSON.stringify(line, null, 2));
}
process.exit(0);
