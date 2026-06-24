import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { currentTenant, currentUser, logout, currentImpersonation, exitImpersonation } from "./api";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<any>(currentTenant());
  const user = currentUser();
  const role = user?.role ?? "owner";
  const isStaff = role === "staff";
  const isSuper = !!user?.isSuperAdmin;
  const imp = currentImpersonation();

  useEffect(() => {
    const refresh = () => setTenant(currentTenant());
    window.addEventListener("tenant-updated", refresh);
    return () => window.removeEventListener("tenant-updated", refresh);
  }, []);

  const link = (to: string, label: string) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tenant?.logoBase64 ? (
            <img src={tenant.logoBase64} alt="logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain", background: "#fff" }} />
          ) : (
            <span className="dot">{(tenant?.name ?? "M").slice(0, 1).toUpperCase()}</span>
          )}
          <span>Hub</span>
        </div>
        <div className="tenant-name">{tenant?.name ?? ""}</div>
        <nav className="nav">
          {link("/dashboard", "Dashboard")}
          {!isStaff && link("/connections", "Channels")}
          {link("/catalog", "Catalog")}
          {link("/orders", "Orders")}
          {link("/returns", "Returns")}
          {link("/messages", "Messages")}
          {!isStaff && link("/inventory", "Inventory")}
          {!isStaff && link("/reports", "Reports")}
          {!isStaff && link("/settings", "Settings")}
        </nav>
        <div className="sidebar-foot">
          <div style={{ color: "#6b6d78", fontSize: 11, marginBottom: 6 }}>{user?.email} ({role})</div>
          <button className="link-btn" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {imp && (
          <div className="imp-banner" style={{ background: imp.readOnly ? "#1f2a1f" : "#2a1f1f", borderBottom: "1px solid #3a3b44", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#e0e1e6", fontSize: 13 }}>
              Viewing as <b>{imp.tenantName}</b> — {imp.readOnly ? "read only" : "full control"}
            </span>
            <button onClick={exitImpersonation} style={{ background: "#c9a227", color: "#15161b", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Exit to Admin</button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
