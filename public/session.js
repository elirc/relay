// Sign-in screen, the expired-session reconnect dialog, and login. Reconnect
// never replays the failed write; the user retries explicitly with their
// preserved draft (journal/reviews/astra-build.md, "Interface rationale").
import { $, errorMarkup, icon } from "./dom.js";
import { state } from "./state.js";
import { api } from "./api.js";
import { loadWorkspace } from "./views.js";

export function showExpiredSession() {
  const dialog = $("#session-dialog");
  if (dialog.open) return;
  dialog.innerHTML = `<div class="dialog-header"><div><div class="eyebrow">A fresh local session</div><h2 id="session-title">Let's reconnect.</h2></div></div><div class="dialog-body"><p class="subtext">Your operator session expired. Your current draft and form inputs are still here. Reopen the local session, then retry your action.</p><div id="session-error"></div></div><div class="dialog-footer"><button class="button" data-action="expired-signout">Back to sign in</button><button class="button primary" data-action="reauth">Reopen session</button></div>`;
  dialog.showModal();
}
export function renderLogin(error = "") {
  state.user = null;
  state.pageToken++;
  state.refreshToken++;
  $("#app").innerHTML =
    `<main class="login"><section class="login-art"><div class="brand"><span class="brand-mark">r</span>relay<span>.</span></div><div class="login-copy"><div class="eyebrow"><span class="eyebrow-line"></span>Make room for what matters</div><h1>Good work.<br><span>On repeat.</span></h1><p>A thoughtful little studio for the work that happens again and again. Build a flow. Let it find its rhythm.</p></div><div class="login-foot">Small steps. Reliably connected.</div></section><section class="login-main"><div class="login-form"><div class="eyebrow">Your local workflow studio</div><h2>Let's get things flowing.</h2><p>Explore durable workflows in a calm, self-contained workspace.</p>${error ? errorMarkup(error) : ""}<div class="login-identity"><span class="avatar">MC</span><span><strong>Maya Chen</strong><span>Local operator · One shared workspace</span></span></div><button class="button primary" data-action="login">Open your studio ${icon("arrow")}</button><p class="login-disclaimer">This is a passwordless local simulation. Notifications go to a durable mock inbox on this computer. No real email, external services, or arbitrary code.</p></div></section></main>`;
}
export async function login() {
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
