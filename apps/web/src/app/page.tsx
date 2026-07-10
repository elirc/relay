"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { StatusDot, Panel } from "@/lib/ui";

interface RunRow {
  id: string;
  relay: string;
  status: string;
  createdAt: string;
}

export default function Home() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<RunRow[]>("/api/runs")
      .then(setRuns)
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  if (err) return <Panel>Couldn’t reach the API ({err}). Is it running on :3001?</Panel>;
  if (!runs) return <Panel>Loading runs…</Panel>;
  if (runs.length === 0)
    return (
      <Panel>
        No runs yet. Trigger one: <code>curl -X POST localhost:3001/hooks/demo</code>.
      </Panel>
    );

  return (
    <section>
      <h2>Runs</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {runs.map((r) => (
          <li
            key={r.id}
            style={{ padding: "10px 12px", borderBottom: "1px solid #232a32" }}
          >
            <Link href={`/runs/${r.id}`} style={{ color: "#e6e9ef", textDecoration: "none" }}>
              <StatusDot status={r.status} />
              <strong>{r.relay}</strong>{" "}
              <span style={{ color: "#8b93a1" }}>· {new Date(r.createdAt).toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
