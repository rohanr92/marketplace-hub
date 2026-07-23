import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { runChannelSync } from "../services/syncEngine.js";

async function autoSyncIfEnabled(connectionId: string, tenantId: string) {
  try {
    const c = await db.connection.findFirst({ where: { id: connectionId, tenantId } });
    if (c && c.type === "mirakl" && c.syncEnabled) {
      await runChannelSync(connectionId, tenantId, { dryRun: false, source: "auto" });
    }
  } catch (e) { /* non-fatal: settings still saved */ }
}

export async function channelSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // Get full settings for one channel
  app.get("/channels/:id/settings", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });

    const rules = await db.bufferRule.findMany({ where: { connectionId: id }, orderBy: { createdAt: "asc" } });
    const offers = await db.channelOffer.findMany({ where: { connectionId: id }, orderBy: { updatedAt: "desc" }, take: 500 });

    return {
      id: conn.id, label: conn.label, type: conn.type, baseUrl: conn.baseUrl,
      syncEnabled: conn.syncEnabled, mappingMode: conn.mappingMode, defaultBuffer: conn.defaultBuffer,
      rules, offers,
    };
  });

  // Update channel-level settings
  app.patch("/channels/:id/settings", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    const b = z.object({
      syncEnabled: z.boolean().optional(),
      mappingMode: z.enum(["auto_sku", "auto_upc", "manual", "full_catalog"]).optional(),
      defaultBuffer: z.number().int().min(0).optional(),
    }).parse(req.body);
    const updated = await db.connection.update({ where: { id }, data: b });
    await autoSyncIfEnabled(id, req.tenantId);
    return {
      syncEnabled: updated.syncEnabled, mappingMode: updated.mappingMode, defaultBuffer: updated.defaultBuffer,
    };
  });

  // Add a buffer rule
  app.post("/channels/:id/buffer-rules", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    const b = z.object({
      scope: z.enum(["sku", "upc", "title"]),
      value: z.string().min(1),
      amount: z.number().int().min(0),
    }).parse(req.body);
    const rule = await db.bufferRule.create({
      data: { tenantId: req.tenantId, connectionId: id, ...b },
    });
    await autoSyncIfEnabled(id, req.tenantId);
    return rule;
  });

  app.delete("/channels/:id/buffer-rules/:ruleId", async (req, reply) => {
    const { ruleId } = req.params as { id: string; ruleId: string };
    const rule = await db.bufferRule.findFirst({ where: { id: ruleId, tenantId: req.tenantId } });
    if (!rule) return reply.code(404).send({ error: "Not found" });
    await db.bufferRule.delete({ where: { id: ruleId } });
    await autoSyncIfEnabled(rule.connectionId, req.tenantId);
    return { ok: true };
  });

  // Manually map an offer to a catalog item
  app.patch("/channels/:id/offers/:offerId", async (req, reply) => {
    const { offerId } = req.params as { id: string; offerId: string };
    const offer = await db.channelOffer.findFirst({ where: { id: offerId, tenantId: req.tenantId } });
    if (!offer) return reply.code(404).send({ error: "Not found" });
    const b = z.object({
      catalogItemId: z.string().nullable().optional(),
      syncEnabled: z.boolean().optional(),
    }).parse(req.body);
    const updated = await db.channelOffer.update({ where: { id: offerId }, data: b });
    return { id: updated.id, catalogItemId: updated.catalogItemId, syncEnabled: updated.syncEnabled };
  });

  // Create a sample offer (so you can see manual mapping before live Mirakl pull)
  app.post("/channels/:id/offers/sample", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });
    const samples = [
      { offerSku: "VERA-TAN-W36", offerUpc: "810205998411", title: "Vera Flat Sandal" },
      { offerSku: "NAPO-BLA-W36", offerUpc: "810205998412", title: "Napoli Flat Sandal" },
    ];
    let n = 0;
    for (const s of samples) {
      await db.channelOffer.upsert({
        where: { connectionId_offerSku: { connectionId: id, offerSku: s.offerSku } },
        create: { tenantId: req.tenantId, connectionId: id, ...s },
        update: { ...s },
      });
      n++;
    }
    return { created: n };
  });
}

// --- Reconciliation (pull channel offers + match against catalog) ---
import { fetchMiraklOffers } from "../services/mirakl.js";

export async function channelReconcileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // Pull offers from the marketplace and store them
  app.post("/channels/:id/pull-offers", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({
      where: { id, tenantId: req.tenantId, type: "mirakl" },
    });
    if (!conn) return reply.code(404).send({ error: "Mirakl channel not found" });

    try {
      const offers = await fetchMiraklOffers(conn);
      for (const o of offers) {
        await db.channelOffer.upsert({
          where: { connectionId_offerSku: { connectionId: id, offerSku: o.offerSku } },
          create: { tenantId: req.tenantId, connectionId: id, offerSku: o.offerSku, offerUpc: o.offerUpc, title: o.title },
          update: { offerUpc: o.offerUpc, title: o.title },
        });
      }

      // Prune offers that no longer exist on the marketplace. Without this the
      // stored count only ever grows (old offers linger after they're removed).
      // Only runs on a fully successful pull - fetchMiraklOffers throws otherwise.
      const liveSkus = offers.map((o: any) => o.offerSku);
      const removed = liveSkus.length
        ? await db.channelOffer.deleteMany({
            where: { connectionId: id, offerSku: { notIn: liveSkus } },
          })
        : { count: 0 };

      return { pulled: offers.length, removed: removed.count };
    } catch (e: any) {
      if (String(e.message).startsWith("RATE_LIMIT:")) {
        return reply.code(429).send({ error: "Mirakl rate limit, try again shortly" });
      }
      return reply.code(400).send({ error: e.message });
    }
  });

  // Match summary: how many offers match the catalog by the channel's mode
  app.get("/channels/:id/reconcile", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });

    const offers = await db.channelOffer.findMany({ where: { connectionId: id } });
    const catalog = await db.catalogItem.findMany({ where: { tenantId: req.tenantId } });

    const bySku = new Map(catalog.map((c) => [c.sku, c]));
    const byUpc = new Map(catalog.filter((c) => c.barcode).map((c) => [c.barcode!, c]));

    const mode = conn.mappingMode;
    let matched = 0;
    const unmatched: any[] = [];

    for (const o of offers) {
      let hit = null;
      if (mode === "manual") hit = o.catalogItemId ? true : null;
      else if (mode === "auto_upc") hit = o.offerUpc ? byUpc.get(o.offerUpc) : null;
      else hit = bySku.get(o.offerSku); // auto_sku / full_catalog default by sku
      if (hit) matched++;
      else unmatched.push({ offerSku: o.offerSku, offerUpc: o.offerUpc, title: o.title });
    }

    return {
      mode,
      totalOffers: offers.length,
      matched,
      unmatched: unmatched.length,
      catalogSize: catalog.length,
      unmatchedSample: unmatched.slice(0, 50),
    };
  });
}

// --- Paginated reconcile list + bulk mapping ---
export async function channelReconcileExtraRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // Paginated offers list with match status
  app.get("/channels/:id/offers", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });

    const q = z.object({
      filter: z.enum(["all", "matched", "unmatched"]).default("all"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const offers = await db.channelOffer.findMany({ where: { connectionId: id }, orderBy: { offerSku: "asc" } });
    const catalog = await db.catalogItem.findMany({ where: { tenantId: req.tenantId } });
    const bySku = new Map(catalog.map((c) => [c.sku, c]));
    const byUpc = new Map(catalog.filter((c) => c.barcode).map((c) => [c.barcode!, c]));
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const mode = conn.mappingMode;

    const enriched = offers.map((o) => {
      let match: any = null;
      if (mode === "manual") match = o.catalogItemId ? byId.get(o.catalogItemId) : null;
      else if (mode === "auto_upc") match = o.offerUpc ? byUpc.get(o.offerUpc) : null;
      else match = bySku.get(o.offerSku);
      return {
        id: o.id, offerSku: o.offerSku, offerUpc: o.offerUpc, title: o.title,
        catalogItemId: o.catalogItemId, syncEnabled: o.syncEnabled,
        matched: !!match,
        matchedTo: match ? { sku: match.sku, title: match.title, inventory: match.inventory } : null,
      };
    });

    const filtered = q.filter === "all" ? enriched
      : q.filter === "matched" ? enriched.filter((e) => e.matched)
      : enriched.filter((e) => !e.matched);

    const total = filtered.length;
    const start = (q.page - 1) * q.pageSize;
    const rows = filtered.slice(start, start + q.pageSize);

    return { total, page: q.page, pageSize: q.pageSize, pages: Math.ceil(total / q.pageSize), rows };
  });

  // Bulk manual map: paste many identifiers, map matching offers to catalog items
  app.post("/channels/:id/bulk-map", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await db.connection.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conn) return reply.code(404).send({ error: "Not found" });

    const b = z.object({
      field: z.enum(["sku", "upc"]),
      identifiers: z.array(z.string().min(1)).min(1),
    }).parse(req.body);

    const catalog = await db.catalogItem.findMany({ where: { tenantId: req.tenantId } });
    const catBySku = new Map(catalog.map((c) => [c.sku, c]));
    const catByUpc = new Map(catalog.filter((c) => c.barcode).map((c) => [c.barcode!, c]));

    const offers = await db.channelOffer.findMany({ where: { connectionId: id } });
    const offerBySku = new Map(offers.map((o) => [o.offerSku, o]));
    const offerByUpc = new Map(offers.filter((o) => o.offerUpc).map((o) => [o.offerUpc!, o]));

    let mapped = 0;
    const noCatalog: string[] = [];   // on channel, but not in your catalog
    const notOnChannel: string[] = []; // not even an offer on this channel

    // de-dupe pasted identifiers
    const ids = Array.from(new Set(b.identifiers.map((x) => x.trim()).filter(Boolean)));

    // clear existing mappings on this channel so matched == exactly what you paste
    await db.channelOffer.updateMany({
      where: { connectionId: id },
      data: { catalogItemId: null },
    });

    for (const ident of ids) {
      const offer = b.field === "sku" ? offerBySku.get(ident) : offerByUpc.get(ident);
      if (!offer) { notOnChannel.push(ident); continue; }
      const cat = b.field === "sku" ? catBySku.get(ident) : catByUpc.get(ident);
      if (!cat) { noCatalog.push(ident); continue; }
      await db.channelOffer.update({ where: { id: offer.id }, data: { catalogItemId: cat.id } });
      mapped++;
    }

    return {
      submitted: ids.length,
      mapped,
      noCatalog: noCatalog.length,
      notOnChannel: notOnChannel.length,
      noCatalogSample: noCatalog.slice(0, 25),
      notOnChannelSample: notOnChannel.slice(0, 25),
    };
  });
}
