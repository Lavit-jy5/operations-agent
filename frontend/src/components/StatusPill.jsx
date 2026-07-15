export default function StatusPill({ label, status }) {
  const className = status === "connected" || status === "mock" ? "statusPill good" : "statusPill bad";

  return (
    <div className={className}>
      <span />
      {label}：{status || "检测中"}
    </div>
  );
}
