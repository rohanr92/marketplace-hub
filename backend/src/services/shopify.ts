import { decrypt } from "../lib/crypto.js";

type Conn = { baseUrl: string; apiKeyEnc: string };
const API_VERSION = "2025-10";

export async function shopifyGraphQL(conn: Conn, query: string, variables?: any) {
  const token = decrypt(conn.apiKeyEnc);
  const domain = conn.baseUrl.replace(/^https?:\/\//, "");
  const res = await fetch(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function testShopifyConnection(conn: Conn) {
  const data = await shopifyGraphQL(conn, `{ shop { name myshopifyDomain } }`);
  return { shopName: data?.shop?.name ?? "connected" };
}

// Pull all product variants with image, title, sku, barcode, price, inventory, description.
export async function fetchShopifyCatalog(conn: Conn) {
  const items: any[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: any = await shopifyGraphQL(
      conn,
      `query($cursor: String) {
        productVariants(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id sku barcode price title
            inventoryQuantity
            image { url }
            product { title descriptionHtml featuredImage { url } }
          }
        }
      }`,
      { cursor }
    );
    const conn2 = data.productVariants;
    for (const v of conn2.nodes) {
      items.push({
        shopifyVariantId: v.id,
        sku: v.sku || v.id,
        barcode: v.barcode || null,
        title: v.product?.title ? `${v.product.title} ${v.title !== "Default Title" ? "- " + v.title : ""}`.trim() : v.title,
        description: v.product?.descriptionHtml?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
        imageUrl: v.image?.url || v.product?.featuredImage?.url || null,
        price: parseFloat(v.price || "0"),
        inventory: v.inventoryQuantity ?? 0,
      });
    }
    if (!conn2.pageInfo.hasNextPage) break;
    cursor = conn2.pageInfo.endCursor;
  }
  return items;
}

// Fetch specific variants by a list of UPCs or SKUs.
// We query in small OR-batches, then verify the exact match in code
// (Shopify's barcode search can be fuzzy on long numbers).
export async function fetchShopifyByIdentifiers(
  conn: Conn,
  identifiers: string[],
  field: "barcode" | "sku"
) {
  const found: any[] = [];
  const matched = new Set<string>();
  const batchSize = 20;

  for (let i = 0; i < identifiers.length; i += batchSize) {
    const batch = identifiers.slice(i, i + batchSize);
    const queryStr = batch.map((v) => `${field}:${v}`).join(" OR ");

    const data: any = await shopifyGraphQL(
      conn,
      `query($q: String!) {
        productVariants(first: 100, query: $q) {
          nodes {
            id sku barcode price title inventoryQuantity
            image { url }
            product { title descriptionHtml featuredImage { url } }
          }
        }
      }`,
      { q: queryStr }
    );

    for (const v of data.productVariants.nodes) {
      const key = field === "barcode" ? v.barcode : v.sku;
      // exact-match guard against fuzzy hits
      if (!batch.includes(key)) continue;
      matched.add(key);
      found.push({
        shopifyVariantId: v.id,
        sku: v.sku || v.id,
        barcode: v.barcode || null,
        title: v.product?.title
          ? `${v.product.title} ${v.title !== "Default Title" ? "- " + v.title : ""}`.trim()
          : v.title,
        description: v.product?.descriptionHtml?.replace(/<[^>]+>/g, "").slice(0, 300) || null,
        imageUrl: v.image?.url || v.product?.featuredImage?.url || null,
        price: parseFloat(v.price || "0"),
        inventory: v.inventoryQuantity ?? 0,
      });
    }
  }

  const notFound = identifiers.filter((id) => !matched.has(id));
  return { found, notFound };
}

// List all active locations on the store (id + name + address).
export async function fetchShopifyLocations(conn: { baseUrl: string; apiKeyEnc: string }) {
  const data: any = await shopifyGraphQL(
    conn,
    `{ locations(first: 50, includeInactive: false) {
        nodes { id name isActive address { formatted } }
      } }`
  );
  return data.locations.nodes.map((l: any) => ({
    id: l.id,
    name: l.name,
    isActive: l.isActive,
    address: (l.address?.formatted ?? []).join(", "),
  }));
}

// Auto-register the inventory + fulfillment webhooks for a newly connected store.
// Idempotent: checks existing subscriptions first so it never duplicates.
export async function registerShopifyWebhooks(
  conn: { baseUrl: string; apiKeyEnc: string },
  publicBackendUrl: string
): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
  const wanted = [
    { topic: "INVENTORY_LEVELS_UPDATE", uri: `${publicBackendUrl}/webhooks/shopify/inventory` },
    { topic: "FULFILLMENT_CREATE", uri: `${publicBackendUrl}/webhooks/shopify/fulfillment` },
  ];

  // 1) list existing subscriptions so we don't duplicate
  const existingData: any = await shopifyGraphQL(
    conn,
    `query {
      webhookSubscriptions(first: 100) {
        edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } }
      }
    }`
  );
  const existingSubs = (existingData?.webhookSubscriptions?.edges ?? []).map((e: any) => ({
    topic: e.node.topic,
    url: e.node.endpoint?.callbackUrl ?? "",
  }));

  const created: string[] = [];
  const existing: string[] = [];
  const errors: string[] = [];

  for (const w of wanted) {
    const already = existingSubs.find((x: any) => x.topic === w.topic && x.url === w.uri);
    if (already) { existing.push(w.topic); continue; }
    try {
      const data: any = await shopifyGraphQL(
        conn,
        `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }`,
        { topic: w.topic, sub: { uri: w.uri, format: "JSON" } }
      );
      const errs = data?.webhookSubscriptionCreate?.userErrors ?? [];
      if (errs.length) errors.push(`${w.topic}: ${JSON.stringify(errs)}`);
      else created.push(w.topic);
    } catch (e: any) {
      errors.push(`${w.topic}: ${e.message}`);
    }
  }
  return { created, existing, errors };
}
