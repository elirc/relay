# Reconstructed diffs: the Relay review fixes

**Provenance note.** The build did not preserve pre-fix source snapshots, so
these diffs are **reconstructions**: the post-fix side is real code from the
delivered build, and the pre-fix side is rebuilt from the behavior recorded in
[reviews/sol-ui.md](../reviews/sol-ui.md) and
[reviews/astra-build.md](../reviews/astra-build.md). They exist so a learner
can study each finding as a reviewable change — read the finding, cover the
diff, write the fix you would make, then compare. The exact pre-fix spelling
may have differed; the behavior did not. Both findings were source-reasoned by
Sol, fixed by Astra, and later covered by browser verification (see
[VERIFICATION.md](../VERIFICATION.md)).

Line positions refer to the frontend as delivered on 2026-10-01 (one
`public/app.js`); the client has since been split into modules, so search for
the quoted code rather than trusting locations.

---

## Fix 1 — A blank wait duration must stay blank (not become zero)

**Observed risk (source-reasoned):** the wait-duration input handler stored
`Number(input.value)`. Clearing the required field made `Number("")` become
`0`. Reordering the steps rerendered that blank as a **valid zero-millisecond
wait**, so native `required` validation could no longer block publication of a
definition the user never finished.

```diff
   if (input.dataset.stepField) {
-    state.edit.draftSteps[Number(input.dataset.index)][input.dataset.stepField] =
-      input.dataset.stepField === "ms" ? Number(input.value) : input.value;
+    state.edit.draftSteps[Number(input.dataset.index)][input.dataset.stepField] =
+      input.dataset.stepField === "ms"
+        ? input.value === ""
+          ? ""
+          : Number(input.value)
+        : input.value;
     markDirty();
   }
```

**Why it matters:** the server would still reject an invalid duration — but a
silently-coerced `0` is *valid*, so no layer would object. The user's
incomplete intent was converted into a different complete intent. The browser
regression (clear the duration, reorder, confirm publication stays blocked)
pins the fix.

**The general lesson:** form state that round-trips through a rerender must
preserve "not yet answered" as a distinct value. Coercing at input time
destroys the distinction; coerce at submit/validation time instead.

---

## Fix 2 — An expired session must not strand the old shell

**Observed risk (source-reasoned):** server sessions expire after seven days,
but a 401 inside the original two-second `refresh()` loop only wrote a page
error. Navigation remained in the stale shell — and Logout's own
`DELETE /api/session` *also required authentication*, so the user could not
even sign out cleanly.

The fix has three parts (post-fix code, from the delivered build):

1. The API helper routes any non-login 401 for the current session epoch to an
   explicit recovery dialog instead of a dead error label:

```js
if (response.status === 401 && path !== "/session" && state.user && epoch === state.sessionEpoch)
  showExpiredSession();
```

2. `showExpiredSession()` opens a dialog that says the draft and form inputs
   are still there, offering "Reopen session" or "Back to sign in". Reconnect
   preserves the draft and **does not automatically repeat the failed write** —
   the user retries explicitly.

3. Logout treats an expired session as already signed out:

```js
await api("/session", { method: "DELETE" }).catch((error) => {
  if (error.status !== 401) throw error;
});
```

**Why it matters:** the backend behaved correctly at every step (reject old
token, require auth). The failure was composed entirely of correct pieces —
which is why API tests could never catch it, and why the browser suite's
session-recovery scenario exists. Root's verification expired the stored
session, attempted a save, reconnected, and confirmed the unsaved draft
survived without an automatic replay of the write.

**Related backend lesson** (from root's integration review, fixed in the same
round): cookie `Max-Age` does not enforce lifetime against a client that keeps
sending the token — the server ages sessions itself. The same lesson had been
found in Stockade first; see the session middleware in [src/app.js](../../src/app.js).

---

## What to take from these as a learner

Both findings live on the boundary between layers that are each individually
correct. Neither is visible in an API test; neither is a styling bug. Finding
them required reading the client as a concurrent system with a lifetime — the
skill [PRACTICE-WORKBOOK.md](../PRACTICE-WORKBOOK.md) Lab 6 practices.
