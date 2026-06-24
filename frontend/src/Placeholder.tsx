import Shell from "./Shell";
export default function Placeholder({ title }: { title: string }) {
  return (
    <Shell>
      <div className="page-head"><h2>{title}</h2></div>
      <div className="card"><div className="empty">Coming in a later phase.</div></div>
    </Shell>
  );
}
