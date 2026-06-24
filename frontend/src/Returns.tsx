import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Returns() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.listReturns().then(setData).catch((e: any) => setErr(e.message || "Failed"));
  }, []);

  return (
    <Shell>
      <div style={{ padding: 24 }}>
        <h1 style={{ color: "#f2f3f5", fontSize: 22, margin: "0 0 20px" }}>Returns &amp; Refunds</h1>
        {err ? <div style={{ color: "#ff6b6b" }}>{err}</div> : null}
        {!data ? <div style={{ color: "#8b8d98" }}>Loading...</div> : (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: "18px 20px", flex: 1 }}>
                <div style={{ color: "#8b8d98", fontSize: 13, marginBottom: 6 }}>Total refunded</div>
                <div style={{ color: "#f2f3f5", fontSize: 26, fontWeight: 600 }}>{money(data.totalRefunded)}</div>
              </div>
              <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: "18px 20px", flex: 1 }}>
                <div style={{ color: "#8b8d98", fontSize: 13, marginBottom: 6 }}>Orders with refunds</div>
                <div style={{ color: "#f2f3f5", fontSize: 26, fontWeight: 600 }}>{data.orderCount}</div>
              </div>
              <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: "18px 20px", flex: 1 }}>
                <div style={{ color: "#8b8d98", fontSize: 13, marginBottom: 6 }}>Refund line items</div>
                <div style={{ color: "#f2f3f5", fontSize: 26, fontWeight: 600 }}>{data.count}</div>
              </div>
            </div>

            <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: 20 }}>
              {data.returns.length === 0 ? (
                <div style={{ color: "#6b6d78", fontSize: 13 }}>No returns or refunds yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "#6b6d78", fontSize: 12, textAlign: "left" }}>
                      <th style={{ padding: "8px 0" }}>Order</th>
                      <th style={{ padding: "8px 0" }}>Channel</th>
                      <th style={{ padding: "8px 0" }}>Item</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Qty</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Amount</th>
                      <th style={{ padding: "8px 0" }}>Reason</th>
                      <th style={{ padding: "8px 0" }}>Status</th>
                      <th style={{ padding: "8px 0" }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.returns.map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid #26272f", color: "#d8d9e0", fontSize: 13 }}>
                        <td style={{ padding: "10px 0" }}>
                          {r.marketplaceUrl ? (
                            <a href={r.marketplaceUrl} target="_blank" rel="noreferrer" style={{ color: "#c9a227" }}>{r.channelOrderId}</a>
                          ) : r.channelOrderId}
                        </td>
                        <td style={{ padding: "10px 0", color: "#8b8d98" }}>{r.channel}</td>
                        <td style={{ padding: "10px 0" }}>{r.title ?? r.sku ?? "-"}</td>
                        <td style={{ padding: "10px 0", textAlign: "right" }}>{r.quantity}</td>
                        <td style={{ padding: "10px 0", textAlign: "right" }}>{money(r.amount)}</td>
                        <td style={{ padding: "10px 0", color: "#8b8d98" }}>{r.reasonCode ?? "-"}</td>
                        <td style={{ padding: "10px 0" }}>
                          <span style={{ background: "#2a1f12", color: "#e0a93f", padding: "3px 8px", borderRadius: 6, fontSize: 12 }}>
                            {r.state ?? "REFUNDED"}{r.fullyRefunded ? " (full)" : ""}
                          </span>
                        </td>
                        <td style={{ padding: "10px 0", color: "#8b8d98" }}>{r.createdDate ? r.createdDate.slice(0, 10) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
