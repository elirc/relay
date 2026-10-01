// The only place the browser talks to the server. Every call is same-origin
// JSON with the session cookie; failures become Error objects carrying the
// HTTP status and, for 409 conflicts, the current server copy of the draft.
import { state } from "./state.js";
import { showExpiredSession } from "./session.js";

export async function api(path, options = {}) {
  // Captured before awaiting: a 401 may only open the reconnect dialog if no
  // newer session replaced the one this request was sent under.
  const epoch = state.sessionEpoch;
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      // Writes must carry this custom header. A cross-site form or fetch
      // cannot add it, so the server can reject cross-origin writes.
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
