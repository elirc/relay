// Workspace shell, the read-only views (overview, workflows, run history,
// run detail, receipts), navigation, and the background refresh.
import {
  $,
  $$,
  esc,
  icon,
  labels,
  types,
  status,
  when,
  time,
  errorMarkup,
  setError,
  toast,
} from "./dom.js";
import { state } from "./state.js";
import { api } from "./api.js";
import { loadEditor } from "./editor.js";

export async function fetchOverview() {
  const [flows, runs, summary] = await Promise.all([
    api("/workflows"),
    api("/runs"),
    api("/summary"),
  ]);
  return { workflows: flows.workflows, runs: runs.runs, summary };
}
export async function loadWorkspace() {
  const token = ++state.pageToken;
  state.loading = true;
  try {
    const data = await fetchOverview();
    if (token !== state.pageToken) return;
    Object.assign(state, data);
    renderShell();
    state.view = "overview";
    state.selectedId = null;
    renderOverview();
  } finally {
    if (token === state.pageToken) state.loading = false;
  }
}
export function renderShell() {
  $("#app").innerHTML =
    `<div class="app-layout"><aside class="sidebar" aria-label="Studio navigation"><div class="brand"><span class="brand-mark">r</span>relay<span>.</span></div><div class="nav-label">Workspace</div>${[
      ["overview", "Overview", "overview"],
      ["workflows", "Workflows", "workflow"],
      ["runs", "Run history", "runs"],
      ["receipts", "Provider inbox", "inbox"],
    ]
      .map(
        ([view, label, glyph]) =>
          `<button class="nav-button" data-view="${view}">${icon(glyph)}${label}${view === "workflows" ? `<span class="count" id="workflow-count">${state.workflows.length}</span>` : ""}</button>`,
      )
      .join(
        "",
      )}<div class="nav-label">Your workflows</div><div id="flow-nav">${flowNav()}</div><button class="nav-button" data-action="create-workflow">${icon("plus")}New workflow</button><div class="sidebar-bottom"><div class="simulation-card"><strong>${icon("shield")}A safe place to build.</strong>Local simulation. Real checkpoints.<br>No external services connected.</div></div></aside><div class="main"><header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false">${icon("menu")}</button><span>Workspace</span><span>/</span><strong id="breadcrumb">Overview</strong></div><div class="topbar-right"><span class="simulation-tag">Local simulation</span><details class="profile"><summary aria-label="Operator menu"><span class="avatar">MC</span><span class="profile-name">Maya Chen</span>${icon("chevron")}</summary><div class="profile-menu"><p>Local operator session<br>One shared workspace</p><button data-action="logout">${icon("logout")}Sign out</button></div></details></div></header><main class="content" id="content"></main></div></div>`;
}
function flowNav() {
  return state.workflows
    .slice(0, 8)
    .map(
      (flow) =>
        `<button class="nav-button ${state.view === "editor" && state.selectedId === flow.id ? "active" : ""}" data-workflow="${flow.id}"><span class="nav-dot"></span><span class="nav-flow-name">${esc(flow.name)}</span></button>`,
    )
    .join("");
}
export function updateNav(title) {
  $("#breadcrumb").textContent = title;
  $$("[data-view]").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === state.view),
  );
  $("#flow-nav").innerHTML = flowNav();
  $("#workflow-count").textContent = state.workflows.length;
  $(".sidebar")?.classList.remove("open");
  $('[data-action="menu"]')?.setAttribute("aria-expanded", "false");
}
export function footer() {
  return `<footer class="workspace-footer"><span><span class="worker-light ${state.summary?.worker?.online ? "" : "offline"}"></span>${state.summary?.worker?.online ? "Worker connected" : "Worker offline — start npm run worker"} · Changes saved on this computer</span><span>${icon("shield")}Local simulation · No external delivery</span></footer>`;
}
function summaryMarkup() {
  return [
    ["Workflows", state.summary?.workflowCount || 0, "workflow"],
    ["Total runs", state.summary?.runCount || 0, "runs"],
    ["Successful runs", state.summary?.succeededCount || 0, "check"],
    ["Provider receipts", state.summary?.receiptCount || 0, "inbox"],
  ]
    .map(
      ([label, value, glyph]) =>
        `<div class="stat"><div><div class="stat-label">${label}</div><div class="stat-value">${String(value).padStart(2, "0")}</div></div><span class="stat-icon">${icon(glyph)}</span></div>`,
    )
    .join("");
}
function workflowCard(flow) {
  return `<article class="workflow-card"><div class="workflow-card-main"><div class="workflow-card-top"><span class="workflow-icon">${icon("workflow")}</span><span class="pill ${flow.publishedVersion ? "" : "draft"}"><span class="dot"></span>${flow.publishedVersion ? "Published" : "Draft"}</span></div><h3>${esc(flow.name)}</h3><p>${esc(flow.description || "A little structure for your next good idea.")}</p><div class="step-preview">${
    flow.draftSteps.length
      ? flow.draftSteps
          .slice(0, 4)
          .map(
            (step, index) =>
              `${index ? icon("arrow") : ""}<span class="step-chip ${esc(step.type)}">${icon(step.type)}${esc({ transform: "Transform", wait: "Wait", notify: "Notify" }[step.type])}</span>`,
          )
          .join("")
      : '<span class="step-chip">Your first step is waiting</span>'
  }${flow.draftSteps.length > 4 ? `<span class="step-chip">+${flow.draftSteps.length - 4}</span>` : ""}</div></div><div class="workflow-card-footer"><span class="card-meta">${flow.draftSteps.length} draft step${flow.draftSteps.length === 1 ? "" : "s"} · ${flow.publishedVersion ? `Published v${flow.publishedVersion}` : "Not published yet"}</span><div class="card-actions"><button class="button ghost small" data-workflow="${flow.id}">Open ${icon("arrow")}</button><button class="button soft small" data-run-workflow="${flow.id}" ${flow.publishedVersion ? "" : "disabled"}>${icon("runs")}Run</button></div></div></article>`;
}
export function runsTable(runs) {
  return runs.length
    ? `<div class="runs-panel"><table class="runs-table"><thead><tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col">Started</th><th scope="col">Attempt</th></tr></thead><tbody>${runs.map((run) => `<tr><td><button class="run-link" data-run="${run.id}">${esc(run.workflowName)}<span class="run-sub">RUN-${String(run.id).padStart(4, "0")}</span></button></td><td>${status(run.status)}</td><td>v${run.workflowVersion}</td><td>${esc(when(run.createdAt))}</td><td>${run.attempt || "—"}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="runs-panel"><div class="empty">${icon("runs")}<h3>A little quiet before the flow.</h3><p>Run a published workflow and its real progress will appear here.</p></div></div>`;
}
export function renderOverview() {
  updateNav("Overview");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Your workflow studio</div><h1>Good work, on repeat.</h1><p class="subtext">A little structure. A lot less busywork. Make your everyday work flow.</p></div><div class="heading-actions"><button class="button primary" data-action="create-workflow">${icon("plus")}New workflow</button></div></section><div id="page-error"></div><section class="stats" aria-label="Workspace summary">${summaryMarkup()}</section><div class="section-heading"><div><h2>Your workflows</h2><p>Thoughtful steps, connected.</p></div><button class="section-link" data-view="workflows">View all ${icon("arrow")}</button></div><section class="workflow-grid">${state.workflows.slice(0, 4).map(workflowCard).join("")}</section><div class="lower-grid"><section><div class="section-heading"><div><h2>Recent runs</h2><p>A clear trail of what happened.</p></div><button class="section-link" data-view="runs">View history ${icon("arrow")}</button></div><div id="recent-runs">${runsTable(state.runs.slice(0, 5))}</div></section><aside class="note-card"><div class="note-icon">${icon("spark")}</div><h3>Pick up where<br>you left off.</h3><p>Every completed step gets a durable checkpoint. If a worker stops, the next one carries on.</p><div class="note-divider"></div><div class="mini-note">Published versions stay fixed.<br>Your next edit is a fresh draft.</div></aside></div>${footer()}`;
}
export function renderWorkflows() {
  updateNav("Workflows");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Ideas into motion</div><h1>Your workflows.</h1><p class="subtext">Compose a few simple steps. Publish a version you can count on.</p></div><div class="heading-actions"><button class="button primary" data-action="create-workflow">${icon("plus")}New workflow</button></div></section><div id="page-error"></div><div class="toolbar"><label class="sr-only" for="workflow-search">Search workflows</label><input class="search" id="workflow-search" type="search" placeholder="Find a workflow…" value="${esc(state.query)}" maxlength="120"></div><section class="workflow-grid" id="workflow-grid">${filteredWorkflows()}</section>${footer()}`;
}
export function filteredWorkflows() {
  const flows = state.workflows.filter((flow) =>
    `${flow.name} ${flow.description}`
      .toLowerCase()
      .includes(state.query.toLowerCase()),
  );
  return flows.length
    ? flows.map(workflowCard).join("")
    : '<div class="empty"><h3>No matching workflows.</h3><p>Try a different search or create something new.</p></div>';
}
export function renderRuns() {
  updateNav("Run history");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Every step leaves a trace</div><h1>A history of forward motion.</h1><p class="subtext">Real runs. Durable checkpoints. A clear path from input to outcome.</p></div><div class="heading-actions"><button class="button" data-action="refresh">${icon("refresh")}Refresh</button></div></section><div id="page-error"></div><div class="toolbar"><label class="sr-only" for="run-filter">Filter runs by status</label><select class="filter" id="run-filter"><option value="">All statuses</option>${Object.entries(
      labels,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${state.runFilter === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select><span class="field-note">Showing the latest 200 runs</span></div><div id="runs-list">${runsTable(state.runs.filter((run) => !state.runFilter || run.status === state.runFilter))}</div>${footer()}`;
}
export function renderReceipts() {
  updateNav("Provider inbox");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>The other side of a notification</div><h1>A small, durable inbox.</h1><p class="subtext">Messages accepted by the local mock provider, each with a stable receipt.</p></div><div class="heading-actions"><button class="button" data-action="refresh">${icon("refresh")}Refresh</button></div></section><div id="page-error"></div><div class="local-boundary">${icon("shield")}<span>These are simulated notifications, stored in a separate provider database. No real messages are sent. Repeating a run-step key returns the existing receipt instead of accepting another message.</span></div><div id="receipt-content">${receiptsMarkup()}</div>${footer()}`;
}
export function receiptsMarkup() {
  return state.receipts.length
    ? `<section class="receipt-list">${state.receipts.map((receipt) => `<article class="receipt"><div class="receipt-top"><span class="workflow-icon">${icon("inbox")}</span><span class="pill"><span class="dot"></span>Accepted</span></div><h3>Receipt ${String(receipt.id).padStart(4, "0")}</h3><p>${esc(receipt.message)}</p><div class="receipt-footer"><span class="receipt-key">Key ${esc(receipt.key)}</span><time>${esc(when(receipt.createdAt))}</time></div></article>`).join("")}</section>`
    : `<div class="runs-panel"><div class="empty">${icon("inbox")}<h3>No messages just yet.</h3><p>Run a workflow with a notification step to deliver a message to this local inbox.</p></div></div>`;
}

export async function navigate(view, id = null) {
  if (state.busy || state.dialogBusy) return;
  if (
    state.view === "editor" &&
    state.dirty &&
    view === "editor" &&
    id === state.selectedId
  )
    return;
  if (
    state.view === "editor" &&
    state.dirty &&
    (view !== "editor" || id !== state.selectedId) &&
    !confirm("Leave this draft? Your unsaved changes will be discarded.")
  )
    return;
  const token = ++state.pageToken;
  state.refreshToken++;
  state.loading = true;
  state.view = view;
  state.selectedId = id;
  $("#content").innerHTML =
    '<div class="loading" role="status">Gathering the details…</div>';
  try {
    if (view === "editor") await loadEditor(id, token);
    else if (view === "run") {
      const data = await api(`/runs/${id}`);
      if (token !== state.pageToken) return;
      state.runDetail = data;
      renderRun();
    } else if (view === "receipts") {
      const data = await api("/provider/receipts");
      if (token !== state.pageToken) return;
      state.receipts = data.receipts;
      renderReceipts();
    } else {
      const data = await fetchOverview();
      if (token !== state.pageToken) return;
      Object.assign(state, data);
      (
        ({
          overview: renderOverview,
          workflows: renderWorkflows,
          runs: renderRuns,
        })[view] || renderOverview
      )();
    }
  } catch (error) {
    if (token === state.pageToken)
      $("#content").innerHTML =
        `${errorMarkup(error.message)}<button class="button" data-action="retry-page">${icon("refresh")}Try again</button>`;
  } finally {
    if (token === state.pageToken) state.loading = false;
  }
}
// Polling is a reader, never a writer. It stays out of an open dialog or an
// active draft, and its data is discarded by the token checks below if a newer
// navigation has started.
export async function refresh() {
  if (
    !state.user ||
    state.loading ||
    state.busy ||
    state.dialogBusy ||
    $$("dialog").some((dialog) => dialog.open) ||
    state.view === "editor"
  )
    return;
  const token = ++state.refreshToken,
    page = state.pageToken;
  try {
    if (state.view === "run") {
      const data = await api(`/runs/${state.selectedId}`);
      if (token !== state.refreshToken || page !== state.pageToken) return;
      const changed =
        data.run.updatedAt !== state.runDetail?.run.updatedAt ||
        data.events.length !== state.runDetail?.events.length;
      state.runDetail = data;
      if (changed) renderRun();
    } else if (state.view === "receipts") {
      const data = await api("/provider/receipts");
      if (token !== state.refreshToken || page !== state.pageToken) return;
      state.receipts = data.receipts;
      $("#receipt-content").innerHTML = receiptsMarkup();
    } else {
      const data = await fetchOverview();
      if (token !== state.refreshToken || page !== state.pageToken) return;
      Object.assign(state, data);
      if (state.view === "overview") renderOverview();
      else if (state.view === "workflows")
        $("#workflow-grid").innerHTML = filteredWorkflows();
      else if (state.view === "runs")
        $("#runs-list").innerHTML = runsTable(
          state.runs.filter(
            (run) => !state.runFilter || run.status === state.runFilter,
          ),
        );
    }
    setError("page-error", "");
  } catch (error) {
    if (token === state.refreshToken && page === state.pageToken)
      setError(
        "page-error",
        `Refresh paused. Showing the last loaded data. ${error.message}`,
      );
  }
}
export function renderRun() {
  const { run, steps, events, definition } = state.runDetail;
  updateNav(`Run ${run.id}`);
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Run ${String(run.id).padStart(4, "0")} · Published version ${run.workflowVersion}</div><h1>${esc(run.workflowName)}</h1><p class="subtext">${run.status === "succeeded" ? "Every step, safely on the record." : run.status === "cancelled" ? "This run is cancelled. It will not resume." : run.status === "failed" ? "This run needs a little attention. Finished checkpoints are safe." : "Following the real work, one checkpoint at a time."}</p><div class="run-heading-meta">${status(run.status)}<span>Attempt ${run.attempt}</span><span>Created ${esc(when(run.createdAt))}</span></div></div><div class="heading-actions">${["queued", "running", "waiting_retry"].includes(run.status) ? `<button class="button danger" data-action="cancel-run">${icon("close")}Cancel run</button>` : ""}${run.status === "failed" ? `<button class="button primary" data-action="retry-run">${icon("refresh")}Retry run</button>` : ""}<button class="button" data-workflow="${run.workflowId}">Open workflow ${icon("arrow")}</button></div></section><div id="page-error"></div>${run.error ? errorMarkup(run.error) : ""}${run.status === "waiting_retry" ? `<div class="local-boundary">${icon("wait")}<span>Retry scheduled for ${esc(when(run.nextAttemptAt))}. The schedule and attempt count are stored durably.</span></div>` : ""}<div class="run-detail-grid"><section><div class="timeline"><h2>A step-by-step trail</h2>${definition.steps
      .map((step, index) => {
        const checkpoint = steps.find((item) => item.index === index);
        return `<article class="timeline-step"><span class="timeline-marker ${checkpoint ? "complete" : ""}">${checkpoint ? icon("check") : String(index + 1).padStart(2, "0")}</span><div class="timeline-copy"><h3>${esc(step.name)}</h3><p class="timeline-caption">${esc(types[step.type])} · ${checkpoint ? `Checkpoint saved ${esc(when(checkpoint.createdAt))}` : run.status === "cancelled" ? "Not completed · Run cancelled" : run.status === "failed" ? "No completed checkpoint" : index === steps.length && run.status === "running" ? "Worker active · Awaiting checkpoint" : "Pending"}</p>${checkpoint ? `<pre class="output">${esc(checkpoint.output.text)}</pre>` : ""}</div></article>`;
      })
      .join(
        "",
      )}</div><section class="audit"><h2>The audit trail</h2>${events.map((event) => `<div class="audit-entry"><time datetime="${esc(event.createdAt)}" title="${esc(when(event.createdAt))}">${esc(time(event.createdAt))}</time><span>${esc(event.detail)}</span></div>`).join("")}</section></section><aside class="inspector"><div class="inspector-card input-output"><h3>From input to output</h3><label>Input text</label><pre class="output">${esc(run.input.text)}</pre><label>${run.status === "succeeded" ? "Final output" : "Latest saved output"}</label>${run.output ? `<pre class="output">${esc(run.output.text)}</pre>` : "<p>No output checkpoint yet.</p>"}</div><div class="inspector-card"><h3>Built to pick up again.</h3><p>This run is pinned to published version ${run.workflowVersion}. Retries resume after the last finished step and reuse the same notification keys.</p></div><div class="inspector-card"><h3>A note on cancellation.</h3><p>Cancellation stops future checkpoints and prevents retries. A notification already accepted by the provider cannot be undone; an in-flight effect may still be accepted.</p></div></aside></div>${footer()}`;
}
export async function mutateRun(action) {
  if (state.busy) return;
  const runId = state.selectedId,
    token = state.pageToken;
  if (
    action === "cancel" &&
    !confirm(
      "Cancel this run? It will never resume. Notifications already accepted by the provider cannot be undone.",
    )
  )
    return;
  state.busy = true;
  state.refreshToken++;
  $$("button", $("#content")).forEach((button) => {
    button.disabled = true;
  });
  try {
    await api(`/runs/${runId}/${action}`, { method: "POST", body: {} });
    const data = await api(`/runs/${runId}`);
    if (token !== state.pageToken) return;
    state.runDetail = data;
    renderRun();
    toast(
      action === "cancel"
        ? "Run cancelled. Existing receipts are kept."
        : "Run queued again. Finished checkpoints are kept.",
    );
  } catch (error) {
    if (token === state.pageToken) {
      renderRun();
      setError("page-error", error.message);
    }
  } finally {
    state.busy = false;
  }
}
