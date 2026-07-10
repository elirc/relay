"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { StatusDot, Panel, statusColor } from "@/lib/ui";

interface StepRun {
  id: string;
  stepId: string;
  status: string;
  attempt: number;
  error: string | null;
  output: unknown;
}
interface RunEvent {
  seq: number;
  type: string;
  stepId: string | null;
  at: string;
  data: unknown;
}
interface RunDetail {
  id: string;
  status: string;
  relay: { name: string };
  steps: StepRun[];
  events: RunEvent[];
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<RunDetail>(`/api/runs/${id}`)
      .then(setRun)
      .catch((e: unknown) => setErr(String(e)));
  }, [id]);

  if (err) return <Panel>{err}</Panel>;
  if (!run) return <Panel>Loading run…</Panel>;

  return (
    <section>
      <Link href="/" style={{ color: "#8b93a1", textDecoration: "none" }}>
        ← all runs
      </Link>
      <h2>
        <StatusDot status={run.status} />
        {run.relay.name}
      </h2>

      <h3>Steps</h3>
      {run.steps.length === 0 ? (
        <Panel>No steps ran.</Panel>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {run.steps.map((s) => (
            <li key={s.id} style={{ padding: "6px 0" }}>
              <StatusDot status={s.status} />
              <code>{s.stepId}</code>{" "}
              <span style={{ color: "#8b93a1" }}>
                attempt {s.attempt}
                {s.error ? ` · ${s.error}` : ""}
              </span>
              {/* Output is stored redacted (connection tokens masked before persist) — safe to show. */}
              {s.output != null && Object.keys(s.output as object).length > 0 && (
                <pre style={{ margin: "4px 0 0 15px", color: "#8b93a1", fontSize: 12 }}>
                  {JSON.stringify(s.output)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The execution event log — the whole reason history ships before the builder. Users debug
          THEIR workflow with THESE events, in seq order. */}
      <h3>Event log</h3>
      <ol style={{ paddingLeft: 18, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
        {run.events.map((e) => (
          <li key={e.seq} style={{ padding: "3px 0", color: statusColor(e.type.endsWith("failed") ? "failed" : "running") }}>
            <span style={{ color: "#e6e9ef" }}>{e.type}</span>
            {e.stepId ? <span style={{ color: "#8b93a1" }}> · {e.stepId}</span> : null}
            {e.data ? <span style={{ color: "#8b93a1" }}> · {JSON.stringify(e.data)}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
