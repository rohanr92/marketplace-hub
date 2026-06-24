import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

export default function Reports() {
  const [summary, setSummary] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"all" | "success" | "error" | "skipped" | "preview">("all");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");

  async function load(p = page, st = status) {
    setSummary(await api.reportsSummary());
    setData(await api.reportsSync(`?status=${st}&page=${p}&pageSize=50`));
  }
  useEffect(() => { load(1, status); setPage(1); }, [status]);

  async function cleanup() {
    const r = await api.reportsCleanup();
    setMsg(`Deleted ${r.deleted} old log rows`);
    load(1, status);
  }

  function go(p: number) { setPage(p); load(p, status); }

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h2>Reports</h2>
          <div className="conn-sub">Sync history. Rows auto-delete after 24 hours.</div>
        </div>
        <button className="btn btn-ghost" onClick={cleanup}>Clear old logs now</button>
      </div>

      {msg && <div className="toast ok" style={{ marginBottom: 16 }}>{msg}</div>}

      {summary && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <RStat label="Success" value={summary.success} color="var(--green)" />
          <RStat label="Error" value={summary.error} color="var(--red)" />
          <RStat label="Skipped" value={summary.skipped} color="#92600a" />
          <RStat label="Preview" value={summary.preview} color="var(--muted)" />
        </div>
      )}

      <div className="seg" style={{ maxWidth: 520, marginBottom: 14 }}>
        {(["all", "success", "error", "skipped", "preview"] as const).map((st) => (
          <button key={st} className={status === st ? "active" : ""} onClick={() => setStatus(st)}>{st[0].toUpperCase() + st.slice(1)}</button>
        ))}
      </div>

      {data && data.rows.length > 0 ? (
        <>
          <table className="otable">
            <thead><tr><th>When</th><th>Channel</th><th>Offer SKU</th><th>Stock</th><th>Buffer</th><th>Sent</th><th>Status</th><th>Message</th></tr></thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="conn-sub">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.channelLabel}</td>
                  <td className="mono">{r.offerSku}</td>
                  <td>{r.stock}</td>
                  <td>{r.bufferApplied}</td>
                  <td><strong>{r.quantitySent}</strong></td>
                  <td>
                    {r.status === "success" && <span className="badge green">success</span>}
                    {r.status === "error" && <span className="badge red">error</span>}
                    {r.status === "skipped" && <span className="badge amber">skipped</span>}
                    {r.status === "preview" && <span className="badge blue">preview</span>}
                  </td>
                  <td className="conn-sub">{r.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div className="conn-sub">{data.total} rows - page {data.page} of {data.pages}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => go(page - 1)}>Prev</button>
              <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => go(page + 1)}>Next</button>
            </div>
          </div>
        </>
      ) : <div className="empty">No sync logs yet. Run a sync or preview from a channel.</div>}
    </Shell>
  );
}

function RStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 18px", minWidth: 120 }}>
      <div className="conn-sub">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
