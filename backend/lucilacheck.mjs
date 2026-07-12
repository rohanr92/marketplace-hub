import { db } from "./src/lib/db.js";
// Find Lucila Ivory 42 - by blank sku it's hard, so search by barcode/title
const items = await db.catalogItem.findMany({
  where: { OR: [{ barcode: "810221398691" }, { title: { contains: "Lucila" } }] },
  select: { sku: true, barcode: true, title: true, inventory: true, tracked: true },
  take: 10,
});
for (const i of items) {
  console.log(`sku="${i.sku}" barcode=${i.barcode} inv=${i.inventory} tracked=${i.tracked} | ${i.title}`);
}
process.exit(0);
