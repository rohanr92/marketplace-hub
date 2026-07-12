import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { fetchMiraklReturns } from "../services/mirakl.js";

export async function returnsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /returns -> real returns from ALL connected Mirakl marketplaces.
  // Query: ?state=OPEN|IN_PROGRESS|RECEIVED|CLOSED (optional), ?max=50 (per channel)
  app.get("/returns", async (req) => {
    const q = req.query as any;
    const stateFilter: string | undefined = q.state && q.state !== "ALL" ? q.state : undefined;
    const max = Math.min(Number(q.max) || 100, 100);

    const conns = await db.connection.findMany({
      where: { tenantId: req.tenantId, type: "mirakl", active: true },
      select: { id: true, label: true, baseUrl: true, apiKeyEnc: true },
    });

    const rows: any[] = [];
    const stateCounts: Record<string, number> = {};
    const channelStatus: any[] = [];

    for (const conn of conns) {
      try {
        const r = await fetchMiraklReturns(
          { baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc },
          { max, state: stateFilter }
        );
        if (r.unsupported) {
          channelStatus.push({ channel: conn.label, supported: false });
          continue;
        }
        channelStatus.push({ channel: conn.label, supported: true, count: r.data.length });

        for (const ret of r.data) {
          const state = ret.state ?? "UNKNOWN";
          stateCounts[state] = (stateCounts[state] ?? 0) + 1;
          const line = (ret.return_lines && ret.return_lines[0]) || {};
          rows.push({
            id: ret.id,
            channel: conn.label,
            orderId: ret.order_id,
            orderCommercialId: ret.order_commercial_id,
            marketplaceUrl: `${conn.baseUrl}/mmp/shop/order/${ret.order_commercial_id ?? ret.order_id}`,
            state,
            reasonCode: ret.reason_code ?? line.reason_code ?? null,
            quantity: (ret.return_lines ?? []).reduce((s: number, l: any) => s + (l.quantity ?? 0), 0),
            rma: ret.rma,
            dateCreated: ret.date_created,
            lastUpdated: ret.last_updated,
            trackingNumber: ret.tracking?.tracking_number ?? null,
            trackingUrl: ret.tracking?.tracking_url ?? null,
            carrier: ret.tracking?.carrier_name ?? null,
            description: ret.description ?? null,
          });
        }
      } catch (e: any) {
        channelStatus.push({ channel: conn.label, supported: true, error: e.message });
      }
    }

    // newest first
    rows.sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""));

    return {
      count: rows.length,
      stateCounts,
      channelStatus,
      returns: rows,
    };
  });
}
