import { FastifyInstance } from "fastify";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../lib/db.js";
import { config } from "../lib/config.js";
import { encrypt } from "../lib/crypto.js";
import { verifyToken } from "../lib/auth.js";
import { registerShopifyWebhooks } from "../services/shopify.js";
import { refreshCatalogFromShopify } from "../services/syncEngine.js";

function normShop(s: string) {
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
}

// Verify the HMAC Shopify puts on OAuth callback query params.
function verifyQueryHmac(query: Record<string, any>): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", config.shopifyClientSecret)
    .update(message)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(hmac)));
  } catch {
    return false;
  }
}

export async function shopifyOAuthRoutes(app: FastifyInstance) {
  // STEP 1: brand (logged into Hub) starts the install.
  // The Hub frontend opens: {API}/shopify/install?shop=brand.myshopify.com&token={hubJWT}
  app.get("/shopify/install", async (req, reply) => {
    const q = req.query as { shop?: string; token?: string };
    if (!config.shopifyClientId) {
      return reply.code(500).send("Shopify app not configured");
    }
    if (!q.shop) return reply.code(400).send("Missing shop");
    // Authenticate the Hub user from the token query param (browser redirect can't send headers).
    let tenantId: string;
    try {
      const payload = verifyToken(q.token ?? "");
      tenantId = payload.tenantId;
    } catch {
      return reply.code(401).send("Invalid or missing Hub token");
    }
    const shop = normShop(q.shop);
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return reply.code(400).send("Invalid shop domain");
    }
    // state carries tenantId + shop, signed + short-lived (CSRF + identity).
    const state = jwt.sign({ tenantId, shop }, config.jwtSecret, { expiresIn: "10m" });
    const redirectUri = `${config.publicUrl}/shopify/callback`;
    const authUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(config.shopifyClientId)}` +
      `&scope=${encodeURIComponent(config.shopifyAppScopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;
    return reply.redirect(authUrl);
  });

  // STEP 2: Shopify redirects here after the brand approves. No Hub auth (Shopify calls it).
  app.get("/shopify/callback", async (req, reply) => {
    const q = req.query as Record<string, any>;
    const { shop, code, state } = q;
    if (!shop || !code || !state) return reply.code(400).send("Missing params");

    // 1) verify Shopify's HMAC on the query
    if (!verifyQueryHmac(q)) return reply.code(401).send("Invalid HMAC");

    // 2) verify state (CSRF) and extract tenantId + shop
    let tenantId: string;
    let stateShop: string;
    try {
      const decoded = jwt.verify(String(state), config.jwtSecret) as any;
      tenantId = decoded.tenantId;
      stateShop = decoded.shop;
    } catch {
      return reply.code(401).send("Invalid state");
    }
    const shopDomain = normShop(String(shop));
    if (shopDomain !== stateShop) return reply.code(401).send("Shop mismatch");

    // 3) exchange the code for an offline access token
    let accessToken: string;
    try {
      const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.shopifyClientId,
          client_secret: config.shopifyClientSecret,
          code: String(code),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        app.log.error(`[oauth] token exchange failed ${res.status}: ${t}`);
        return reply.code(502).send("Token exchange failed");
      }
      const json: any = await res.json();
      accessToken = json.access_token;
      if (!accessToken) return reply.code(502).send("No access token returned");
    } catch (e: any) {
      app.log.error(`[oauth] token exchange error: ${e.message}`);
      return reply.code(502).send("Token exchange error");
    }

    // 4) upsert the Shopify connection under this tenant
    const existing = await db.connection.findFirst({
      where: { tenantId, type: "shopify", baseUrl: shopDomain },
    });
    let connId: string;
    if (existing) {
      await db.connection.update({
        where: { id: existing.id },
        data: { apiKeyEnc: encrypt(accessToken), active: true },
      });
      connId = existing.id;
    } else {
      const created = await db.connection.create({
        data: {
          tenantId,
          type: "shopify",
          label: shopDomain.replace(".myshopify.com", ""),
          baseUrl: shopDomain,
          apiKeyEnc: encrypt(accessToken),
        },
      });
      connId = created.id;
    }

    // 5) pull catalog + register webhooks (best-effort, don't block the redirect on errors)
    try {
      await refreshCatalogFromShopify(tenantId);
    } catch (e: any) {
      app.log.error(`[oauth] catalog pull failed: ${e.message}`);
    }
    try {
      await registerShopifyWebhooks(
        { baseUrl: shopDomain, apiKeyEnc: encrypt(accessToken) },
        config.publicUrl
      );
    } catch (e: any) {
      app.log.error(`[oauth] webhook registration failed: ${e.message}`);
    }

    // 6) send the brand back to the Hub
    return reply.redirect(`${config.frontendUrl}/connections?shopify=connected`);
  });
}
