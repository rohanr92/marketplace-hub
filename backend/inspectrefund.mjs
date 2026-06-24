
import { db } from "./src/lib/db.ts";

import { fetchMiraklOrderById } from "./src/services/mirakl.ts";

const orders = await db.order.findMany({ where: { state: "shipped_to_marketplace" }, take: 1 });

const o = orders[0] ?? (await db.order.findFirst());

const conn = await db.connection.findUnique({ where: { id: o.connectionId } });

const raw = await fetchMiraklOrderById(conn, o.channelOrderId);

console.log("ORDER:", o.channelOrderId, "state:", raw?.order_state);

console.log("has_incident:", raw?.has_incident);

console.log("order_lines refund/cancel shape:");

for (const line of raw?.order_lines ?? []) {

  console.log("  line", line.order_line_id ?? line.id, {

    refunds: line.refunds,

    cancelations: line.cancelations,

    received_quantity: line.received_quantity,

    quantity: line.quantity,

    line_state: line.order_line_state,

  });

}

console.log("TOP-LEVEL KEYS:", Object.keys(raw ?? {}).join(", "));

process.exit(0);

