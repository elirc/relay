const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const icons = {
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  workflow:
    '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v6a3 3 0 0 0 3 3H14m0-15h7v6h-7V3Zm-4 3h4"/>',
  runs: '<path d="m9 5 11 7-11 7V5Z"/>',
  inbox: '<path d="M5 4h14l3 11v5H2v-5L5 4Zm-3 11h6l2 3h4l2-3h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  transform:
    '<path d="m4 17 13-13 3 3L7 20H4v-3ZM14 7l3 3M4 3v4M2 5h4m12 11v4m-2-2h4"/>',
  wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  notify: '<path d="m22 2-7 20-4-9L2 9l20-7ZM11 13 22 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
  publish: '<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',
  logout: '<path d="M9 5H4v14h5m5-14 7 7-7 7m-6-7h13"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.workflow}</svg>`;
const labels = {
  queued: "Queued",
  running: "Running",
  waiting_retry: "Retry scheduled",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};
const types = {
  transform: "Transform text",
  wait: "Wait a moment",
  notify: "Send notification",
};
const status = (value) =>
  `<span class="status-badge ${esc(value)}"><span class="status-dot"></span>${esc(labels[value] || value)}</span>`;
const when = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const time = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const state = {
  user: null,
  workflows: [],
  runs: [],
  receipts: [],
  summary: null,
  view: "overview",
  selectedId: null,
  pageToken: 0,
  refreshToken: 0,
  sessionEpoch: 0,
  loading: false,
  busy: false,
  dialogBusy: false,
  edit: null,
  versions: [],
  dirty: false,
  conflict: false,
  runDetail: null,
  runKey: null,
  runWorkflow: null,
  query: "",
  runFilter: "",
};
let toastTimer;
async function api(path, options = {}) {
  const epoch = state.sessionEpoch;
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.method && options.method !== "GET"
        ? { "X-Relay-Request": "1" }
        : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/session" &&
      state.user &&
      epoch === state.sessionEpoch
    )
      showExpiredSession();
    const error = new Error(
      data.error || `Request failed (${response.status}).`,
    );
    Object.assign(error, { status: response.status, current: data.current });
    throw error;
  }
  if (path === "/session" && options.method === "POST") state.sessionEpoch++;
  return data;
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const node = $("#toast");
  node.textContent = message;
  node.className = error ? "error-toast" : "";
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4500);
}
function errorMarkup(message) {
  return `<div class="error" role="alert">${esc(message)}</div>`;
}
function setError(id, message) {
  const node = $(`#${id}`);
  if (node) node.innerHTML = message ? errorMarkup(message) : "";
}
function closeDialogs() {
  $$("dialog").forEach((dialog) => dialog.close());
}
function setDialogBusy(busy) {
  state.dialogBusy = busy;
  $$(
    "dialog[open] input,dialog[open] textarea,dialog[open] select,dialog[open] button",
  ).forEach((control) => {
    control.disabled = busy;
  });
}
function showExpiredSession() {
  const dialog = $("#session-dialog");
  if (dialog.open) return;
  dialog.innerHTML = `<div class="dialog-header"><div><div class="eyebrow">A fresh local session</div><h2 id="session-title">Let's reconnect.</h2></div></div><div class="dialog-body"><p class="subtext">Your operator session expired. Your current draft and form inputs are still here. Reopen the local session, then retry your action.</p><div id="session-error"></div></div><div class="dialog-footer"><button class="button" data-action="expired-signout">Back to sign in</button><button class="button primary" data-action="reauth">Reopen session</button></div>`;
  dialog.showModal();
}
function renderLogin(error = "") {
  state.user = null;
  state.pageToken++;
  state.refreshToken++;
  $("#app").innerHTML =
    `<main class="login"><section class="login-art"><div class="brand"><span class="brand-mark">r</span>relay<span>.</span></div><div class="login-copy"><div class="eyebrow"><span class="eyebrow-line"></span>Make room for what matters</div><h1>Good work.<br><span>On repeat.</span></h1><p>A thoughtful little studio for the work that happens again and again. Build a flow. Let it find its rhythm.</p></div><div class="login-foot">Small steps. Reliably connected.</div></section><section class="login-main"><div class="login-form"><div class="eyebrow">Your local workflow studio</div><h2>Let's get things flowing.</h2><p>Explore durable workflows in a calm, self-contained workspace.</p>${error ? errorMarkup(error) : ""}<div class="login-identity"><span class="avatar">MC</span><span><strong>Maya Chen</strong><span>Local operator · One shared workspace</span></span></div><button class="button primary" data-action="login">Open your studio ${icon("arrow")}</button><p class="login-disclaimer">This is a passwordless local simulation. Notifications go to a durable mock inbox on this computer. No real email, external services, or arbitrary code.</p></div></section></main>`;
}
async function login() {
  if (state.busy) return;
  state.busy = true;
  const button = $('[data-action="login"]');
  if (button) button.disabled = true;
  try {
    state.user = (await api("/session", { method: "POST", body: {} })).user;
    state.pageToken++;
    $("#app").innerHTML =
      '<main class="boot"><span class="brand-mark">r</span><p>Opening your studio…</p></main>';
    await loadWorkspace();
  } catch (error) {
    renderLogin(error.message);
  } finally {
    state.busy = false;
  }
}
async function fetchOverview() {
  const [flows, runs, summary] = await Promise.all([
    api("/workflows"),
    api("/runs"),
    api("/summary"),
  ]);
  return { workflows: flows.workflows, runs: runs.runs, summary };
}
async function loadWorkspace() {
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
function renderShell() {
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
function updateNav(title) {
  $("#breadcrumb").textContent = title;
  $$("[data-view]").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === state.view),
  );
  $("#flow-nav").innerHTML = flowNav();
  $("#workflow-count").textContent = state.workflows.length;
  $(".sidebar")?.classList.remove("open");
  $('[data-action="menu"]')?.setAttribute("aria-expanded", "false");
}
function footer() {
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
function runsTable(runs) {
  return runs.length
    ? `<div class="runs-panel"><table class="runs-table"><thead><tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col">Started</th><th scope="col">Attempt</th></tr></thead><tbody>${runs.map((run) => `<tr><td><button class="run-link" data-run="${run.id}">${esc(run.workflowName)}<span class="run-sub">RUN-${String(run.id).padStart(4, "0")}</span></button></td><td>${status(run.status)}</td><td>v${run.workflowVersion}</td><td>${esc(when(run.createdAt))}</td><td>${run.attempt || "—"}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="runs-panel"><div class="empty">${icon("runs")}<h3>A little quiet before the flow.</h3><p>Run a published workflow and its real progress will appear here.</p></div></div>`;
}
function renderOverview() {
  updateNav("Overview");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Your workflow studio</div><h1>Good work, on repeat.</h1><p class="subtext">A little structure. A lot less busywork. Make your everyday work flow.</p></div><div class="heading-actions"><button class="button primary" data-action="create-workflow">${icon("plus")}New workflow</button></div></section><div id="page-error"></div><section class="stats" aria-label="Workspace summary">${summaryMarkup()}</section><div class="section-heading"><div><h2>Your workflows</h2><p>Thoughtful steps, connected.</p></div><button class="section-link" data-view="workflows">View all ${icon("arrow")}</button></div><section class="workflow-grid">${state.workflows.slice(0, 4).map(workflowCard).join("")}</section><div class="lower-grid"><section><div class="section-heading"><div><h2>Recent runs</h2><p>A clear trail of what happened.</p></div><button class="section-link" data-view="runs">View history ${icon("arrow")}</button></div><div id="recent-runs">${runsTable(state.runs.slice(0, 5))}</div></section><aside class="note-card"><div class="note-icon">${icon("spark")}</div><h3>Pick up where<br>you left off.</h3><p>Every completed step gets a durable checkpoint. If a worker stops, the next one carries on.</p><div class="note-divider"></div><div class="mini-note">Published versions stay fixed.<br>Your next edit is a fresh draft.</div></aside></div>${footer()}`;
}
function renderWorkflows() {
  updateNav("Workflows");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Ideas into motion</div><h1>Your workflows.</h1><p class="subtext">Compose a few simple steps. Publish a version you can count on.</p></div><div class="heading-actions"><button class="button primary" data-action="create-workflow">${icon("plus")}New workflow</button></div></section><div id="page-error"></div><div class="toolbar"><label class="sr-only" for="workflow-search">Search workflows</label><input class="search" id="workflow-search" type="search" placeholder="Find a workflow…" value="${esc(state.query)}" maxlength="120"></div><section class="workflow-grid" id="workflow-grid">${filteredWorkflows()}</section>${footer()}`;
}
function filteredWorkflows() {
  const flows = state.workflows.filter((flow) =>
    `${flow.name} ${flow.description}`
      .toLowerCase()
      .includes(state.query.toLowerCase()),
  );
  return flows.length
    ? flows.map(workflowCard).join("")
    : '<div class="empty"><h3>No matching workflows.</h3><p>Try a different search or create something new.</p></div>';
}
function renderRuns() {
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
function renderReceipts() {
  updateNav("Provider inbox");
  $("#content").innerHTML =
    `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>The other side of a notification</div><h1>A small, durable inbox.</h1><p class="subtext">Messages accepted by the local mock provider, each with a stable receipt.</p></div><div class="heading-actions"><button class="button" data-action="refresh">${icon("refresh")}Refresh</button></div></section><div id="page-error"></div><div class="local-boundary">${icon("shield")}<span>These are simulated notifications, stored in a separate provider database. No real messages are sent. Repeating a run-step key returns the existing receipt instead of accepting another message.</span></div><div id="receipt-content">${receiptsMarkup()}</div>${footer()}`;
}
function receiptsMarkup() {
  return state.receipts.length
    ? `<section class="receipt-list">${state.receipts.map((receipt) => `<article class="receipt"><div class="receipt-top"><span class="workflow-icon">${icon("inbox")}</span><span class="pill"><span class="dot"></span>Accepted</span></div><h3>Receipt ${String(receipt.id).padStart(4, "0")}</h3><p>${esc(receipt.message)}</p><div class="receipt-footer"><span class="receipt-key">Key ${esc(receipt.key)}</span><time>${esc(when(receipt.createdAt))}</time></div></article>`).join("")}</section>`
    : `<div class="runs-panel"><div class="empty">${icon("inbox")}<h3>No messages just yet.</h3><p>Run a workflow with a notification step to deliver a message to this local inbox.</p></div></div>`;
}

function editorMarkup() {
  const flow = state.edit;
  return `<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span>Workflow studio · ${flow.publishedVersion ? `Published v${flow.publishedVersion}` : "Unpublished"}</div><h1>Connect the little things.</h1><p class="subtext">Shape your draft. Published versions stay exactly as they were.</p></div><div class="heading-actions"><button class="button" data-action="save-draft">${icon("save")}Save draft</button><button class="button soft" data-action="publish">${icon("publish")}Publish version</button><button class="button primary" data-run-workflow="${flow.id}" ${flow.publishedVersion ? "" : "disabled"}>${icon("runs")}Run</button></div></section><div id="page-error"></div><div id="draft-conflict" ${state.conflict ? "" : "hidden"}>${conflictMarkup()}</div><div class="editor-layout"><section><div class="editor-card"><h2 class="editor-title">The big picture <span class="draft-status ${state.dirty ? "dirty" : ""}" id="draft-status">${state.dirty ? "Unsaved changes" : `Draft revision ${flow.version} · Saved`}</span></h2><div class="field"><label for="workflow-name">Workflow name</label><input id="workflow-name" data-flow-field="name" value="${esc(flow.name)}" required maxlength="120"></div><div class="field"><label for="workflow-description">A little context</label><textarea id="workflow-description" data-flow-field="description" maxlength="1000" rows="2" placeholder="What should this workflow help you do?">${esc(flow.description)}</textarea></div></div><div class="section-heading"><div><h2>Your steps</h2><p>Output from one step becomes input to the next.</p></div><span class="field-note">${flow.draftSteps.length} / 10 steps</span></div><div id="step-editors">${flow.draftSteps.map(stepEditor).join("") || '<div class="editor-card"><p class="field-note">Every good flow starts somewhere. Add your first step below.</p></div>'}</div><button class="add-step" data-action="add-step" ${flow.draftSteps.length >= 10 ? "disabled" : ""}>${icon("plus")}Add a step</button></section><aside class="inspector"><div class="inspector-card"><h3>A reliable little rhythm.</h3><p>Transform text, take a short pause, or send a simulated notification. No custom code or outside connections.</p><div class="inspector-item"><span>Input</span><strong>Text</strong></div><div class="inspector-item"><span>Output storage</span><strong>Inline · 64 KB</strong></div><div class="inspector-item"><span>Execution</span><strong>Separate worker</strong></div></div><div class="inspector-card"><h3>Published versions</h3>${state.versions.length ? state.versions.map((version) => `<div class="version-row"><strong>Version ${version.number}${version.number === flow.publishedVersion ? " · Latest" : ""}</strong><span>${version.steps.length} steps · ${esc(when(version.createdAt))}</span></div>`).join("") : "<p>No published versions yet. Save your steps, then publish your first version.</p>"}</div><div class="inspector-card"><h3>One important distinction.</h3><p>Run starts the latest published version. Unsaved and unpublished draft changes are not part of that run.</p></div></aside></div>${footer()}`;
}
function conflictMarkup() {
  return `<div class="conflict" role="alert"><strong>This draft changed in another window.</strong><p>Your edits are still here. To continue, copy anything you want to keep, then load the latest draft. Loading it replaces your current fields.</p><button class="button small" data-action="reload-draft">Load latest draft</button></div>`;
}
function stepEditor(step, index) {
  return `<article class="step-editor" data-step="${index}"><header class="step-editor-header"><span class="step-number">${String(index + 1).padStart(2, "0")}</span><strong>Step ${index + 1}</strong><label class="sr-only" for="step-type-${index}">Step ${index + 1} type</label><select class="step-select" id="step-type-${index}" data-step-type="${index}">${Object.entries(
    types,
  )
    .map(
      ([value, label]) =>
        `<option value="${value}" ${step.type === value ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select><div class="step-tools"><button class="icon-button" data-step-up="${index}" aria-label="Move step ${index + 1} up" ${index === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-button" data-step-down="${index}" aria-label="Move step ${index + 1} down" ${index === state.edit.draftSteps.length - 1 ? "disabled" : ""}>${icon("down")}</button><button class="icon-button" data-step-remove="${index}" aria-label="Remove step ${index + 1}">${icon("close")}</button></div></header><div class="step-editor-body"><p class="step-hint">${{ transform: "Wrap the incoming text with a prefix and suffix.", wait: "Pause before the next step. A worker renews its lease while waiting.", notify: "Accept a message in the local mock provider. No real notification is sent." }[step.type]}</p><div class="field"><label for="step-name-${index}">Step name</label><input id="step-name-${index}" data-step-field="name" data-index="${index}" value="${esc(step.name)}" maxlength="120" required></div>${step.type === "wait" ? `<div class="field"><label for="step-ms-${index}">Wait duration (milliseconds)</label><input id="step-ms-${index}" type="number" min="0" max="30000" step="1" required data-step-field="ms" data-index="${index}" value="${step.ms}"><p class="field-note">0 to 30,000 milliseconds. 1,000 ms = 1 second.</p></div>` : `<div class="${step.type === "transform" ? "field-row" : ""}"><div class="field"><label for="step-prefix-${index}">${step.type === "notify" ? "Message prefix" : "Prefix"}</label><textarea id="step-prefix-${index}" data-step-field="prefix" data-index="${index}" rows="2" maxlength="20000" placeholder="Text to put before the input">${esc(step.prefix || "")}</textarea></div>${step.type === "transform" ? `<div class="field"><label for="step-suffix-${index}">Suffix</label><textarea id="step-suffix-${index}" data-step-field="suffix" data-index="${index}" rows="2" maxlength="20000" placeholder="Text to put after the input">${esc(step.suffix || "")}</textarea></div>` : ""}</div>`}</div></article>`;
}
function renderEditor() {
  updateNav(state.edit.name);
  $("#content").innerHTML = editorMarkup();
  updateDraftButtons();
}
function markDirty() {
  state.dirty = true;
  const node = $("#draft-status");
  if (node) {
    node.textContent = "Unsaved changes";
    node.classList.add("dirty");
  }
  updateDraftButtons();
}
function updateDraftButtons() {
  for (const action of ["save-draft", "publish"]) {
    const button = $(`[data-action="${action}"]`);
    if (button) button.disabled = state.busy || state.conflict;
  }
  if (state.conflict && $("#draft-status")) {
    $("#draft-status").textContent = "Conflict · Draft preserved";
    $("#draft-status").className = "draft-status conflicted";
  }
}
function editorBusy(busy) {
  state.busy = busy;
  $$("input,textarea,select,button", $("#content")).forEach((control) => {
    control.disabled = busy;
  });
  if (!busy) renderEditor();
}
async function loadEditor(id, token = state.pageToken) {
  const data = await api(`/workflows/${id}`);
  if (token !== state.pageToken) return;
  state.edit = structuredClone(data.workflow);
  state.versions = data.versions;
  state.dirty = false;
  state.conflict = false;
  renderEditor();
}
async function saveDraft(publish = false) {
  if (state.busy || state.conflict) return;
  const invalid = $$("input,textarea,select", $("#content")).find(
    (control) => !control.checkValidity(),
  );
  if (invalid) {
    invalid.reportValidity();
    return;
  }
  const flow = structuredClone(state.edit),
    token = state.pageToken;
  editorBusy(true);
  let message = "Draft saved. Your next idea has a home.";
  try {
    if (state.dirty) {
      const result = await api(`/workflows/${flow.id}`, {
        method: "PATCH",
        body: {
          version: flow.version,
          name: flow.name,
          description: flow.description,
          draftSteps: flow.draftSteps,
        },
      });
      if (token !== state.pageToken) return;
      state.edit = result.workflow;
      state.dirty = false;
    }
    if (publish) {
      const result = await api(`/workflows/${flow.id}/publish`, {
        method: "POST",
        body: { version: state.edit.version },
      });
      if (token !== state.pageToken) return;
      state.edit = result.workflow;
      state.versions.unshift(result.published);
      message = `Version ${result.published.number} published. Ready to run.`;
    }
    state.workflows = state.workflows.map((item) =>
      item.id === flow.id ? structuredClone(state.edit) : item,
    );
    toast(message);
  } catch (error) {
    if (token !== state.pageToken) return;
    if (error.status === 409 && error.current) {
      state.conflict = true;
    } else state.editorError = error.message;
  } finally {
    if (token === state.pageToken) {
      editorBusy(false);
      if (state.editorError) {
        setError("page-error", state.editorError);
        state.editorError = null;
      }
    }
  }
}
async function reloadDraft() {
  if (state.busy) return;
  editorBusy(true);
  const token = state.pageToken;
  let errorMessage;
  try {
    await loadEditor(state.selectedId, token);
    toast("Latest draft loaded. Review it before publishing.");
  } catch (error) {
    errorMessage = error.message;
  } finally {
    if (token === state.pageToken) {
      editorBusy(false);
      if (errorMessage) setError("page-error", errorMessage);
    }
  }
}

async function navigate(view, id = null) {
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
async function refresh() {
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
function renderRun() {
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
async function mutateRun(action) {
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
function openCreate() {
  if (state.busy) return;
  const dialog = $("#create-dialog");
  dialog.innerHTML = `<form id="create-form"><div class="dialog-header"><div><div class="eyebrow">A new rhythm</div><h2 id="create-title">What should flow next?</h2></div><button type="button" class="icon-button" data-close="create-dialog" aria-label="Close new workflow">${icon("close")}</button></div><div class="dialog-body"><div id="create-error"></div><div class="field"><label for="create-name">Workflow name</label><input id="create-name" name="name" required maxlength="120" placeholder="A small but useful idea"></div><div class="field"><label for="create-description">Description (optional)</label><textarea id="create-description" name="description" maxlength="1000" rows="3" placeholder="What will this workflow take care of?"></textarea></div></div><div class="dialog-footer"><button type="button" class="button" data-close="create-dialog">Cancel</button><button class="button primary" type="submit">Create workflow ${icon("arrow")}</button></div></form>`;
  dialog.showModal();
  $("#create-name").focus();
}
async function createWorkflow(form) {
  if (state.dialogBusy) return;
  const body = Object.fromEntries(new FormData(form));
  setDialogBusy(true);
  setError("create-error", "");
  try {
    const result = await api("/workflows", { method: "POST", body });
    state.workflows.push(result.workflow);
    setDialogBusy(false);
    $("#create-dialog").close();
    await navigate("editor", result.workflow.id);
    toast("A fresh workflow, ready for your ideas.");
  } catch (error) {
    setError("create-error", error.message);
  } finally {
    setDialogBusy(false);
  }
}
function openRun(workflowId) {
  if (state.busy) return;
  const flow =
    state.workflows.find((item) => item.id === workflowId) || state.edit;
  state.runWorkflow = workflowId;
  state.runKey = crypto.randomUUID();
  const dialog = $("#run-dialog");
  dialog.innerHTML = `<form id="run-form"><div class="dialog-header"><div><div class="eyebrow">${esc(flow.name)}</div><h2 id="run-title">Give it a little nudge.</h2></div><button type="button" class="icon-button" data-close="run-dialog" aria-label="Close run dialog">${icon("close")}</button></div><div class="dialog-body"><div id="run-error"></div><div class="field"><label for="run-input">Input text</label><textarea id="run-input" name="text" maxlength="10000" rows="5" placeholder="The text your first step will receive…"></textarea><p class="field-note">Starts the latest published version. Draft changes are not included.</p></div><div class="local-boundary">${icon("shield")}<span>Local simulation only. Notification steps deliver to the mock provider inbox on this computer.</span></div></div><div class="dialog-footer"><button type="button" class="button" data-close="run-dialog">Cancel</button><button class="button primary" type="submit">${icon("runs")}Start run</button></div></form>`;
  dialog.showModal();
  $("#run-input").focus();
}
async function startRun(form) {
  if (state.dialogBusy) return;
  const text = new FormData(form).get("text");
  setDialogBusy(true);
  setError("run-error", "");
  try {
    const result = await api(`/workflows/${state.runWorkflow}/runs`, {
      method: "POST",
      body: { input: { text }, idempotencyKey: state.runKey },
    });
    setDialogBusy(false);
    $("#run-dialog").close();
    if (state.view === "editor" && state.dirty) {
      toast(
        "Run created from the published version. Your unsaved draft is still open.",
      );
      state.runs.unshift(result.run);
    } else await navigate("run", result.run.id);
  } catch (error) {
    setError(
      "run-error",
      `${error.message} You can retry this request safely; its key is kept until you edit the input or close this dialog.`,
    );
  } finally {
    setDialogBusy(false);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  try {
    if (button.dataset.close) {
      if (!state.dialogBusy) $(`#${button.dataset.close}`).close();
      return;
    }
    if (button.dataset.view) {
      await navigate(button.dataset.view);
      return;
    }
    if (button.dataset.workflow) {
      await navigate("editor", Number(button.dataset.workflow));
      return;
    }
    if (button.dataset.run) {
      await navigate("run", Number(button.dataset.run));
      return;
    }
    if (button.dataset.runWorkflow) {
      openRun(Number(button.dataset.runWorkflow));
      return;
    }
    if (button.dataset.stepRemove !== undefined) {
      state.edit.draftSteps.splice(Number(button.dataset.stepRemove), 1);
      markDirty();
      renderEditor();
      return;
    }
    if (
      button.dataset.stepUp !== undefined ||
      button.dataset.stepDown !== undefined
    ) {
      const index = Number(button.dataset.stepUp ?? button.dataset.stepDown),
        target = index + (button.dataset.stepUp !== undefined ? -1 : 1);
      [state.edit.draftSteps[index], state.edit.draftSteps[target]] = [
        state.edit.draftSteps[target],
        state.edit.draftSteps[index],
      ];
      markDirty();
      renderEditor();
      $(
        `[data-step-${button.dataset.stepUp !== undefined ? "up" : "down"}="${target}"]`,
      )?.focus();
      return;
    }
    switch (button.dataset.action) {
      case "login":
        await login();
        break;
      case "create-workflow":
        openCreate();
        break;
      case "add-step":
        if (state.edit.draftSteps.length < 10) {
          state.edit.draftSteps.push({
            type: "transform",
            name: "Transform text",
            prefix: "",
            suffix: "",
          });
          markDirty();
          renderEditor();
          $(`#step-name-${state.edit.draftSteps.length - 1}`).focus();
        }
        break;
      case "save-draft":
        await saveDraft();
        break;
      case "publish":
        await saveDraft(true);
        break;
      case "reload-draft":
        await reloadDraft();
        break;
      case "refresh":
        button.disabled = true;
        await refresh();
        if (button.isConnected) button.disabled = false;
        break;
      case "retry-page":
        await navigate(state.view, state.selectedId);
        break;
      case "cancel-run":
        await mutateRun("cancel");
        break;
      case "retry-run":
        await mutateRun("retry");
        break;
      case "menu": {
        const open = $(".sidebar").classList.toggle("open");
        button.setAttribute("aria-expanded", String(open));
        break;
      }
      case "reauth": {
        const controls = $$("button", $("#session-dialog"));
        controls.forEach((control) => {
          control.disabled = true;
        });
        try {
          state.user = (
            await api("/session", { method: "POST", body: {} })
          ).user;
          $("#session-dialog").close();
          toast("Session reopened. Your draft is safe; retry your action.");
        } catch (error) {
          setError("session-error", error.message);
        } finally {
          controls.forEach((control) => {
            control.disabled = false;
          });
        }
        break;
      }
      case "expired-signout":
        if (
          (state.dirty || $("#run-dialog").open || $("#create-dialog").open) &&
          !confirm("Return to sign in and discard the current unsaved inputs?")
        )
          return;
        state.dirty = false;
        closeDialogs();
        renderLogin();
        break;
      case "logout":
        if (state.busy) return;
        if (
          state.view === "editor" &&
          state.dirty &&
          !confirm("Sign out and discard your unsaved draft?")
        )
          return;
        state.busy = true;
        try {
          await api("/session", { method: "DELETE" }).catch((error) => {
            if (error.status !== 401) throw error;
          });
          state.user = null;
          state.pageToken++;
          state.refreshToken++;
          state.dirty = false;
          closeDialogs();
          renderLogin();
        } finally {
          state.busy = false;
        }
        break;
    }
  } catch (error) {
    toast(error.message, true);
  }
});
document.addEventListener("submit", async (event) => {
  if (!["create-form", "run-form"].includes(event.target.id)) return;
  event.preventDefault();
  if (event.target.id === "create-form") await createWorkflow(event.target);
  else await startRun(event.target);
});
document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.flowField) {
    state.edit[input.dataset.flowField] = input.value;
    markDirty();
  }
  if (input.dataset.stepField) {
    state.edit.draftSteps[Number(input.dataset.index)][
      input.dataset.stepField
    ] =
      input.dataset.stepField === "ms"
        ? input.value === ""
          ? ""
          : Number(input.value)
        : input.value;
    markDirty();
  }
  if (input.id === "workflow-search") {
    state.query = input.value;
    $("#workflow-grid").innerHTML = filteredWorkflows();
  }
  if (input.id === "run-input") state.runKey = crypto.randomUUID();
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.dataset.stepType !== undefined) {
    const index = Number(input.dataset.stepType),
      old = state.edit.draftSteps[index];
    state.edit.draftSteps[index] = {
      type: input.value,
      name: old.name,
      ...(input.value === "wait"
        ? { ms: 1000 }
        : input.value === "transform"
          ? { prefix: "", suffix: "" }
          : { prefix: "" }),
    };
    markDirty();
    renderEditor();
    $(`#step-type-${index}`).focus();
  }
  if (input.id === "run-filter") {
    state.runFilter = input.value;
    $("#runs-list").innerHTML = runsTable(
      state.runs.filter(
        (run) => !state.runFilter || run.status === state.runFilter,
      ),
    );
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $(".sidebar")?.classList.remove("open");
    $(".profile")?.removeAttribute("open");
    $('[data-action="menu"]')?.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (event) => {
  const menu = $(".profile");
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
$$("dialog").forEach((dialog) =>
  dialog.addEventListener("cancel", (event) => {
    if (state.dialogBusy) event.preventDefault();
  }),
);
$("#session-dialog").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
window.addEventListener("beforeunload", (event) => {
  if (state.dirty && state.view === "editor") {
    event.preventDefault();
    event.returnValue = "";
  }
});
setInterval(() => {
  if (!document.hidden) refresh();
}, 2000);
async function boot() {
  try {
    try {
      state.user = (await api("/session")).user;
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    if (state.user) await loadWorkspace();
    else renderLogin();
  } catch (error) {
    renderLogin(error.message);
  }
}
boot();
