import { useEffect, useState } from "react";
import Shell from "./Shell";
import { api, currentUser, currentTenant } from "./api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function money(n: number) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 180, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: accent ?? "#3b5bfd" }} />
        <span style={{ color: "#6b7488", fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ color: "#1a2233", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ color: "#8a92a3", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ActionCard({ title, count, hint, href, color }: { title: string; count: number; hint: string; href: string; color: string }) {
  return (
    <a href={href} style={{ textDecoration: "none", flex: 1, minWidth: 200 }}>
      <div className="card" style={{ padding: 18, cursor: "pointer", transition: "box-shadow .15s, transform .15s", display: "flex", alignItems: "center", gap: 14 }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(16,24,40,.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}>
        <div style={{ width: 46, height: 46, borderRadius: 11, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color, fontSize: 20, fontWeight: 800 }}>{count}</span>
        </div>
        <div>
          <div style={{ color: "#1a2233", fontSize: 14, fontWeight: 600 }}>{title}</div>
          <div style={{ color: "#8a92a3", fontSize: 12, marginTop: 2 }}>{hint}</div>
        </div>
      </div>
    </a>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const user = currentUser();
  const tenant = currentTenant();
  const name = (user?.email ?? "").split("@")[0] || tenant?.name || "there";

  useEffect(() => {
    setLoading(true); setErr("");
    api.analyticsSummary(days)
      .then(setData)
      .catch((e: any) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  const a = data?.actions ?? {};

  return (
    <Shell>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>{greeting()}, {name.charAt(0).toUpperCase() + name.slice(1)}</h2>
          <div className="conn-sub" style={{ marginTop: 4 }}>Here's what's happening across your channels</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: days === r.days ? "1px solid #3b5bfd" : "1px solid #e6e8ee",
                background: days === r.days ? "#3b5bfd" : "#fff",
                color: days === r.days ? "#fff" : "#1a2233",
              }}>{r.label}</button>
          ))}
        </div>
      </div>

      {err && <div className="toast bad" style={{ marginBottom: 16 }}>{err}</div>}

      {loading || !data ? (
        <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 0" }}>
          <div className="spinner" /><span>Loading dashboard…</span>
        </div>
      ) : (
        <>
          {/* Take action */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7488", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>Take action</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <ActionCard title="Orders to process" count={a.pendingOrders ?? 0} hint="Accept & fulfill" href="/orders" color="#3b5bfd" />
              <ActionCard title="Returns" count={a.refundOrders ?? 0} hint="Review returns" href="/returns" color="#f59e0b" />
              <ActionCard title="Products synced" count={a.trackedItems ?? 0} hint="Tracked inventory" href="/catalog" color="#10b981" />
              <ActionCard title="Active channels" count={a.activeChannels ?? 0} hint="Connected marketplaces" href="/connections" color="#8b5cf6" />
            </div>
          </div>

          {/* Metrics */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Total sales" value={money(data.totalSales)} sub={`Last ${data.days} days`} accent="#3b5bfd" />
            <StatCard label="Orders" value={data.orderCount} accent="#10b981" />
            <StatCard label="Units sold" value={data.unitsSold} accent="#f59e0b" />
            <StatCard label="Avg order value" value={money(data.avgOrderValue)} accent="#8b5cf6" />
          </div>

          {/* Sales chart */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2233", marginBottom: 16 }}>Sales over time</div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b5bfd" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b5bfd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#8a92a3", fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)} minTickGap={24} axisLine={{ stroke: "#e6e8ee" }} tickLine={false} />
                <YAxis tick={{ fill: "#8a92a3", fontSize: 11 }} width={50} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 10, color: "#1a2233", boxShadow: "0 4px 16px rgba(16,24,40,.10)" }}
                  formatter={(v: any, n: any) => n === "sales" ? [money(v), "Sales"] : [v, "Orders"]} />
                <Area type="monotone" dataKey="sales" stroke="#3b5bfd" strokeWidth={2.5} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Channel breakdown */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2233", marginBottom: 16 }}>Sales by channel</div>
            {data.channels.length === 0 ? (
              <div className="empty" style={{ padding: "20px 0" }}>No sales in this period.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {data.channels.map((c: any, i: number) => {
                  const pct = data.totalSales ? Math.round((c.sales / data.totalSales) * 100) : 0;
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a2233" }}>{c.label}</span>
                        <span style={{ fontSize: 13, color: "#6b7488" }}>{money(c.sales)} · {c.orders} orders · {pct}%</span>
                      </div>
                      <div style={{ height: 8, background: "#eef0f4", borderRadius: 20, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: pct + "%", background: "#3b5bfd", borderRadius: 20 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
