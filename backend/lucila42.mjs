import { db } from "./src/lib/db.js";
const items = await db.catalogItem.findMany({
  where: { barcode: "810221398691" },   // Lucila Ivory 42's UPC
  select: { sku: true, barcode: true, title: true, inventory: true, tracked: true, shopifyVariantId: true },
});
console.log("=== Lucila Ivory 42 (barcode 810221398691) ===");
for (const i of items) {
  console.log(JSON.stringify(i, null, 2));
}
process.exit(0);
