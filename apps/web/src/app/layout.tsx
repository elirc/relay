import type { ReactNode } from "react";

export const metadata = {
  title: "Relay — run history",
  description: "Workflow automation: inspect runs, steps, and the execution event log.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#0b0d10",
          color: "#e6e9ef",
        }}
      >
        <div style={{ maxWidth: 820, margin: "40px auto", padding: "0 16px" }}>
          <h1 style={{ color: "#7c5cff", marginBottom: 4 }}>Relay</h1>
          <nav style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <a href="/" style={{ color: "#8b93a1", textDecoration: "none" }}>
              Runs
            </a>
            <a href="/connections" style={{ color: "#8b93a1", textDecoration: "none" }}>
              Connections
            </a>
            <a href="/builder" style={{ color: "#8b93a1", textDecoration: "none" }}>
              Builder
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
