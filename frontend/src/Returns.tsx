import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

// Marketplace brand chips (text-based logo thumbnails with each brand's color).
function channelBrand(name: string): { short: string; bg: string; fg: string } {
  const n = (name || "").toLowerCase();
  if (n.includes("nordstrom")) return { short: "NORD", bg: "#000000", fg: "#ffffff" };
  if (n.includes("macy")) return { short: "MACY'S", bg: "#e21a2c", fg: "#ffffff" };
  if (n.includes("kohl")) return { short: "KOHL'S", bg: "#000000", fg: "#ffffff" };
  if (n.includes("amazon")) return { short: "AMZN", bg: "#ff9900", fg: "#111111" };
  if (n.includes("target")) return { short: "TGT", bg: "#cc0000", fg: "#ffffff" };
  if (n.includes("walmart")) return { short: "WMT", bg: "#0071dc", fg: "#ffffff" };
  const short = (name || "?").replace(/\s*-\s*.*/, "").slice(0, 6).toUpperCase();
  return { short, bg: "#3b5bfd", fg: "#ffffff" };
}

function ChannelLogo({ name }: { name: string }) {
  const b = channelBrand(name);
  return (
    <span
      title={name}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 54, height: 26, padding: "0 8px", borderRadius: 6,
        background: b.bg, color: b.fg, fontSize: 11, fontWeight: 800,
        letterSpacing: ".02em", flexShrink: 0,
      }}
    >
      {b.short}
    </span>
  );
}

function stateStyle(state: string): { bg: string; fg: string; label: string } {
  const s = (state || "").toUpperCase();
  switch (s) {
    case "OPEN": return { bg: "#eef1ff", fg: "#3b5bfd", label: "Open" };
    case "IN_PROGRESS": return { bg: "#fff4e5", fg: "#b26a00", label: "In progress" };
    case "RECEIVED": return { bg: "#e6f4ea", fg: "#1e7e34", label: "Received" };
    case "CLOSED": return { bg: "#eceef2", fg: "#5b6472", label: "Closed" };
    case "REFUSED": return { bg: "#fde8e8", fg: "#dc2626", label: "Refused" };
    default: return { bg: "#eceef2", fg: "#5b6472", label: state || "\u2014" };
  }
}

const FILTERS = [
  ["ALL", "All"],
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In progress"],
  ["RECEIVED", "Received"],
  ["CLOSED", "Closed"],
];

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return "\u2014";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

function reasonLabel(code) {
  if (!code) return "\u2014";
  return code.replace(/^RETURN_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Returns() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  function load(state: string) {
    setLoading(true); setErr("");
    api.listReturns(state)
      .then((d: any) => { setData(d); setLoading(false); })
      .catch((e: any) => { setErr(e.message || "Failed to load returns"); setLoading(false); });
  }

  useEffect(() => { load(filter); setPage(1); }, [filter]);

  const returns = data?.returns ?? [];
  const totalPages = Math.max(1, Math.ceil(returns.length / PAGE_SIZE));
  const pageRows = returns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = data?.stateCounts ?? {};
  const totalCount = data?.count ?? 0;

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>Returns</h2>
          <div className="conn-sub" style={{ marginTop: 4 }}>
            Returns across all connected marketplaces
          </div>
        </div>
      </div>

      {data?.channelStatus?.some((c: any) => !c.supported) && (
        <div className="toast" style={{ marginBottom: 16, background: "#fff8e6", color: "#8a6d00", border: "1px solid #f0e0a8" }}>
          Returns API not available for: {data.channelStatus.filter((c: any) => !c.supported).map((c: any) => c.channel).join(", ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {FILTERS.map(([k, label]) => {
          const active = filter === k;
          const n = k === "ALL" ? totalCount : (counts[k] ?? 0);
          return (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: active ? "1px solid #3b5bfd" : "1px solid #e6e8ee",
                background: active ? "#3b5bfd" : "#fff",
                color: active ? "#fff" : "#1a2233",
                transition: "all .12s",
              }}>
              {label}
              {data && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                  background: active ? "rgba(255,255,255,.22)" : "#eceef2",
                  color: active ? "#fff" : "#6b7488",
                }}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {err && <div className="toast bad" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading returns\u2026</div>
        ) : returns.length === 0 ? (
          <div className="empty">No returns{filter !== "ALL" ? ` with this status` : ""} yet.</div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="otable">
                <thead>
                  <tr>
                    <th>Marketplace</th>
                    <th>Order</th>
                    <th>Reason</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r: any) => (
                    <tr key={r.id}>
                      <td><ChannelLogo name={r.channel} /></td>
                      <td>
                        <a href={r.marketplaceUrl} target="_blank" rel="noreferrer"
                          className="mono" style={{ color: "#3b5bfd", fontWeight: 600, textDecoration: "none" }}>
                          {r.orderCommercialId ?? r.orderId}
                        </a>
                        {r.rma && <div className="conn-sub" style={{ fontSize: 11 }}>RMA {r.rma}</div>}
                      </td>
                      <td>{reasonLabel(r.reasonCode)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{r.quantity}</td>
                      <td>
                        {(() => { const st = stateStyle(r.state); return (
                          <span style={{ background: st.bg, color: st.fg, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                            {st.label}
                          </span>
                        ); })()}
                      </td>
                      <td>
                        {r.trackingUrl ? (
                          <a href={r.trackingUrl} target="_blank" rel="noreferrer" style={{ color: "#3b5bfd", textDecoration: "none", fontSize: 13 }}>
                            {r.carrier ?? "Track"} \u2197
                          </a>
                        ) : <span className="conn-sub">\u2014</span>}
                      </td>
                      <td className="conn-sub">{fmtDate(r.dateCreated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {returns.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: "1px solid #e6e8ee" }}>
                <div className="conn-sub">
                  Showing {(page - 1) * PAGE_SIZE + 1}\u2013{Math.min(page * PAGE_SIZE, returns.length)} of {returns.length}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                  <span className="conn-sub">Page {page} of {totalPages}</span>
                  <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
