import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api } from "./api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Stat({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 160 }}>
      <div style={{ color: "#8b8d98", fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ color: "#f2f3f5", fontSize: 26, fontWeight: 600 }}>{value}</div>
      {sub ? <div style={{ color: "#6b6d78", fontSize: 12, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    api.analyticsSummary(days)
      .then(setData)
      .catch((e: any) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <Shell>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ color: "#f2f3f5", fontSize: 22, margin: 0 }}>Dashboard</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)}
                style={{
                  background: days === r.days ? "#c9a227" : "#1c1d24",
                  color: days === r.days ? "#15161b" : "#c5c6cf",
                  border: "1px solid #303139", borderRadius: 8, padding: "6px 14px",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}>{r.label}</button>
            ))}
          </div>
        </div>

        {err ? <div style={{ color: "#ff6b6b" }}>{err}</div> : null}
        {loading || !data ? (
          <div style={{ color: "#8b8d98" }}>Loading...</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              <Stat label="Total sales" value={money(data.totalSales)} sub={`Last ${data.days} days`} />
              <Stat label="Orders" value={data.orderCount} />
              <Stat label="Units sold" value={data.unitsSold} />
              <Stat label="Avg order value" value={money(data.avgOrderValue)} />
            </div>

            <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Sales over time</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c9a227" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#c9a227" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26272f" />
                  <XAxis dataKey="date" tick={{ fill: "#6b6d78", fontSize: 11 }}
                    tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                  <YAxis tick={{ fill: "#6b6d78", fontSize: 11 }} width={50} />
                  <Tooltip
                    contentStyle={{ background: "#1c1d24", border: "1px solid #303139", borderRadius: 8, color: "#f2f3f5" }}
                    formatter={(v: any, name: any) => name === "sales" ? [money(v), "Sales"] : [v, "Orders"]} />
                  <Area type="monotone" dataKey="sales" stroke="#c9a227" strokeWidth={2} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "#15161b", border: "1px solid #26272f", borderRadius: 12, padding: 20 }}>
              <div style={{ color: "#c5c6cf", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Sales by channel</div>
              {data.channels.length === 0 ? (
                <div style={{ color: "#6b6d78", fontSize: 13 }}>No sales in this period.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "#6b6d78", fontSize: 12, textAlign: "left" }}>
                      <th style={{ padding: "8px 0" }}>Channel</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Orders</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Sales</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((c: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid #26272f", color: "#d8d9e0", fontSize: 14 }}>
                        <td style={{ padding: "10px 0" }}>{c.label}</td>
                        <td style={{ padding: "10px 0", textAlign: "right" }}>{c.orders}</td>
                        <td style={{ padding: "10px 0", textAlign: "right" }}>{money(c.sales)}</td>
                        <td style={{ padding: "10px 0", textAlign: "right", color: "#8b8d98" }}>
                          {data.totalSales ? Math.round((c.sales / data.totalSales) * 100) : 0}%
                        </td>
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
