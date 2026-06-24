import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { listOrderThreads, getOrderThread, replyToThread } from "../services/mirakl.js";

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
    const orders = await db.order.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { channelCreatedAt: "desc" },
      take: 60,
    });
    const conns = await db.connection.findMany({ where: { tenantId: req.tenantId } });
    const connMap = new Map(conns.map((c) => [c.id, c]));

    const items: any[] = [];
    for (const o of orders) {
      const conn = connMap.get(o.connectionId);
      if (!conn || conn.type !== "mirakl") continue;
      try {
        const threads = await listOrderThreads(conn, o.channelOrderId);
        for (const t of threads) {
          items.push({
            orderRowId: o.id,
            channelOrderId: o.channelOrderId,
            channel: conn.label,
            threadId: t.id,
            topic: t?.topic?.value ?? "Message",
            lastMessageDate: t?.metadata?.last_message_date ?? t?.date_updated,
            lastSender: t?.metadata?.last_sender?.display_name ?? "",
            replyNeeded: !!t?.metadata?.shop_reply_needed_since,
            count: t?.metadata?.total_count ?? 0,
          });
        }
      } catch {
        // skip orders whose thread fetch fails
      }
    }
    items.sort((a, b) => (b.lastMessageDate ?? "").localeCompare(a.lastMessageDate ?? ""));
    return { items };
  });

}
