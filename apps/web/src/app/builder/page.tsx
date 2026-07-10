"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { Panel } from "@/lib/ui";

interface Field {
  name: string;
  type: string;
  optional: boolean;
}
interface ActionMeta {
  key: string;
  name: string;
  idempotency: string;
  input: Field[];
}
interface ConnMeta {
  key: string;
  name: string;
  actions: ActionMeta[];
  triggers: { key: string; name: string; type: string }[];
}
interface RelayRow {
  id: string;
  name: string;
  latest: { version: number; status: string } | null;
}
interface Step {
  id: string;
  connector: string;
  action: string;
  config: Record<string, string>;
}

export default function BuilderPage() {
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [connectors, setConnectors] = useState<ConnMeta[]>([]);
  const [relays, setRelays] = useState<RelayRow[]>([]);
  const [relayId, setRelayId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [trigger, setTrigger] = useState({ connector: "", trigger: "" });
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<string>("");

  const loadRelays = useCallback(() => {
    apiGet<RelayRow[]>("/api/relays").then(setRelays).catch(() => setRelays([]));
  }, []);

  useEffect(() => {
    apiGet<{ user: { email: string } }>("/auth/me")
      .then((r) => {
        setMe(r.user);
        apiGet<ConnMeta[]>("/api/connectors").then(setConnectors);
        loadRelays();
      })
      .catch(() => setMe(null));
  }, [loadRelays]);

  const signIn = async () => {
    const r = await apiPost<{ user: { email: string } }>("/auth/dev-login");
    setMe(r.user);
    apiGet<ConnMeta[]>("/api/connectors").then(setConnectors);
    loadRelays();
  };

  const createRelay = async () => {
    if (!newName.trim()) return;
    const r = await apiPost<{ id: string }>("/api/relays", { name: newName.trim() });
    setNewName("");
    setRelayId(r.id);
    loadRelays();
  };

  const addStep = () => {
    const c = connectors[0];
    setSteps((s) => [
      ...s,
      { id: `s${s.length}`, connector: c?.key ?? "", action: c?.actions[0]?.key ?? "", config: {} },
    ]);
  };

  const actionFor = (connector: string, action: string): ActionMeta | undefined =>
    connectors.find((c) => c.key === connector)?.actions.find((a) => a.key === action);

  const saveDraft = async () => {
    if (!relayId) return;
    await apiPut(`/api/relays/${relayId}/draft`, { trigger, steps });
    setResult("Draft saved.");
    loadRelays();
  };

  const testRun = async () => {
    if (!relayId) return;
    try {
      const r = await apiPost<{ ok: boolean; plan?: unknown; error?: string }>(
        `/api/relays/${relayId}/test-run`,
        { trigger: { values: { email: "sample@demo.com", name: "Sample" } } },
      );
      setResult(JSON.stringify(r, null, 2));
    } catch (e) {
      setResult(String(e));
    }
  };

  const publish = async () => {
    if (!relayId) return;
    await apiPost(`/api/relays/${relayId}/publish`);
    setResult("Published.");
    loadRelays();
  };

  if (!me) {
    return (
      <section>
        <h2>Builder</h2>
        <Panel>Sign in to build relays.</Panel>
        <button onClick={signIn} style={btn}>
          Sign in (dev)
        </button>
      </section>
    );
  }

  return (
    <section>
      <h2>Builder</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={input} placeholder="New relay name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button style={btn} onClick={createRelay}>
          Create
        </button>
        <select style={input} value={relayId ?? ""} onChange={(e) => setRelayId(e.target.value || null)}>
          <option value="">— select relay —</option>
          {relays.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} {r.latest ? `(v${r.latest.version} ${r.latest.status})` : ""}
            </option>
          ))}
        </select>
      </div>

      {relayId && (
        <>
          <h3>Trigger</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={input} value={trigger.connector} onChange={(e) => setTrigger({ connector: e.target.value, trigger: "" })}>
              <option value="">— connector —</option>
              {connectors.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <select style={input} value={trigger.trigger} onChange={(e) => setTrigger((t) => ({ ...t, trigger: e.target.value }))}>
              <option value="">— trigger —</option>
              {connectors.find((c) => c.key === trigger.connector)?.triggers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <h3 style={{ marginTop: 16 }}>Steps</h3>
          {steps.map((step, i) => {
            const meta = actionFor(step.connector, step.action);
            return (
              <div key={step.id} style={stepBox}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <strong>{i + 1}.</strong>
                  <select
                    style={input}
                    value={step.connector}
                    onChange={(e) => {
                      const c = connectors.find((x) => x.key === e.target.value);
                      setSteps((s) => s.map((st, j) => (j === i ? { ...st, connector: e.target.value, action: c?.actions[0]?.key ?? "", config: {} } : st)));
                    }}
                  >
                    {connectors.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    style={input}
                    value={step.action}
                    onChange={(e) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, action: e.target.value, config: {} } : st)))}
                  >
                    {connectors.find((c) => c.key === step.connector)?.actions.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {meta && <span style={{ color: "#8b93a1", fontSize: 12 }}>idempotency: {meta.idempotency}</span>}
                </div>
                {/* Schema-generated form: fields come from the connector's zod input schema (S3). No
                    per-connector UI code — the 10th connector gets its form for free. */}
                {meta?.input.map((f) => (
                  <div key={f.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0" }}>
                    <label style={{ width: 90, color: "#8b93a1", fontSize: 13 }}>
                      {f.name}
                      {f.optional ? "" : " *"}
                    </label>
                    <input
                      style={{ ...input, flex: 1 }}
                      placeholder={`literal or {{steps.${Math.max(0, i - 1)}.output.…}}`}
                      value={step.config[f.name] ?? ""}
                      onChange={(e) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, config: { ...st.config, [f.name]: e.target.value } } : st)))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          <button style={ghost} onClick={addStep}>
            + Add step
          </button>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={btn} onClick={saveDraft}>
              Save draft
            </button>
            <button style={ghost} onClick={testRun}>
              Test run
            </button>
            <button style={ghost} onClick={publish}>
              Publish
            </button>
          </div>
          {result && <pre style={pre}>{result}</pre>}
        </>
      )}
    </section>
  );
}

const btn: React.CSSProperties = { background: "#7c5cff", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" };
const ghost: React.CSSProperties = { background: "transparent", color: "#e6e9ef", border: "1px solid #232a32", borderRadius: 8, padding: "8px 14px", cursor: "pointer" };
const input: React.CSSProperties = { background: "#0b0d10", color: "#e6e9ef", border: "1px solid #232a32", borderRadius: 8, padding: "7px 10px" };
const stepBox: React.CSSProperties = { border: "1px solid #232a32", borderRadius: 10, padding: 12, marginBottom: 10 };
const pre: React.CSSProperties = { background: "#14181d", border: "1px solid #232a32", borderRadius: 10, padding: 12, overflowX: "auto", fontSize: 12, marginTop: 12 };
