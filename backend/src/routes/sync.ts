import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { runChannelSync, cleanupSyncLogs } from "../services/syncEngine.js";

export async function syncRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // Preview (dry run) - computes quantities, pushes nothing
  app.post("/channels/:id/sync/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    const r = await runChannelSync(id, req.tenantId, { dryRun: true });
    return r;
  });

  // Live sync now
  app.post("/channels/:id/sync/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    if (!conn.syncEnabled) return reply.code(400).send({ error: "Inventory sync is OFF for this channel" });
    const r = await runChannelSync(id, req.tenantId, { dryRun: false, source: "manual" });
    return r;
  });

  // Reports: recent sync logs across all channels (or one), paginated
  app.get("/reports/sync", async (req, reply) => {
    const q = z.object({
      connectionId: z.string().optional(),
      status: z.enum(["all", "success", "error", "skipped", "preview"]).default("all"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const where: any = { tenantId: req.tenantId };
    if (q.connectionId) where.connectionId = q.connectionId;
    if (q.status !== "all") where.status = q.status;

    const total = await db.syncLog.count({ where });
    const rows = await db.syncLog.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize, take: q.pageSize,
    });

    // attach channel labels
    const conns = await db.connection.findMany({ where: { tenantId: req.tenantId } });
    const label = new Map(conns.map((c) => [c.id, c.label]));
    const enriched = rows.map((r) => ({ ...r, channelLabel: label.get(r.connectionId) ?? r.connectionId }));

    return { total, page: q.page, pages: Math.ceil(total / q.pageSize), rows: enriched };
  });

  // Summary counts for the reports header
  app.get("/reports/summary", async (req) => {
    const where: any = { tenantId: req.tenantId };
    const [success, error, skipped, preview] = await Promise.all([
      db.syncLog.count({ where: { ...where, status: "success" } }),
      db.syncLog.count({ where: { ...where, status: "error" } }),
      db.syncLog.count({ where: { ...where, status: "skipped" } }),
      db.syncLog.count({ where: { ...where, status: "preview" } }),
    ]);
    return { success, error, skipped, preview };
  });

  // Manual cleanup trigger (worker also does this automatically)
  app.post("/reports/cleanup", async (req) => {
    // Manual button: clear ALL logs immediately.
    const n = await cleanupSyncLogs(0);
    return { deleted: n };
  });
}
