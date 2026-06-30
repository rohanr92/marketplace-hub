import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Privacy from "./Privacy";
import Login from "./Login";
import Settings from "./Settings";
import Admin from "./Admin";
import Signup from "./Signup";
import Dashboard from "./Dashboard";
import Returns from "./Returns";
import Messages from "./Messages";
import Connections from "./Connections";
import Catalog from "./Catalog";
import Orders from "./Orders";
import ChannelSettings from "./ChannelSettings";
import Placeholder from "./Placeholder";
import Reports from "./Reports";
import { isAuthed, currentUser } from "./api";

function Protected({ children }: { children: React.ReactNode }) {
  return isAuthed() ? <>{children}</> : <Navigate to="/login" />;
}

// Super admin only.
function SuperOnly({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" />;
  if (!currentUser()?.isSuperAdmin) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

// Owner/admin only - staff get redirected to dashboard.
function AdminOnly({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" />;
  const role = currentUser()?.role ?? "owner";
  if (role === "staff") return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/connections" element={<AdminOnly><Connections /></AdminOnly>} />
        <Route path="/channels/:id" element={<AdminOnly><ChannelSettings /></AdminOnly>} />
        <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
        <Route path="/orders" element={<Protected><Orders /></Protected>} />
        <Route path="/inventory" element={<AdminOnly><Placeholder title="Inventory" /></AdminOnly>} />
        <Route path="/reports" element={<AdminOnly><Reports /></AdminOnly>} />
        <Route path="/settings" element={<AdminOnly><Settings /></AdminOnly>} />
        <Route path="/admin" element={<SuperOnly><Admin /></SuperOnly>} />
        <Route path="/returns" element={<Protected><Returns /></Protected>} />
        <Route path="/messages" element={<Protected><Messages /></Protected>} />
        <Route path="*" element={<Navigate to={!isAuthed() ? "/login" : (currentUser()?.isSuperAdmin ? "/admin" : "/dashboard")} />} />
      </Routes>
    </BrowserRouter>
  );
}
