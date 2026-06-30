import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { downloadMiraklDocument } from "../services/mirakl.js";

export async function slipRoutes(app: FastifyInstance) {
  // Public download: streams the Mirakl packing slip PDF with auth applied server-side.
  // Linked from Shopify order notes so warehouse staff can click and download directly.
  // TEMP debug: download a doc by id using the first Mirakl connection. Remove after testing.
  app.get<{ Params: { docId: string } }>(
    "/orders/download-slip-test/:docId",
    async (req, reply) => {
      const conn: any = await db.connection.findFirst({ where: { type: "mirakl" } });
      if (!conn) { reply.code(404).send("no mirakl connection"); return; }
      try {
        const { buffer, contentType, filename } = await downloadMiraklDocument(
          { baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc },
          req.params.docId
        );
        reply
          .header("Content-Type", contentType)
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(buffer);
      } catch (e) {
        reply.code(502).send("Could not fetch: " + (e instanceof Error ? e.message : String(e)));
      }
    }
  );

  app.get<{ Params: { orderId: string; docId: string } }>(
    "/orders/download-slip/:orderId/:docId",
    async (req, reply) => {
      const { orderId, docId } = req.params;

      const order = await db.order.findUnique({
        where: { id: orderId },
        include: { connection: true },
      });
      if (!order || !order.connection) {
        reply.code(404).send("Order not found");
        return;
      }
      const conn = order.connection as any;
      if (conn.type !== "mirakl" || !conn.apiKeyEnc) {
        reply.code(400).send("Not a Mirakl order");
        return;
      }

      try {
        const { buffer, contentType, filename } = await downloadMiraklDocument(
          { baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc },
          docId
        );
        reply
          .header("Content-Type", contentType)
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(buffer);
      } catch (e: any) {
        reply.code(502).send(`Could not fetch document: ${e.message}`);
      }
    }
  );
}
