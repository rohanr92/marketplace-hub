import { db } from "./src/lib/db.js";

// Take a few unmatched Kohl's/Macy's offer UPCs, see if they exist in the catalog
const tests = [
  ["Kohls", "810205992884"],  // AME-CTTWE-34
  ["Kohls", "810205995595"],  // BRIVE-SD-39
  ["Macys", "810205995809"],  // LET-BOR-36
  ["Macys", "810205995649"],  // ISA-TAN-36
];
for (const [mp, upc] of tests) {
  const byBarcode = await db.catalogItem.findFirst({ where: { barcode: upc } });
  const bySku = await db.catalogItem.findFirst({ where: { sku: upc } });
  console.log(`${mp} UPC ${upc}: ${byBarcode ? `MATCHES catalog barcode (sku=${byBarcode.sku})` : bySku ? "matches as sku" : "NOT in catalog"}`);
}

// Also: how does the reconcile matching actually link offer->catalogItem?
console.log("\n=== how many offers matched vs unmatched per channel ===");
const conns = await db.connection.findMany({ where: { type: "mirakl" } });
for (const c of conns) {
  const total = await db.channelOffer.count({ where: { connectionId: c.id } });
  const matched = await db.channelOffer.count({ where: { connectionId: c.id, catalogItemId: { not: null } } });
  console.log(`${c.label}: ${matched}/${total} matched to catalog`);
}
process.exit(0);
