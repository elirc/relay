"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, API_BASE } from "@/lib/api";
import { StatusDot, Panel } from "@/lib/ui";

const VENDORS = [
  { name: "mailpost", label: "MailPost" },
  { name: "sheetlite", label: "SheetLite" },
  { name: "chatbox", label: "ChatBox" },
];

interface Conn {
  id: string;
  vendor: string;
  status: string;
  scopes: string[];
  expiresAt: string | null;
}

export default function ConnectionsPage() {
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);

  const load = useCallback(() => {
    apiGet<Conn[]>("/api/connections")
      .then(setConns)
      .catch(() => setConns([]));
  }, []);

  useEffect(() => {
    apiGet<{ user: { email: string } }>("/auth/me")
      .then((r) => {
        setMe(r.user);
        load();
      })
      .catch(() => setMe(null));
  }, [load]);

  const signIn = async () => {
    const r = await apiPost<{ user: { email: string } }>("/auth/dev-login");
    setMe(r.user);
    load();
  };

  if (!me) {
    return (
      <section>
        <h2>Connections</h2>
        <Panel>Sign in to connect vendor accounts.</Panel>
        <button onClick={signIn} style={btn}>
          Sign in (dev)
        </button>
      </section>
    );
  }

  return (
    <section>
      <h2>Connections</h2>
      <p style={{ color: "#8b93a1" }}>Signed in as {me.email}</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0 20px" }}>
        {VENDORS.map((v) => (
          // A full-page navigation (not fetch) so the OAuth redirect chain + session cookie work.
          <a key={v.name} href={`${API_BASE}/api/connections/${v.name}/authorize`} style={btn}>
            Connect {v.label}
          </a>
        ))}
      </div>

      {conns.length === 0 ? (
        <Panel>No connections yet. Connect a vendor above.</Panel>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {conns.map((c) => (
            <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #232a32" }}>
              <StatusDot status={c.status === "healthy" ? "succeeded" : "failed"} />
              <strong>{c.vendor}</strong>{" "}
              <span style={{ color: "#8b93a1" }}>
                · {c.status} · {c.scopes.join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const btn: React.CSSProperties = {
  background: "#7c5cff",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};
