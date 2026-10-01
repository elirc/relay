// All mutable client state lives here, including the request-identity tokens.
//
// The tokens are this app's answer to out-of-order responses. A workflow draft
// has a server revision that says which stored state a write may replace; a
// screen has a token that says which in-flight response may still update it.
// Each async load captures the current token before awaiting and compares it
// afterward; anything that invalidates the screen bumps the token so stale
// responses are discarded:
//
//   pageToken     — owns the main content area (overview, editor, run detail,
//                   receipts); bumped by navigate, login, logout, and workspace
//                   load so only the newest navigation may render
//   refreshToken  — owns the 2-second background poll; bumped by navigate and
//                   sign-in/out so a slow poll for the previous screen is
//                   ignored, and checked together with pageToken because a
//                   poll must also lose to any newer navigation
//   sessionEpoch  — the operator session; bumped when a session is (re)opened
//                   so a 401 raced by a reconnect does not reopen the expired-
//                   session dialog for the session that already replaced it
//
// The busy/dialogBusy flags lock the editor or an open dialog while a write is
// pending, so a delayed response cannot land in a screen the user has since
// repurposed, and a second submit cannot duplicate the write.
export const state = {
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
