import { config } from "../lib/config.js";
import { db } from "../lib/db.js";
import { shopifyGraphQL, fetchShopifyByIdentifiers } from "./shopify.js";
import { fetchMiraklOrderById, listMiraklOrderDocuments, fetchOfferUpcByProductSku } from "./mirakl.js";

const PUSHABLE = new Set(["SHIPPING"]);

function mapAddress(cust: any, addr: any) {
  if (!addr) return null;
  return {
    firstName: addr.firstname ?? cust?.firstname ?? "",
    lastName: addr.lastname ?? cust?.lastname ?? "",
    address1: addr.street_1 ?? addr.street ?? "",
    address2: addr.street_2 ?? "",
    city: addr.city ?? "",
    province: addr.state ?? "",
    zip: addr.zip_code ?? addr.zip ?? "",
    country: addr.country_iso_code ?? addr.country ?? "",
    phone: addr.phone ?? cust?.phone ?? "",
  };
}

export async function pushOrderToShopify(orderRowId: string, tenantId: string) {
  const order = await db.order.findFirst({ where: { id: orderRowId, tenantId } });
  if (!order) throw new Error("Order not found");
  if (order.shopifyOrderId) return { skipped: true, reason: "already in Shopify", shopifyOrderId: order.shopifyOrderId };

  const miraklConn = await db.connection.findUnique({ where: { id: order.connectionId } });
  if (!miraklConn) throw new Error("Mirakl connection missing");

  // Re-fetch live to get current state + customer + shipping (released at SHIPPING).
  const raw = await fetchMiraklOrderById(miraklConn, order.channelOrderId);
  if (!raw) throw new Error("Could not re-fetch order from Mirakl");
  if (!PUSHABLE.has(raw.order_state)) {
    return { skipped: true, reason: `state ${raw.order_state} not pushable (needs SHIPPING)` };
  }

  const shopifyConn = await db.connection.findFirst({ where: { tenantId, type: "shopify", active: true } });
  if (!shopifyConn) throw new Error("No active Shopify connection");

  const cust = raw.customer ?? {};
  const shipAddr = mapAddress(cust, raw.customer?.shipping_address);
  const billAddr = mapAddress(cust, raw.customer?.billing_address) ?? shipAddr;

  // Resolve each line to a Shopify variant by SKU then UPC.
  const lines = raw.order_lines ?? [];
  const lineItems: any[] = [];
  const unmatched: string[] = [];
  for (const l of lines) {
    const sku = (l.offer_sku ?? l.product_shop_sku ?? l.product_sku ?? "").trim();
    const qty = l.quantity ?? 1;
    let variantId: string | null = null;

    // 1. Try offer SKU exact (case-insensitive via Shopify).
    if (sku) {
      const bySku = await fetchShopifyByIdentifiers(shopifyConn, [sku], "sku");
      if (bySku.found[0]) variantId = bySku.found[0].shopifyVariantId;
    }

    // 2. Try UPC/barcode. Each marketplace exposes it differently:
    //    - Kohl's: product_sku IS the UPC (e.g. "810205990132")
    //    - Macy's: UPC is the prefix of product_sku before "_" (e.g. "810205994871_...")
    //    - Nordstrom: UPC only on the OFFER (product_references), product_sku is internal id
    if (!variantId) {
      const candidates: string[] = [];
      // 2a. UPC on the order line itself (rare, but check)
      const refs = l.product_references ?? [];
      const refUpc = refs.find((r: any) => /UPC|EAN|GTIN|UID_CODE/i.test(r.reference_type ?? r.type ?? ""))?.reference;
      if (refUpc) candidates.push(String(refUpc).trim());
      // 2b. product_sku with "_" -> prefix is UPC (Macy's)
      if (l.product_sku && String(l.product_sku).includes("_")) {
        candidates.push(String(l.product_sku).split("_")[0].trim());
      }
      // 2c. product_sku directly as barcode (Kohl's: product_sku is the UPC)
      if (l.product_sku && !String(l.product_sku).includes("_")) {
        candidates.push(String(l.product_sku).trim());
      }
      // Try all candidates gathered so far as barcodes
      for (const upc of candidates) {
        if (!upc) continue;
        const byUpc = await fetchShopifyByIdentifiers(shopifyConn, [upc], "barcode");
        if (byUpc.found[0]) { variantId = byUpc.found[0].shopifyVariantId; break; }
      }
      // 2d. Last resort: fetch the OFFER and read its UPC (Nordstrom path).
      //     Only if still unmatched and we have a product_sku to look up.
      if (!variantId && l.product_sku) {
        const offerUpc = await fetchOfferUpcByProductSku(miraklConn as any, String(l.product_sku).trim());
        if (offerUpc) {
          const byOfferUpc = await fetchShopifyByIdentifiers(shopifyConn, [offerUpc], "barcode");
          if (byOfferUpc.found[0]) variantId = byOfferUpc.found[0].shopifyVariantId;
        }
      }
    }

    // 3. Fall back to the local catalog mapping (ChannelOffer.catalogItemId -> CatalogItem).
    if (!variantId && sku) {
      const offer = await db.channelOffer.findFirst({
        where: { connectionId: order.connectionId, offerSku: sku },
      });
      if (offer?.catalogItemId) {
        const ci = await db.catalogItem.findUnique({ where: { id: offer.catalogItemId } });
        if (ci?.shopifyVariantId) variantId = ci.shopifyVariantId;
      }
    }

    if (variantId) lineItems.push({ variantId, quantity: qty, requiresShipping: true });
    else unmatched.push(sku || "(no sku)");
  }

  if (lineItems.length === 0) throw new Error(`No line items matched Shopify variants. Unmatched: ${unmatched.join(", ")}`);

  // Packing slip reference. Mirakl returns file_name + id (no public URL); the PDF is
  // API-gated, so we store a human reference. The order-number deep link opens the
  // Mirakl order where the slip downloads.
  const docs = await listMiraklOrderDocuments(miraklConn, order.channelOrderId);
  const slipDoc = docs.find((d: any) => /DELIVERY|PACKING|SLIP|INVOICE/i.test(d.type ?? d.document_type ?? "")) ?? docs[0] ?? null;
  const slip = slipDoc ? (slipDoc.file_name ?? `document-${slipDoc.id}`) : null;
  const slipUrl = slipDoc ? `${config.publicUrl}/orders/download-slip/${order.id}/${slipDoc.id}` : null;

  const notifEmail = raw.customer_notification_email ?? null;
  const realEmail = raw.customer?.customer_id && /@/.test(raw.customer.customer_id) ? raw.customer.customer_id : null;
  const placeholderEmail = notifEmail ?? `mirakl-${order.channelOrderId}@menina-step.local`;
  const attrs = [{ key: "mirakl_order_id", value: order.channelOrderId }, { key: "channel", value: miraklConn.label }];
  if (realEmail) attrs.push({ key: "customer_email", value: realEmail });
  if (notifEmail) attrs.push({ key: "mirakl_relay_email", value: notifEmail });
  if (slip) attrs.push({ key: "packing_slip", value: slip });
  if (slipUrl) attrs.push({ key: "packing_slip_url", value: slipUrl });

  const noteLines = [`Mirakl order ${order.channelOrderId} (${miraklConn.label})`];
  if (realEmail) noteLines.push(`Customer email: ${realEmail}`);
  if (notifEmail) noteLines.push(`Mirakl relay email: ${notifEmail}`);
  if (slip) noteLines.push(`Packing slip: ${slip}`);
  if (slipUrl) noteLines.push(`Packing slip download: ${slipUrl}`);
  if (unmatched.length) noteLines.push(`UNMATCHED lines: ${unmatched.join(", ")}`);

  const shipTitle = raw.shipping_type_label ?? raw.shipping_type_code ?? "Shipping";
  const shipPrice = (raw.shipping_price ?? 0).toFixed(2);

  const input: any = {
    email: placeholderEmail,
    financialStatus: "PAID",
    shippingLines: [{ title: shipTitle, priceSet: { shopMoney: { amount: shipPrice, currencyCode: raw.currency_iso_code ?? "USD" } } }],
    lineItems,
    tags: ["mirakl", miraklConn.label],
    note: noteLines.join("\n"),
    customAttributes: attrs,
  };
  if (shipAddr) input.shippingAddress = shipAddr;
  if (billAddr) input.billingAddress = billAddr;

  const data: any = await shopifyGraphQL(
    shopifyConn,
    `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id name }
        userErrors { field message }
      }
    }`,
    { order: input, options: { inventoryBehaviour: "DECREMENT_IGNORING_POLICY" } }
  );
  const errs = data?.orderCreate?.userErrors ?? [];
  if (errs.length) throw new Error("Shopify orderCreate: " + JSON.stringify(errs));
  const created = data.orderCreate.order;

  await db.order.update({
    where: { id: order.id },
    data: { shopifyOrderId: created.id, state: "pushed_to_shopify" },
  });

  return { skipped: false, shopifyOrderId: created.id, shopifyName: created.name, unmatched };
}
