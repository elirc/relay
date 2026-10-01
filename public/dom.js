// DOM, markup, and formatting helpers. Nothing here talks to the server; the
// only state it touches is the shared busy flag that setDialogBusy maintains.
import { state } from "./state.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Every piece of user-provided text passes through here before being placed in
// innerHTML. The server stores text verbatim; the browser must never interpret
// it as markup.
export const esc = (value) =>
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
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.workflow}</svg>`;
export const labels = {
  queued: "Queued",
  running: "Running",
  waiting_retry: "Retry scheduled",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};
export const types = {
  transform: "Transform text",
  wait: "Wait a moment",
  notify: "Send notification",
};
export const status = (value) =>
  `<span class="status-badge ${esc(value)}"><span class="status-dot"></span>${esc(labels[value] || value)}</span>`;
export const when = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const time = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
let toastTimer;
export function toast(message, error = false) {
  clearTimeout(toastTimer);
  const node = $("#toast");
  node.textContent = message;
  node.className = error ? "error-toast" : "";
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4500);
}
export function errorMarkup(message) {
  return `<div class="error" role="alert">${esc(message)}</div>`;
}
export function setError(id, message) {
  const node = $(`#${id}`);
  if (node) node.innerHTML = message ? errorMarkup(message) : "";
}
export function closeDialogs() {
  $$("dialog").forEach((dialog) => dialog.close());
}
export function setDialogBusy(busy) {
  state.dialogBusy = busy;
  $$(
    "dialog[open] input,dialog[open] textarea,dialog[open] select,dialog[open] button",
  ).forEach((control) => {
    control.disabled = busy;
  });
}
