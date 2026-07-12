import { db } from "./src/lib/db.js";
import { fetchMiraklReturns } from "./src/services/mirakl.js";

const conns = await db.connection.findMany({ where: { type: "mirakl", active: true } });
for (const conn of conns) {
  try {
    const r = await fetchMiraklReturns({ baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc }, { max: 100 });
    console.log(`${conn.label}: ${r.unsupported ? "UNSUPPORTED (404)" : r.data.length + " returns"}`);
    if (r.data[0]) {
      const x = r.data[0];
      console.log(`   sample: order=${x.order_commercial_id} state=${x.state} date=${x.date_created?.slice(0,10)} reason=${x.reason_code}`);
    }
  } catch (e) { console.log(`${conn.label}: ERROR ${e.message}`); }
}
process.exit(0);
