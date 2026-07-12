import { FastifyInstance } from "fastify";
import { db } from "../lib/db.js";
import { authGuard } from "../middleware/authGuard.js";
import { fetchMiraklReturns } from "../services/mirakl.js";

const STATES = ["OPEN", "IN_PROGRESS", "RECEIVED", "CLOSED", "REFUSED"];

export async function returnsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /returns -> real returns from ALL connected Mirakl marketplaces.
  // Fetches each state separately (return_state filter works server-side), so counts
  // are accurate and we don't miss returns hidden beyond a page cap.
  app.get("/returns", async (req) => {
    const conns = await db.connection.findMany({
      where: { tenantId: req.tenantId, type: "mirakl", active: true },
      select: { id: true, label: true, baseUrl: true, apiKeyEnc: true },
    });

    const rows: any[] = [];
    const stateCounts: Record<string, number> = {};
    const channelStatus: any[] = [];

    for (const conn of conns) {
      const c = { baseUrl: conn.baseUrl, apiKeyEnc: conn.apiKeyEnc };
      let supported = true;
      let channelCount = 0;

      // Query each state separately so we get all returns per state (not an arbitrary slice).
      for (const state of STATES) {
        try {
          const r = await fetchMiraklReturns(c, { state });
          if (r.unsupported) { supported = false; break; }
          for (const ret of r.data) {
            const st = ret.state ?? state;
            stateCounts[st] = (stateCounts[st] ?? 0) + 1;
            channelCount++;
            const line = (ret.return_lines && ret.return_lines[0]) || {};
            rows.push({
              id: ret.id,
              channel: conn.label,
              orderId: ret.order_id,
              orderCommercialId: ret.order_commercial_id,
              marketplaceUrl: `${conn.baseUrl}/mmp/shop/order/${ret.order_commercial_id ?? ret.order_id}`,
              state: st,
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
          // rate limit or transient error on one state - skip it, keep the rest
          if (String(e.message).startsWith("RATE_LIMIT")) continue;
        }
      }

      channelStatus.push(supported
        ? { channel: conn.label, supported: true, count: channelCount }
        : { channel: conn.label, supported: false });
    }

    // newest first
    rows.sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""));

    return { count: rows.length, stateCounts, channelStatus, returns: rows };
  });
}
