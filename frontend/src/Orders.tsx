import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "to_accept", label: "Awaiting acceptance" },
  { key: "to_ship", label: "Awaiting shipment" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "Closed" },
];

// Marketplace logo images (hosted on Shopify CDN).
const LOGOS: Record<string, string> = {
  nordstrom: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/NORDSTROM_2019_BLACK_rgb_copy_1.png?v=1783886805",
  macy: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/Screenshot_2022-04-20_173029.jpg?v=1783886804",
  kohl: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/kohls_205x210_v2.png?v=1783886804",
  debenham: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/dbz-debenhams-icon-roundel-200x200.png?v=1783886804",
  jcpenney: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/JCPenney_2000_logo.png?v=1783886954",
  jcpenny: "https://cdn.shopify.com/s/files/1/0655/2010/7769/files/JCPenney_2000_logo.png?v=1783886954",
};

function logoFor(name: string): string | null {
  const n = (name || "").toLowerCase();
  for (const key of Object.keys(LOGOS)) if (n.includes(key)) return LOGOS[key];
  return null;
}

function ChannelCell({ name }: { name: string }) {
  const logo = logoFor(name);
  const short = (name || "").replace(/\s*-\s*.*/, "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      {logo ? (
        <img src={logo} alt={short} style={{ width: 26, height: 26, borderRadius: 6, objectFit: "contain", background: "#fff", border: "1px solid #eef0f4" }} />
      ) : (
        <span style={{ width: 26, height: 26, borderRadius: 6, background: "#3b5bfd", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {short.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span style={{ fontSize: 13, color: "#1a2233" }}>{short}</span>
    </div>
  );
}

function StatusBadge({ rawState }: { rawState: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    STAGING: { label: "Pending", bg: "#eceef2", fg: "#5b6472" },
    WAITING_ACCEPTANCE: { label: "Awaiting acceptance", bg: "#fff4e5", fg: "#b26a00" },
    WAITING_DEBIT: { label: "Debit in progress", bg: "#eef1ff", fg: "#3b5bfd" },
    WAITING_DEBIT_PAYMENT: { label: "Debit in progress", bg: "#eef1ff", fg: "#3b5bfd" },
    SHIPPING: { label: "Awaiting shipment", bg: "#eef1ff", fg: "#3b5bfd" },
    SHIPPED: { label: "Shipped", bg: "#e6f4ea", fg: "#1e7e34" },
    TO_COLLECT: { label: "To collect", bg: "#eef1ff", fg: "#3b5bfd" },
    RECEIVED: { label: "Delivered", bg: "#e6f4ea", fg: "#1e7e34" },
    CLOSED: { label: "Closed", bg: "#eceef2", fg: "#5b6472" },
    REFUSED: { label: "Refused", bg: "#fde8e8", fg: "#dc2626" },
    CANCELED: { label: "Canceled", bg: "#fde8e8", fg: "#dc2626" },
  };
  const s = map[rawState] ?? { label: rawState, bg: "#eceef2", fg: "#5b6472" };
  return <span style={{ background: s.bg, color: s.fg, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{s.label}</span>;
}

export default function Orders() {
  const [bucket, setBucket] = useState("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(p = page, b = bucket) {
    setLoading(true);
    try { setData(await api.ordersList(b, p)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(1, bucket); setPage(1); }, [bucket]);

  async function accept(id: string) {
    setBusyId(id); setMsg("");
    try { await api.acceptOrder(id); setMsg("Order accepted"); load(); }
    catch (e: any) { setMsg("Accept failed: " + e.message); }
    finally { setBusyId(""); }
  }
  async function refuse(id: string) {
    if (!confirm("Refuse this order? This tells the marketplace you will NOT fulfill it. This cannot be undone.")) return;
    setBusyId(id);
    try { await api.refuseOrder(id); setMsg("Order refused"); load(); }
    catch (e: any) { setMsg(e.message || "Failed to refuse"); }
    finally { setBusyId(""); }
  }
  async function push(id: string) {
    setBusyId(id); setMsg("");
    try {
      const r = await api.pushOrder(id);
      setMsg(r.skipped ? `Not pushed: ${r.reason}` : `Pushed to Shopify (${r.shopifyName ?? r.shopifyOrderId})`);
      load();
    } catch (e: any) { setMsg("Push failed: " + e.message); }
    finally { setBusyId(""); }
  }
  async function shipMkt(id: string) {
    setBusyId(id); setMsg("");
    try {
      const r = await api.shipToMarketplace(id);
      setMsg(r.skipped ? `Not shipped: ${r.reason}` : `Shipped to marketplace (tracking ${r.tracking})`);
      load();
    } catch (e: any) { setMsg("Ship failed: " + e.message); }
    finally { setBusyId(""); }
  }
  function go(p: number) { setPage(p); load(p, bucket); }

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>Orders</h2>
          <div className="conn-sub" style={{ marginTop: 4 }}>Marketplace orders across all channels</div>
        </div>
        <button className="btn btn-ghost" onClick={() => load()}>Refresh</button>
      </div>

      {msg && <div className="toast ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const activeTab = bucket === t.key;
          const n = data?.counts?.[t.key];
          return (
            <button key={t.key} onClick={() => setBucket(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: activeTab ? "1px solid #3b5bfd" : "1px solid #e6e8ee",
                background: activeTab ? "#3b5bfd" : "#fff",
                color: activeTab ? "#fff" : "#1a2233",
              }}>
              {t.label}
              {n != null && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: activeTab ? "rgba(255,255,255,.22)" : "#eceef2", color: activeTab ? "#fff" : "#6b7488" }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
            <div className="spinner" /><span>Loading orders...</span>
          </div>
        ) : data && data.rows.length > 0 ? (
          <>
            <div className="table-scroll">
              <table className="otable">
                <thead>
                  <tr>
                    <th>Order</th><th>Marketplace</th><th>Date</th><th>Customer</th><th>Items</th>
                    <th style={{ textAlign: "right" }}>Total</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((o: any) => (
                    <tr key={o.id}>
                      <td>
                        {o.marketplaceUrl
                          ? <a href={o.marketplaceUrl} target="_blank" rel="noreferrer" className="mono" style={{ color: "#3b5bfd", textDecoration: "none", fontWeight: 600 }}>{o.channelOrderId}</a>
                          : <span className="mono">{o.channelOrderId}</span>}
                      </td>
                      <td><ChannelCell name={o.channelLabel} /></td>
                      <td className="conn-sub">{o.channelCreatedAt ? new Date(o.channelCreatedAt).toLocaleDateString() : "-"}</td>
                      <td>{o.customerName ?? "-"}</td>
                      <td className="conn-sub" style={{ maxWidth: 220 }}>
                        {o.items?.length ? o.items.map((i: any) => `${i.sku} x${i.qty ?? i.quantity ?? 1}`).join(", ") : "-"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>${o.totalPrice?.toFixed?.(2) ?? o.totalPrice}</td>
                      <td><StatusBadge rawState={o.rawState} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {/* Awaiting acceptance -> Accept / Refuse */}
                          {o.rawState === "WAITING_ACCEPTANCE" && (
                            <>
                              <button className="btn" style={{ padding: "6px 12px", fontSize: 13 }} disabled={busyId === o.id} onClick={() => accept(o.id)}>{busyId === o.id ? "..." : "Accept"}</button>
                              <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 13 }} disabled={busyId === o.id} onClick={() => refuse(o.id)}>{busyId === o.id ? "..." : "Refuse"}</button>
                            </>
                          )}

                          {/* Not yet in Shopify -> Push to Shopify (only if not a terminal state) */}
                          {!o.shopifyOrderId && ["SHIPPING", "WAITING_DEBIT", "WAITING_DEBIT_PAYMENT"].includes(o.rawState) && (
                            <button className="btn" style={{ padding: "6px 12px", fontSize: 13 }} disabled={busyId === o.id} onClick={() => push(o.id)}>{busyId === o.id ? "..." : "Push to Shopify"}</button>
                          )}

                          {/* In Shopify -> Open order (clean link, replaces the old "In Shopify" badge clutter) */}
                          {o.shopifyOrderId && (
                            o.shopifyOrderUrl
                              ? <a href={o.shopifyOrderUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none" }}>Open order</a>
                              : <span className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13, cursor: "default" }}>Open order</span>
                          )}

                          {/* In Shopify but not yet shipped back to marketplace -> allow marking shipped */}
                          {o.shopifyOrderId && o.state !== "shipped_to_marketplace" && o.rawState !== "SHIPPED" && o.rawState !== "RECEIVED" && o.rawState !== "CLOSED" && (
                            <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} disabled={busyId === o.id} onClick={() => shipMkt(o.id)}>{busyId === o.id ? "..." : "Mark shipped"}</button>
                          )}

                          {/* nothing to do */}
                          {!o.shopifyOrderId && !["WAITING_ACCEPTANCE", "SHIPPING", "WAITING_DEBIT", "WAITING_DEBIT_PAYMENT"].includes(o.rawState) && (
                            <span className="conn-sub">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: "1px solid #eef0f4" }}>
              <div className="conn-sub">{data.total} orders - page {data.page} of {data.pages}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => go(page - 1)}>Prev</button>
                <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => go(page + 1)}>Next</button>
              </div>
            </div>
          </>
        ) : <div className="empty">No orders in this view.</div>}
      </div>
    </Shell>
  );
}
