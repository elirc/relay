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
          <h1 style={{ color: "#7c5cff" }}>Relay</h1>
          {children}
        </div>
      </body>
    </html>
  );
}
