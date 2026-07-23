import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { fetchShopifyCatalog, fetchShopifyByIdentifiers } from "../services/shopify.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/catalog", async (req) => {
    return db.catalogItem.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
  });

  // Import ALL products from a Shopify connection
  app.post("/catalog/import", async (req, reply) => {
    const body = z.object({ connectionId: z.string() }).parse(req.body);
    const conn = await db.connection.findFirst({
      where: { id: body.connectionId, tenantId: req.tenantId, type: "shopify" },
    });
    if (!conn) return reply.code(404).send({ error: "Shopify connection not found" });

    let imported = 0;
    try {
      const items = await fetchShopifyCatalog(conn);
      for (const it of items) {
        await db.catalogItem.upsert({
          where: { tenantId_sku: { tenantId: req.tenantId, sku: it.sku } },
          create: { ...it, tenantId: req.tenantId, source: "shopify" },
          update: {
            barcode: it.barcode, title: it.title, description: it.description,
            imageUrl: it.imageUrl, price: it.price, inventory: it.inventory,
            shopifyVariantId: it.shopifyVariantId, source: "shopify",
          },
        });
        imported++;
      }
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
    return { imported };
  });

  // Import ONLY specific items by a list of UPCs or SKUs
  app.post("/catalog/import-by-ids", async (req, reply) => {
    const body = z.object({
      connectionId: z.string(),
      field: z.enum(["barcode", "sku"]),
      identifiers: z.array(z.string().min(1)).min(1),
    }).parse(req.body);

    const conn = await db.connection.findFirst({
      where: { id: body.connectionId, tenantId: req.tenantId, type: "shopify" },
    });
    if (!conn) return reply.code(404).send({ error: "Shopify connection not found" });

    try {
      const { found, notFound } = await fetchShopifyByIdentifiers(conn, body.identifiers, body.field);
      let imported = 0;
      for (const it of found) {
        await db.catalogItem.upsert({
          where: { tenantId_sku: { tenantId: req.tenantId, sku: it.sku } },
          create: { ...it, tenantId: req.tenantId, source: "shopify", tracked: true },
          update: {
            barcode: it.barcode, title: it.title, description: it.description,
            imageUrl: it.imageUrl, price: it.price, inventory: it.inventory,
            shopifyVariantId: it.shopifyVariantId, source: "shopify", tracked: true,
          },
        });
        imported++;
      }
      return { imported, notFound };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // Re-sync tracked items from Shopify (pull latest UPC + inventory).
  // This is what keeps the catalog current when Shopify changes.
  app.post("/catalog/refresh", async (req, reply) => {
    const conn = await db.connection.findFirst({
      where: { tenantId: req.tenantId, type: "shopify" },
    });
    if (!conn) return reply.code(404).send({ error: "No Shopify connection" });

    const tracked = await db.catalogItem.findMany({
      where: { tenantId: req.tenantId, tracked: true, source: "shopify" },
    });
    if (tracked.length === 0) return { refreshed: 0 };

    // Prefer matching by SKU (stable), fall back handled by exact-match guard.
    const skus = tracked.map((t) => t.sku);
    try {
      const { found } = await fetchShopifyByIdentifiers(conn, skus, "sku");
      let refreshed = 0;
      for (const it of found) {
        await db.catalogItem.updateMany({
          where: { tenantId: req.tenantId, sku: it.sku },
          data: { barcode: it.barcode, inventory: it.inventory, price: it.price, title: it.title, imageUrl: it.imageUrl },
        });
        refreshed++;
      }
      return { refreshed };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post("/catalog", async (req) => {
    const b = z.object({
      sku: z.string().min(1), barcode: z.string().optional(),
      title: z.string().min(1), description: z.string().optional(),
      imageUrl: z.string().optional(), price: z.number().default(0),
      inventory: z.number().default(0),
    }).parse(req.body);
    return db.catalogItem.upsert({
      where: { tenantId_sku: { tenantId: req.tenantId, sku: b.sku } },
      create: { ...b, tenantId: req.tenantId, source: "manual" },
      update: { ...b },
    });
  });

  // Toggle tracked on/off for a catalog item
  app.patch("/catalog/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await db.catalogItem.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!item) return reply.code(404).send({ error: "Not found" });
    const b = z.object({ tracked: z.boolean() }).parse(req.body);
    const updated = await db.catalogItem.update({ where: { id }, data: { tracked: b.tracked } });
    return { id: updated.id, tracked: updated.tracked };
  });

  app.delete("/catalog/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await db.catalogItem.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!item) return reply.code(404).send({ error: "Not found" });
    await db.catalogItem.delete({ where: { id } });
    return { ok: true };
  });

  // Bulk delete catalog items (tenant-scoped). Pass { ids: [...] } or { all: true }.
  app.post("/catalog/bulk-delete", async (req, reply) => {
    const body = req.body as { ids?: string[]; all?: boolean };
    if (body?.all) {
      const r = await db.catalogItem.deleteMany({ where: { tenantId: req.tenantId } });
      return { deleted: r.count };
    }
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) return reply.code(400).send({ error: "No ids provided" });
    const r = await db.catalogItem.deleteMany({ where: { tenantId: req.tenantId, id: { in: ids } } });
    return { deleted: r.count };
  });

  app.post("/catalog/sample", async (req) => {
    const samples = [
      { sku: "VERA-TAN-W36", barcode: "8439990001", title: "Vera Flat Sandal - W36", price: 89, inventory: 12, imageUrl: "", description: "Handcrafted Spanish leather flat sandal." },
      { sku: "NAPO-BLA-W36", barcode: "8439990002", title: "Napoli Flat Sandal - W36", price: 124, inventory: 7, imageUrl: "", description: "Premium leather flat sandal." },
      { sku: "JIHILA-BLA-W39", barcode: "8439990003", title: "Jimena High Laces Espadrille - W39", price: 156, inventory: 3, imageUrl: "", description: "Espadrille with high laces." },
    ];
    let n = 0;
    for (const s of samples) {
      await db.catalogItem.upsert({
        where: { tenantId_sku: { tenantId: req.tenantId, sku: s.sku } },
        create: { ...s, tenantId: req.tenantId, source: "manual" },
        update: { ...s },
      });
      n++;
    }
    return { created: n };
  });
}
