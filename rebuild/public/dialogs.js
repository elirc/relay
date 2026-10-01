// The create-workflow and start-run dialogs. The run dialog owns the run
// idempotency key: minted when the dialog opens, re-minted when the input text
// changes, and reused unchanged on a retry so a lost response cannot create a
// second run for the same intent.
import { $, esc, icon, setDialogBusy, setError, toast } from "./dom.js";
import { state } from "./state.js";
import { api } from "./api.js";
import { navigate } from "./views.js";

export function openCreate() {
  if (state.busy) return;
  const dialog = $("#create-dialog");
  dialog.innerHTML = `<form id="create-form"><div class="dialog-header"><div><div class="eyebrow">A new rhythm</div><h2 id="create-title">What should flow next?</h2></div><button type="button" class="icon-button" data-close="create-dialog" aria-label="Close new workflow">${icon("close")}</button></div><div class="dialog-body"><div id="create-error"></div><div class="field"><label for="create-name">Workflow name</label><input id="create-name" name="name" required maxlength="120" placeholder="A small but useful idea"></div><div class="field"><label for="create-description">Description (optional)</label><textarea id="create-description" name="description" maxlength="1000" rows="3" placeholder="What will this workflow take care of?"></textarea></div></div><div class="dialog-footer"><button type="button" class="button" data-close="create-dialog">Cancel</button><button class="button primary" type="submit">Create workflow ${icon("arrow")}</button></div></form>`;
  dialog.showModal();
  $("#create-name").focus();
}
export async function createWorkflow(form) {
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
export function openRun(workflowId) {
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
export async function startRun(form) {
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
