import type { ReactNode } from "react";

export function statusColor(status: string): string {
  switch (status) {
    case "succeeded":
      return "#2fbf71";
    case "failed":
      return "#e06c75";
    case "running":
      return "#e5c07b";
    default:
      return "#8b93a1"; // pending / unknown
  }
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      title={status}
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: 999,
        background: statusColor(status),
        marginRight: 6,
      }}
    />
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        background: "#14181d",
        border: "1px solid #232a32",
        borderRadius: 10,
        padding: 16,
        color: "#8b93a1",
      }}
    >
      {children}
    </p>
  );
}
