import { db } from "./src/lib/db.ts";
import { fetchMiraklOrderById } from "./src/services/mirakl.ts";

const orders = await db.order.findMany({});
console.log(`Scanning ${orders.length} orders for refunds...`);

let found = 0;
for (const o of orders) {
  const conn = await db.connection.findUnique({ where: { id: o.connectionId } });
  if (!conn || conn.type !== "mirakl") continue;

  let raw;
  try {
    raw = await fetchMiraklOrderById(conn, o.channelOrderId);
  } catch (e) {
    console.log(`  skip ${o.channelOrderId}: ${e.message}`);
    continue;
  }
  if (!raw) continue;

  // Collect refunded lines across the order.
  const refundedLines = [];
  let refundedAmount = 0;
  for (const line of raw.order_lines ?? []) {
    for (const r of line.refunds ?? []) {
      refundedLines.push({
        lineId: line.order_line_id ?? line.id,
        sku: line.offer_sku ?? line.product_sku ?? null,
        title: line.product_title ?? line.offer ?? null,
        amount: r.amount ?? 0,
        quantity: r.quantity ?? 0,
        reasonCode: r.reason_code ?? null,
        state: r.refund_state ?? r.state ?? null,
        createdDate: r.created_date ?? null,
        refundId: r.id ?? r.order_refund_id ?? null,
      });
      refundedAmount += Number(r.amount ?? 0);
    }
  }

  if (refundedLines.length > 0) {
    await db.order.update({
      where: { id: o.id },
      data: {
        fullyRefunded: !!raw.fully_refunded,
        refundedAmount: Number(refundedAmount.toFixed(2)),
        refundJson: JSON.stringify(refundedLines),
      },
    });
    found++;
    console.log(`  ${o.channelOrderId}: ${refundedLines.length} refund(s), $${refundedAmount.toFixed(2)}${raw.fully_refunded ? " (FULL)" : ""}`);
  }
}

console.log(`Done. ${found} order(s) with refunds.`);
process.exit(0);
