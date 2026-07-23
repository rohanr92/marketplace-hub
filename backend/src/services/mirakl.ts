import { decrypt } from "../lib/crypto.js";

type Conn = { baseUrl: string; apiKeyEnc: string };

function authHeaders(conn: Conn) {
  return { Authorization: decrypt(conn.apiKeyEnc), Accept: "application/json" };
}

export async function testMiraklConnection(conn: Conn) {
  const res = await fetch(`${conn.baseUrl}/api/account`, { headers: authHeaders(conn) });
  if (!res.ok) throw new Error(`Mirakl returned HTTP ${res.status}`);
  const data: any = await res.json();
  return { shopName: data?.shop_name ?? data?.name ?? "connected" };
}

// OR11 - list orders, filtered by update-date window.
// Mirakl has no seller webhooks, so we poll. Returns raw order objects.
export async function fetchMiraklOrders(conn: Conn, sinceISO?: string) {
  const params = new URLSearchParams({ max: "100" });
  if (sinceISO) {
    params.set("start_update_date", sinceISO);
    params.set("end_update_date", new Date().toISOString());
  }
  const res = await fetch(`${conn.baseUrl}/api/orders?${params}`, {
    headers: authHeaders(conn),
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "60");
    throw new Error(`RATE_LIMIT:${retry}`);
  }
  if (!res.ok) throw new Error(`Mirakl orders HTTP ${res.status}`);
  const data: any = await res.json();
  return (data?.orders ?? []) as any[];
}

// Map Mirakl's raw state codes to clean platform statuses.
export function mapMiraklState(raw: string): string {
  switch (raw) {
    case "STAGING":
    case "WAITING_ACCEPTANCE":
      return "awaiting_acceptance";
    case "WAITING_DEBIT":
    case "WAITING_DEBIT_PAYMENT":
      return "payment_pending";
    case "SHIPPING":
      return "to_ship";
    case "SHIPPED":
      return "shipped";
    case "TO_COLLECT":
      return "to_collect";
    case "RECEIVED":
      return "delivered";
    case "CLOSED":
      return "closed";
    case "REFUSED":
      return "refused";
    case "CANCELED":
      return "canceled";
    default:
      return raw.toLowerCase();
  }
}

// Normalize a raw Mirakl order into our DB shape.
export function normalizeMiraklOrder(raw: any) {
  const lines = (raw.order_lines ?? []).map((l: any) => ({
    sku: l.offer_sku ?? l.product_sku ?? "",
    title: l.product_title ?? "",
    qty: l.quantity ?? 1,
    price: l.total_price ?? l.price ?? 0,
  }));
  const cust = raw.customer ?? {};
  return {
    channelOrderId: raw.order_id,
    rawState: raw.order_state,
    state: mapMiraklState(raw.order_state),
    customerName: [cust.firstname, cust.lastname].filter(Boolean).join(" ") || null,
    totalPrice: raw.total_price ?? raw.price ?? 0,
    channelCreatedAt: raw.created_date ? new Date(raw.created_date) : null,
    itemsJson: JSON.stringify(lines),
  };
}

// OF21 - list all offers for the shop. Paginates via offset.
// Returns offer_sku, upc (from product_references), title, quantity, active.
export async function fetchMiraklOffers(conn: { baseUrl: string; apiKeyEnc: string }) {
  const apiKey = decrypt(conn.apiKeyEnc);
  const all: any[] = [];
  let offset = 0;
  const max = 100;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (true) {
    let data: any = null;

    // Retry THIS page on 429 instead of aborting the whole pull (which used to
    // restart from offset 0 and trip the limit again immediately).
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${conn.baseUrl}/api/offers?max=${max}&offset=${offset}`, {
        headers: { Authorization: apiKey, Accept: "application/json" },
      });
      if (res.status === 429) {
        const retry = Math.min(Number(res.headers.get("Retry-After") ?? "20") || 20, 90);
        if (attempt === 5) throw new Error(`RATE_LIMIT:${retry}`);
        await sleep(retry * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Mirakl OF21 HTTP ${res.status}`);
      data = await res.json();
      break;
    }
    if (!data) throw new Error("Mirakl OF21: no response");

    const offers = data?.offers ?? [];
    for (const o of offers) {
      const refs = o.product_references ?? [];
      const upcRef = refs.find((r: any) =>
        /UPC|EAN|GTIN|UID_CODE/i.test(r.reference_type ?? r.type ?? "")
      ) ?? refs[0];
      all.push({
        offerSku: o.shop_sku ?? String(o.offer_id),
        offerUpc: upcRef?.reference ?? null,
        title: o.product_title ?? null,
        quantity: o.quantity ?? 0,
        active: o.active ?? true,
      });
    }

    const total = data?.total_count ?? all.length;
    offset += max;
    if (offset >= total || offers.length === 0) break;

    // Pace requests so a large catalog doesn't trip the rate limit.
    await sleep(500);
  }
  return all;
}

// STO01 - import a stock file (multipart CSV). Updates ONLY stock, nothing else.
// CSV format: "offer-sku";"quantity";"warehouse-code";"update-delete"
// We omit warehouse-code for a global quantity, and update-delete empty = update.
export async function pushMiraklStock(
  conn: { baseUrl: string; apiKeyEnc: string },
  rows: { offerSku: string; quantity: number }[]
) {
  const apiKey = decrypt(conn.apiKeyEnc);
  const header = '"offer-sku";"quantity";"warehouse-code";"update-delete"';
  const lines = rows.map((r) => `"${r.offerSku}";"${r.quantity}";"";""`);
  const csv = [header, ...lines].join("\n");

  const form = new FormData();
  const blob = new Blob([csv], { type: "text/csv" });
  form.append("file", blob, "stock.csv");

  const res = await fetch(`${conn.baseUrl}/api/offers/stock/imports`, {
    method: "POST",
    headers: { Authorization: apiKey },
    body: form,
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "60");
    throw new Error(`RATE_LIMIT:${retry}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STO01 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return { importId: String(data.import_id ?? "") };
}

// STO02 - poll the status of a stock import.
export async function getMiraklStockImportStatus(
  conn: { baseUrl: string; apiKeyEnc: string },
  importId: string
) {
  const apiKey = decrypt(conn.apiKeyEnc);
  const res = await fetch(`${conn.baseUrl}/api/offers/stock/imports/${importId}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`STO02 HTTP ${res.status}`);
  const d: any = await res.json();
  return {
    status: d.status,
    linesInSuccess: d.lines_in_success ?? 0,
    linesInError: d.lines_in_error ?? 0,
    hasErrorReport: d.has_error_report ?? false,
  };
}

// OR21 - accept all lines on an order.
export async function acceptMiraklOrder(conn: Conn, orderId: string, lineIds: string[]) {
  const res = await fetch(`${conn.baseUrl}/api/orders/${orderId}/accept`, {
    method: "PUT",
    headers: { ...authHeaders(conn), "Content-Type": "application/json" },
    body: JSON.stringify({ order_lines: lineIds.map((id) => ({ accepted: true, id })) }),
  });
  if (res.status === 429) throw new Error(`RATE_LIMIT:${res.headers.get("Retry-After") ?? "60"}`);
  if (!res.ok && res.status !== 204) throw new Error(`Mirakl OR21 HTTP ${res.status}: ${await res.text()}`);
  return true;
}

// OR21 with accepted:false - refuse an order we cannot fulfill (mirrors accept).
export async function refuseMiraklOrder(conn: Conn, orderId: string, lineIds: string[]) {
  const res = await fetch(`${conn.baseUrl}/api/orders/${orderId}/accept`, {
    method: "PUT",
    headers: { ...authHeaders(conn), "Content-Type": "application/json" },
    body: JSON.stringify({ order_lines: lineIds.map((id) => ({ accepted: false, id })) }),
  });
  if (res.status === 429) throw new Error(`RATE_LIMIT:${res.headers.get("Retry-After") ?? "60"}`);
  if (!res.ok && res.status !== 204) throw new Error(`Mirakl OR21 refuse HTTP ${res.status}: ${await res.text()}`);
  return true;
}

// OR11 - fetch a single order by id (re-fetch to get customer + shipping at SHIPPING).
export async function fetchMiraklOrderById(conn: Conn, orderId: string) {
  const res = await fetch(`${conn.baseUrl}/api/orders?order_ids=${encodeURIComponent(orderId)}`, {
    headers: authHeaders(conn),
  });
  if (res.status === 429) throw new Error(`RATE_LIMIT:${res.headers.get("Retry-After") ?? "60"}`);
  if (!res.ok) throw new Error(`Mirakl OR11 HTTP ${res.status}`);
  const data: any = await res.json();
  return (data.orders ?? [])[0] ?? null;
}

// OR72 - list documents for an order (packing slip / invoice). Graceful: returns [] on failure.
export async function listMiraklOrderDocuments(conn: Conn, orderId: string) {
  try {
    const res = await fetch(`${conn.baseUrl}/api/orders/documents?order_ids=${encodeURIComponent(orderId)}`, {
      headers: authHeaders(conn),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.order_documents ?? data.documents ?? [];
  } catch {
    return [];
  }
}

// Map a Shopify tracking_company to a Mirakl carrier code. Registered carriers
// match by code; unknown ones fall through as unregistered (name + url).
const CARRIER_CODE: Record<string, string> = {
  "ups": "UPS",
  "usps": "USPS",
  "united states postal service": "USPS",
  "fedex": "FEDEX",
  "dhl": "DHL",
  "dhl express": "DHL",
};
export function miraklCarrier(shopifyCompany?: string | null) {
  const raw = (shopifyCompany ?? "").trim();
  const code = CARRIER_CODE[raw.toLowerCase()];
  return { code: code ?? null, name: raw || "Other" };
}

// OR23 - set carrier tracking on an order (must be in SHIPPING state).
export async function setMiraklTracking(
  conn: Conn,
  orderId: string,
  opts: { carrierCode?: string | null; carrierName?: string; carrierUrl?: string | null; trackingNumber: string }
) {
  // Send as UNREGISTERED carrier (carrier_name + carrier_url, no carrier_code) per
  // Mirakl OR23 spec. Avoids operator-specific registered-code mismatches.
  const body: any = {
    carrier_name: opts.carrierName || "Other",
    tracking_number: opts.trackingNumber,
  };
  if (opts.carrierUrl) body.carrier_url = opts.carrierUrl;

  const res = await fetch(`${conn.baseUrl}/api/orders/${orderId}/tracking`, {
    method: "PUT",
    headers: { ...authHeaders(conn), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error(`RATE_LIMIT:${res.headers.get("Retry-After") ?? "60"}`);
  if (!res.ok && res.status !== 204) throw new Error(`Mirakl OR23 HTTP ${res.status}: ${await res.text()}`);
  return true;
}

// OR24 - validate shipment (moves order to SHIPPED, notifies customer). No body.
export async function shipMiraklOrder(conn: Conn, orderId: string) {
  const res = await fetch(`${conn.baseUrl}/api/orders/${orderId}/ship`, {
    method: "PUT",
    headers: authHeaders(conn),
  });
  if (res.status === 429) throw new Error(`RATE_LIMIT:${res.headers.get("Retry-After") ?? "60"}`);
  if (!res.ok && res.status !== 204) throw new Error(`Mirakl OR24 HTTP ${res.status}: ${await res.text()}`);
  return true;
}


// --- Messaging (inbox/threads API) ---

// M11: list threads for an order
export async function listOrderThreads(conn: Conn, orderId: string) {
  const res = await fetch(
    `${conn.baseUrl}/api/inbox/threads?entity_type=MMP_ORDER&entity_id=${encodeURIComponent(orderId)}`,
    { headers: authHeaders(conn) }
  );
  if (!res.ok) throw new Error(`Mirakl M11 HTTP ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return (data?.data ?? data?.threads ?? []) as any[];
}

// M10: get one thread with all its messages
export async function getOrderThread(conn: Conn, threadId: string) {
  const res = await fetch(`${conn.baseUrl}/api/inbox/threads/${threadId}`, {
    headers: authHeaders(conn),
  });
  if (!res.ok) throw new Error(`Mirakl M10 HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as any;
}

// M12: reply to a thread (multipart/form-data with message_input)
export async function replyToThread(
  conn: Conn,
  threadId: string,
  body: string,
  to: { id?: string; type: string }[]
) {
  const auth = decrypt(conn.apiKeyEnc);
  const form = new FormData();
  form.append("message_input", JSON.stringify({ body, to }));

  const res = await fetch(`${conn.baseUrl}/api/inbox/threads/${threadId}/message`, {
    method: "POST",
    headers: { Authorization: auth, Accept: "application/json" },
    body: form as any,
  });
  if (!res.ok) throw new Error(`Mirakl M12 HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as any;
}


// OR73 - download a single order document (packing slip / invoice) as raw bytes.
// A single document_id returns the file UN-zipped (per Mirakl docs), so we stream it as-is.
export async function downloadMiraklDocument(
  conn: { baseUrl: string; apiKeyEnc: string },
  documentId: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const apiKey = decrypt(conn.apiKeyEnc);
  const url = `${conn.baseUrl}/api/orders/documents/download?document_ids=${encodeURIComponent(documentId)}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Mirakl document download HTTP ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const contentType = res.headers.get("content-type") ?? "application/pdf";
  // Try to read filename from Content-Disposition; fall back to a sensible default.
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename="?([^"]+)"?/i);
  const filename = m ? m[1] : `packing-slip-${documentId}.pdf`;
  return { buffer, contentType, filename };
}

// Fetch the UPC/barcode for a product from its OFFER (OF21). Different marketplaces
// expose the UPC differently: Nordstrom uses reference_type "upc", Kohl's uses
// "uid_code", Macy's uses "UPC". This reads whichever is present. Returns UPC or null.
export async function fetchOfferUpcByProductSku(
  conn: { baseUrl: string; apiKeyEnc: string },
  productSku: string
): Promise<string | null> {
  try {
    const apiKey = decrypt(conn.apiKeyEnc);
    const res = await fetch(`${conn.baseUrl}/api/offers?product_id=${encodeURIComponent(productSku)}&max=5`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    for (const offer of (data.offers ?? [])) {
      const refs = offer.product_references ?? [];
      const upc = refs.find((r: any) =>
        /UPC|EAN|GTIN|UID_CODE/i.test(r.reference_type ?? r.type ?? "")
      )?.reference;
      if (upc) return String(upc).trim();
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch returns from Mirakl (/api/returns). Token-based pagination.
// Some marketplaces (e.g. Kohl's) don't expose this endpoint -> returns empty gracefully.
export async function fetchMiraklReturns(
  conn: Conn,
  opts: { state?: string } = {}
) {
  // Mirakl returns API uses token-based pagination. Loop next_page_token to get ALL.
  const all: any[] = [];
  let pageToken: string | null = null;
  let unsupported = false;

  for (let guard = 0; guard < 50; guard++) {
    const params = new URLSearchParams();
    params.set("max", "100");
    if (pageToken) params.set("page_token", pageToken);
    if (opts.state) params.set("return_state", opts.state);

    const res = await fetch(`${conn.baseUrl}/api/returns?${params.toString()}`, {
      headers: authHeaders(conn),
    });

    if (res.status === 404) { unsupported = true; break; }
    if (res.status === 429) {
      const retry = Number(res.headers.get("Retry-After") ?? "60");
      throw new Error(`RATE_LIMIT:${retry}`);
    }
    if (!res.ok) throw new Error(`Mirakl returns HTTP ${res.status}`);

    const json: any = await res.json();
    const page = json?.data ?? [];
    all.push(...page);

    pageToken = json?.next_page_token ?? null;
    if (!pageToken || page.length === 0) break;
  }

  return { data: all, unsupported };
}

// M11: list ALL inbox threads for the shop (not per-order). Uses updated_since to
// limit to recent activity, and seek pagination to get everything. This is the
// correct, efficient way to build an inbox (one call per page, not one per order).
export async function listAllThreads(
  conn: Conn,
  opts: { updatedSince?: string; withMessages?: boolean } = {}
) {
  const all: any[] = [];
  let pageToken: string | null = null;

  for (let guard = 0; guard < 40; guard++) {
    const params = new URLSearchParams();
    params.set("entity_type", "MMP_ORDER");
    params.set("limit", "100");
    if (opts.updatedSince) params.set("updated_since", opts.updatedSince);
    if (opts.withMessages) params.set("with_messages", "true");
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(`${conn.baseUrl}/api/inbox/threads?${params.toString()}`, {
      headers: authHeaders(conn),
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get("Retry-After") ?? "60");
      throw new Error(`RATE_LIMIT:${retry}`);
    }
    if (!res.ok) throw new Error(`Mirakl M11 HTTP ${res.status}: ${await res.text()}`);

    const json: any = await res.json();
    const page = json?.data ?? [];
    all.push(...page);

    pageToken = json?.next_page_token ?? json?.pagination?.next_page_token ?? null;
    if (!pageToken || page.length === 0) break;
  }
  return all;
}
