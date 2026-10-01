// Entry point: global event delegation, dialog lifecycle guards, the 2-second
// poll, and boot. All behavior lives in the modules this imports:
//
//   api.js     — the one fetch wrapper (same-origin JSON + write header)
//   state.js   — application state and the request-identity tokens
//   dom.js     — markup helpers, escaping, toast, dialog busy locking
//   session.js — sign-in screen, login, expired-session reconnect dialog
//   views.js   — shell, read-only views, navigation, and background refresh
//   editor.js  — draft editing, compare-and-swap saves, conflict recovery
//   dialogs.js — create-workflow and start-run dialogs and their writes
import { $, $$, closeDialogs, setError, toast } from "./dom.js";
import { state } from "./state.js";
import { api } from "./api.js";
import { login, renderLogin } from "./session.js";
import {
  filteredWorkflows,
  loadWorkspace,
  mutateRun,
  navigate,
  refresh,
  runsTable,
} from "./views.js";
import { markDirty, renderEditor, reloadDraft, saveDraft } from "./editor.js";
import { createWorkflow, openCreate, openRun, startRun } from "./dialogs.js";

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
    // A blank numeric field stays blank (never coerced to 0), so required
    // validation can catch it instead of publishing a zero-length wait.
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
// Dialog lifecycle guards. "cancel" fires on Escape: while a write is pending
// the dialog must stay open so the eventual response cannot land in a dialog
// the user has since repurposed. The session dialog never dismisses on Escape;
// leaving it requires an explicit reconnect or sign-out choice.
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
