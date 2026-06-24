const BASE = import.meta.env.VITE_API_URL as string;
function token() { return localStorage.getItem("token"); }

async function request(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (opts.body) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (email: string, password: string, companyName: string) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, companyName }) }),
  listConnections: () => request("/connections"),
  createConnection: (body: any) => request("/connections", { method: "POST", body: JSON.stringify(body) }),
  updateConnection: (id: string, body: any) => request(`/connections/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  listLocations: (id: string) => request(`/connections/${id}/locations`),
  testConnection: (id: string) => request(`/connections/${id}/test`, { method: "POST" }),
  deleteConnection: (id: string) => request(`/connections/${id}`, { method: "DELETE" }),
  listOrders: () => request("/orders"),
  syncOrders: () => request("/orders/sync", { method: "POST" }),
  sampleOrders: () => request("/orders/sample", { method: "POST" }),
  ordersList: (bucket: string, page: number) => request(`/orders/list?bucket=${bucket}&page=${page}&pageSize=50`),
  acceptOrder: (id: string) => request(`/orders/${id}/accept`, { method: "POST" }),
  refuseOrder: (id: string) => request(`/orders/${id}/refuse`, { method: "POST" }),
  pushOrder: (id: string) => request(`/orders/${id}/push`, { method: "POST" }),
  shipToMarketplace: (id: string) => request(`/orders/${id}/ship-to-marketplace`, { method: "POST" }),
  listCatalog: () => request("/catalog"),
  importCatalog: (connectionId: string) => request("/catalog/import", { method: "POST", body: JSON.stringify({ connectionId }) }),
  importByIds: (connectionId: string, field: string, identifiers: string[]) =>
    request("/catalog/import-by-ids", { method: "POST", body: JSON.stringify({ connectionId, field, identifiers }) }),
  refreshCatalog: () => request("/catalog/refresh", { method: "POST" }),
  addCatalog: (body: any) => request("/catalog", { method: "POST", body: JSON.stringify(body) }),
  setTracked: (id: string, tracked: boolean) => request(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify({ tracked }) }),
  deleteCatalog: (id: string) => request(`/catalog/${id}`, { method: "DELETE" }),
  sampleCatalog: () => request("/catalog/sample", { method: "POST" }),
  analyticsSummary: (days: number) => request(`/analytics/summary?days=${days}`),
  listReturns: () => request("/returns"),
  inbox: () => request("/inbox"),
  getThread: (threadId: string, orderId: string) => request(`/threads/${threadId}?orderId=${orderId}`),
  replyThread: (threadId: string, body: any) => request(`/threads/${threadId}/reply`, { method: "POST", body: JSON.stringify(body) }),
  channelSettings: (id: string) => request(`/channels/${id}/settings`),
  updateChannelSettings: (id: string, body: any) => request(`/channels/${id}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
  addBufferRule: (id: string, scope: string, value: string, amount: number) =>
    request(`/channels/${id}/buffer-rules`, { method: "POST", body: JSON.stringify({ scope, value, amount }) }),
  deleteBufferRule: (id: string, ruleId: string) => request(`/channels/${id}/buffer-rules/${ruleId}`, { method: "DELETE" }),
  mapOffer: (id: string, offerId: string, catalogItemId: string | null) =>
    request(`/channels/${id}/offers/${offerId}`, { method: "PATCH", body: JSON.stringify({ catalogItemId }) }),
  sampleOffers: (id: string) => request(`/channels/${id}/offers/sample`, { method: "POST" }),
  pullOffers: (id: string) => request(`/channels/${id}/pull-offers`, { method: "POST" }),
  reconcile: (id: string) => request(`/channels/${id}/reconcile`),
  channelOffers: (id: string, filter: string, page: number, pageSize = 50) =>
    request(`/channels/${id}/offers?filter=${filter}&page=${page}&pageSize=${pageSize}`),
  bulkMap: (id: string, field: string, identifiers: string[]) =>
    request(`/channels/${id}/bulk-map`, { method: "POST", body: JSON.stringify({ field, identifiers }) }),
  syncPreview: (id: string) => request(`/channels/${id}/sync/preview`, { method: "POST" }),
  syncRun: (id: string) => request(`/channels/${id}/sync/run`, { method: "POST" }),
  reportsSync: (params: string) => request(`/reports/sync${params}`),
  reportsSummary: () => request(`/reports/summary`),
  reportsCleanup: () => request(`/reports/cleanup`, { method: "POST" }),
  adminTenants: () => request("/admin/tenants"),
  adminStats: () => request("/admin/stats"),
  adminCreateCompany: (companyName: string, ownerEmail: string, ownerPassword: string) =>
    request("/admin/companies", { method: "POST", body: JSON.stringify({ companyName, ownerEmail, ownerPassword }) }),
  adminChangePassword: (newPassword: string) =>
    request("/admin/password", { method: "PATCH", body: JSON.stringify({ newPassword }) }),
  impersonate: (tenantId: string, readOnly: boolean) =>
    request(`/admin/impersonate/${tenantId}`, { method: "POST", body: JSON.stringify({ readOnly }) }),
  getCompany: () => request("/settings/company"),
  updateCompany: (body: any) => request("/settings/company", { method: "PATCH", body: JSON.stringify(body) }),
  listUsers: () => request("/settings/users"),
  addUser: (body: any) => request("/settings/users", { method: "POST", body: JSON.stringify(body) }),
  removeUser: (id: string) => request(`/settings/users/${id}`, { method: "DELETE" }),
};

export function saveAuth(token: string, user: any, tenant: any) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("tenant", JSON.stringify(tenant));
}
export function logout() { localStorage.clear(); location.href = "/login"; }
export function currentTenant() {
  try { return JSON.parse(localStorage.getItem("tenant") ?? "null"); } catch { return null; }
}
export function currentUser() {
  try { return JSON.parse(localStorage.getItem("user") ?? "null"); } catch { return null; }
}
export function updateStoredTenant(patch: any) {
  const t = currentTenant() ?? {};
  localStorage.setItem("tenant", JSON.stringify({ ...t, ...patch }));
  window.dispatchEvent(new Event("tenant-updated"));
}
export function enterImpersonation(token: string, tenant: any, readOnly: boolean) {
  localStorage.setItem("admin_token", localStorage.getItem("token") ?? "");
  localStorage.setItem("admin_user", localStorage.getItem("user") ?? "");
  localStorage.setItem("admin_tenant", localStorage.getItem("tenant") ?? "");
  localStorage.setItem("token", token);
  localStorage.setItem("tenant", JSON.stringify(tenant));
  localStorage.setItem("impersonation", JSON.stringify({ tenantName: tenant.name, readOnly }));
  window.dispatchEvent(new Event("tenant-updated"));
}
export function exitImpersonation() {
  const t = localStorage.getItem("admin_token");
  const u = localStorage.getItem("admin_user");
  const tn = localStorage.getItem("admin_tenant");
  if (t) localStorage.setItem("token", t);
  if (u) localStorage.setItem("user", u);
  if (tn) localStorage.setItem("tenant", tn);
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  localStorage.removeItem("admin_tenant");
  localStorage.removeItem("impersonation");
  location.href = "/admin";
}
export function currentImpersonation() {
  try { return JSON.parse(localStorage.getItem("impersonation") ?? "null"); } catch { return null; }
}
export function isAuthed() { return !!localStorage.getItem("token"); }
