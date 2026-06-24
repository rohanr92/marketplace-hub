import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending / Fraud check" },
  { key: "to_accept", label: "Awaiting acceptance" },
  { key: "to_ship", label: "Awaiting shipment" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "Closed" },
];

function StatusBadge({ rawState }: { rawState: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    STAGING: { label: "Pending", cls: "badge" },
    WAITING_ACCEPTANCE: { label: "Awaiting acceptance", cls: "badge amber" },
    WAITING_DEBIT: { label: "Debit in progress", cls: "badge blue" },
    WAITING_DEBIT_PAYMENT: { label: "Debit in progress", cls: "badge blue" },
    SHIPPING: { label: "Awaiting shipment", cls: "badge blue" },
    SHIPPED: { label: "Shipped", cls: "badge green" },
    TO_COLLECT: { label: "To collect", cls: "badge blue" },
    RECEIVED: { label: "Delivered", cls: "badge green" },
    CLOSED: { label: "Closed", cls: "badge green" },
    REFUSED: { label: "Refused", cls: "badge red" },
    CANCELED: { label: "Canceled", cls: "badge red" },
  };
  const s = map[rawState] ?? { label: rawState, cls: "badge" };
  return <span className={s.cls}>{s.label}</span>;
}

export default function Orders() {
  const [bucket, setBucket] = useState("all");
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(p = page, b = bucket) {
    setData(await api.ordersList(b, p));
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
    finally { setBusyId(null); }
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
          <h2>Orders</h2>
          <div className="conn-sub">Marketplace orders across all channels. Click an order number to open it on the marketplace.</div>
        </div>
        <button className="btn btn-ghost" onClick={() => load()}>Refresh</button>
      </div>

      {msg && <div className="toast ok" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="seg" style={{ flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={bucket === t.key ? "active" : ""} onClick={() => setBucket(t.key)}>
            {t.label}{data?.counts?.[t.key] != null ? ` (${data.counts[t.key]})` : ""}
          </button>
        ))}
      </div>

      {data && data.rows.length > 0 ? (
        <>
          <table className="otable">
            <thead>
              <tr><th>Order #</th><th>Channel</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {data.rows.map((o: any) => (
                <tr key={o.id}>
                  <td>
                    {o.marketplaceUrl
                      ? <a href={o.marketplaceUrl} target="_blank" rel="noreferrer" className="mono" style={{ color: "var(--brand)", textDecoration: "none" }}>{o.channelOrderId}</a>
                      : <span className="mono">{o.channelOrderId}</span>}
                  </td>
                  <td>{o.channelLabel}</td>
                  <td className="conn-sub">{o.channelCreatedAt ? new Date(o.channelCreatedAt).toLocaleDateString() : "-"}</td>
                  <td>{o.customerName ?? "-"}</td>
                  <td className="conn-sub">{o.items?.length ? o.items.map((i: any) => `${i.sku} x${i.qty}`).join(", ") : "-"}</td>
                  <td>${o.totalPrice?.toFixed?.(2) ?? o.totalPrice}</td>
                  <td><StatusBadge rawState={o.rawState} /></td>
                  <td>
                    {o.rawState === "WAITING_ACCEPTANCE" && (
                      <button className="btn" disabled={busyId === o.id} onClick={() => accept(o.id)}>{busyId === o.id ? "..." : "Accept"}</button>
                    )}
                    {o.rawState === "WAITING_ACCEPTANCE" && (
                      <button className="btn" style={{ marginLeft: 6, background: "#3a1f1f", color: "#ff8080" }} disabled={busyId === o.id} onClick={() => refuse(o.id)}>{busyId === o.id ? "..." : "Refuse"}</button>
                    )}
                    {o.rawState === "SHIPPING" && !o.shopifyOrderId && (
                      <button className="btn" disabled={busyId === o.id} onClick={() => push(o.id)}>{busyId === o.id ? "..." : "Push to Shopify"}</button>
                    )}
                    {o.shopifyOrderId && o.state !== "shipped_to_marketplace" && (
                      <button className="btn" disabled={busyId === o.id} onClick={() => shipMkt(o.id)}>{busyId === o.id ? "..." : "Mark shipped to marketplace"}</button>
                    )}
                    {o.shopifyOrderId && <span className="badge green">In Shopify</span>}
                    {o.state === "shipped_to_marketplace" && <span className="badge green">Shipped to marketplace</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div className="conn-sub">{data.total} orders - page {data.page} of {data.pages}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => go(page - 1)}>Prev</button>
              <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => go(page + 1)}>Next</button>
            </div>
          </div>
        </>
      ) : <div className="empty">No orders in this view.</div>}
    </Shell>
  );
}
