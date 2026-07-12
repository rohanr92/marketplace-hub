import { db } from "./src/lib/db.js";
import { decrypt } from "./src/lib/crypto.js";

const conns = await db.connection.findMany({ where: { type: "mirakl", active: true } });
for (const conn of conns) {
  console.log(`\n========== ${conn.label} ==========`);
  const apiKey = decrypt(conn.apiKeyEnc);
  try {
    const res = await fetch(`${conn.baseUrl}/api/returns?max=3`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
    });
    console.log(`HTTP ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      // show the structure: keys, count, and first return's full shape
      console.log("top-level keys:", Object.keys(data));
      const returns = data.returns ?? data.data ?? [];
      console.log("returns count in response:", returns.length);
      if (returns[0]) {
        console.log("=== FIRST RETURN (full JSON) ===");
        console.log(JSON.stringify(returns[0], null, 2).slice(0, 2000));
      } else {
        console.log("(no returns on this marketplace)");
      }
    } else {
      console.log("body:", (await res.text()).slice(0, 300));
    }
  } catch (e) {
    console.log("error:", e.message);
  }
}
process.exit(0);
