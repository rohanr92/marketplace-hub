import { db } from "./src/lib/db.js";
const items = await db.catalogItem.findMany({
  where: { title: { contains: "Lucila Ivory" } },
  select: { sku: true, barcode: true, title: true, inventory: true },
});
for (const i of items) console.log(`inv=${i.inventory} | ${i.title} | sku=${i.sku.slice(0,30)} | barcode=${i.barcode}`);
process.exit(0);
