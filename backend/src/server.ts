import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./lib/config.js";
import { db } from "./lib/db.js";
import { verifyToken } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { connectionRoutes } from "./routes/connections.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { returnsRoutes } from "./routes/returns.js";
import { messagesRoutes } from "./routes/messages.js";
import { settingsRoutes } from "./routes/settings.js";
import { adminRoutes } from "./routes/admin.js";
import { orderRoutes } from "./routes/orders.js";
import { catalogRoutes } from "./routes/catalog.js";
import { channelSettingsRoutes, channelReconcileRoutes, channelReconcileExtraRoutes } from "./routes/channelSettings.js";
import { syncRoutes } from "./routes/sync.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { ordersListRoutes } from "./routes/ordersList.js";
import { orderActionRoutes } from "./routes/orderActions.js";

const app = Fastify({ logger: true });

app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, body, done) => {
    if (!body || (body as string).length === 0) return done(null, {});
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error, undefined); }
  }
);

// Allow the frontend origin. In dev, FRONTEND_URL is unset so we allow localhost.
// In production, set FRONTEND_URL to your real frontend domain (e.g. https://app.yourdomain.com).
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ["http://localhost:5173", "http://localhost:5174"];
await app.register(cors, {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.get("/health", async () => {
  const tenants = await db.tenant.count();
  return { ok: true, tenants };
});

await app.register(authRoutes);
await app.register(connectionRoutes);
await app.register(analyticsRoutes);
await app.register(returnsRoutes);
await app.register(messagesRoutes);
await app.register(settingsRoutes);
await app.register(adminRoutes);

// READ_ONLY_BLOCK - self-contained: decodes token directly so it does not depend
// on per-route authGuard hook ordering. Runs as an onRequest hook (earliest phase).
app.addHook("onRequest", async (req: any, reply: any) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  if (req.url.startsWith("/auth")) return; // login/signup must work
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return; // authGuard will reject later
  try {
    const payload: any = verifyToken(header.slice(7));
    if (payload.readOnly) {
      return reply.code(403).send({ error: "Read-only impersonation: actions are disabled" });
    }
  } catch {
    return; // invalid token - let authGuard handle the 401
  }
});

await app.register(orderRoutes);
await app.register(catalogRoutes);
await app.register(channelSettingsRoutes);
await app.register(channelReconcileRoutes);
await app.register(channelReconcileExtraRoutes);
await app.register(syncRoutes);
await app.register(webhookRoutes);
await app.register(ordersListRoutes);
await app.register(orderActionRoutes);

app.listen({ port: config.port, host: "0.0.0.0" }, (err, addr) => {
  if (err) { app.log.error(err); process.exit(1); }
  console.log(`API running at ${addr}`);
});
