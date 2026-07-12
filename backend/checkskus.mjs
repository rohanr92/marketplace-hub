import { db } from "./src/lib/db.js";
const t = await db.connection.findFirst({ where: { type: "mirakl", baseUrl: { contains: "nordstrom" } } });
const items = await db.catalogItem.findMany({ where: { tenantId: t.tenantId }, select: { sku: true, barcode: true } });
console.log("Total catalog items:", items.length);
for (const n of ["LUCI","TIA","JIHILA","AME","BERT"]) {
  const hits = items.filter(i => (i.sku||"").toUpperCase().includes(n)).slice(0,8);
  console.log(`${n}* :`, hits.map(h=>h.sku).join(", ") || "(none in Shopify)");
}
process.exit(0);
