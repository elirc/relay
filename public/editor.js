// The workflow draft editor: rendering, dirty tracking, compare-and-swap saves
// and publishes, and explicit conflict recovery. A 409 never overwrites the
// user's fields; recovery requires the explicit "Load latest draft" action.
import { $, $$, esc, icon, types, when, setError, toast } from "./dom.js";
import { state } from "./state.js";
import { api } from "./api.js";
import { footer, updateNav } from "./views.js";

export function editorMarkup() {
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
export function renderEditor() {
  updateNav(state.edit.name);
  $("#content").innerHTML = editorMarkup();
  updateDraftButtons();
}
export function markDirty() {
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
export async function loadEditor(id, token = state.pageToken) {
  const data = await api(`/workflows/${id}`);
  if (token !== state.pageToken) return;
  state.edit = structuredClone(data.workflow);
  state.versions = data.versions;
  state.dirty = false;
  state.conflict = false;
  renderEditor();
}
export async function saveDraft(publish = false) {
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
export async function reloadDraft() {
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
