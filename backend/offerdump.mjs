import { db } from "./src/lib/db.js";
import { decrypt } from "./src/lib/crypto.js";

const conn = await db.connection.findFirst({ where: { type: "mirakl", baseUrl: { contains: "nordstrom" } } });
const apiKey = decrypt(conn.apiKeyEnc);

// Pull the offer for this specific SKU - offers usually carry UPC/EAN/product identifiers
const res = await fetch(`${conn.baseUrl}/api/offers?product_id=B1974985&max=5`, { headers: { Authorization: apiKey, Accept: "application/json" } });
console.log("=== OFFERS endpoint for product B1974985 ===");
const data = await res.json();
console.log(JSON.stringify(data, null, 2).slice(0, 3000));
process.exit(0);
