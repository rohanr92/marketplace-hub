import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { listOrderThreads, getOrderThread, replyToThread, listAllThreads } from "../services/mirakl.js";

async function connForOrder(orderRowId: string, tenantId: string) {
  const order = await db.order.findFirst({ where: { id: orderRowId, tenantId } });
  if (!order) return null;
  const conn = await db.connection.findFirst({ where: { id: order.connectionId, tenantId } });
  if (!conn) return null;
  return { order, conn };
}

export async function messagesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // List threads for an order (by hub order row id)
  app.get("/orders/:id/threads", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ctx = await connForOrder(id, req.tenantId);
    if (!ctx) return reply.code(404).send({ error: "Order not found" });
    try {
      const threads = await listOrderThreads(ctx.conn, ctx.order.channelOrderId);
      return { threads };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // Get one full thread with messages
  app.get("/threads/:threadId", async (req, reply) => {
    const { threadId } = req.params as { threadId: string };
    const q = req.query as { orderId?: string };
    if (!q.orderId) return reply.code(400).send({ error: "orderId query required" });
    const ctx = await connForOrder(q.orderId, req.tenantId);
    if (!ctx) return reply.code(404).send({ error: "Order not found" });
    try {
      const thread = await getOrderThread(ctx.conn, threadId);
      return { thread };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // Reply to a thread
  app.post("/threads/:threadId/reply", async (req, reply) => {
    const { threadId } = req.params as { threadId: string };
    const body = req.body as { orderId: string; body: string; to: { id?: string; type: string }[] };
    if (!body?.orderId || !body?.body) return reply.code(400).send({ error: "orderId and body required" });
    const ctx = await connForOrder(body.orderId, req.tenantId);
    if (!ctx) return reply.code(404).send({ error: "Order not found" });
    try {
      const result = await replyToThread(ctx.conn, threadId, body.body, body.to ?? [{ type: "OPERATOR" }]);
      return { ok: true, result };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
  // Inbox: scan recent orders for threads, return a flat list (newest first)
  app.get("/inbox", async (req, reply) => {
    const conns = await db.connection.findMany({ where: { tenantId: req.tenantId, type: "mirakl", active: true } });
    // Look back 60 days for active threads.
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

    const items: any[] = [];
    for (const conn of conns) {
      try {
        const threads = await listAllThreads(
          { baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc },
          { updatedSince: since }
        );
        for (const t of threads) {
          // entity gives us the order id
          const orderEntity = (t.entities ?? []).find((e: any) => e.type === "MMP_ORDER") ?? (t.entities ?? [])[0];
          const channelOrderId = orderEntity?.id ?? "";
          // map to our hub order row (for reply/thread fetch)
          const order = channelOrderId
            ? await db.order.findFirst({ where: { tenantId: req.tenantId, channelOrderId, connectionId: conn.id } })
            : null;
          items.push({
            orderRowId: order?.id ?? null,
            channelOrderId: channelOrderId || (orderEntity?.label ?? "—"),
            channel: conn.label,
            threadId: t.id,
            topic: t?.topic?.value ?? orderEntity?.label ?? "Message",
            lastMessageDate: t?.metadata?.last_message_date ?? t?.date_updated,
            lastSender: t?.metadata?.last_sender?.display_name ?? "",
            replyNeeded: !!t?.metadata?.shop_reply_needed_since,
            count: t?.metadata?.total_count ?? 0,
          });
        }
      } catch (e: any) {
        if (String(e.message).startsWith("RATE_LIMIT")) continue;
      }
    }
    items.sort((a, b) => (b.lastMessageDate ?? "").localeCompare(a.lastMessageDate ?? ""));
    return { items };
  });

}
