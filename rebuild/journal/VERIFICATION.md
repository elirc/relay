# Relay verification

Final checks completed on 1 October 2026 after source formatting. Runtime: Windows, Node 22.16.0, Express 5.2.1, Playwright 1.63.0 and Chromium. All tests use isolated stores; the working demo's saved data is separate.

| Command | Result |
| --- | --- |
| `npm run check` | 12 JavaScript files passed syntax checks |
| `npm test` | 12 passed, 0 failed, 0 skipped |
| `npm run test:browser` | 10 browser scenarios passed; no browser runtime errors |

## What was demonstrated

- A real worker process exited with code 86 after the provider committed a receipt and before the notification checkpoint. A restarted process completed on attempt 2, retaining the original transform checkpoint and exactly one provider receipt.
- Two workers competed for persisted work. Expired or replaced lease tokens could not checkpoint. Cancellation invalidated an active lease.
- Runs retained immutable published versions; same-key replay after republishing returned the original run. Invalid edits did not advance draft versions.
- Retry exhaustion, manual recovery, bounded durable outputs, simultaneous fresh-database startup, and server-side session expiration passed.
- The actual start supervisor launched both children, completed a run, then shut down through IPC without its forced-kill fallback; its HTTP listener closed.
- Browser scenarios covered creating and composing workflows, publishing, three-step execution, output/receipt inspection, stale draft conflicts, session recovery preserving unsaved fields, uncertain run submission recovery, cancellation, failed-run retry, search, persistence and mobile layout.
- Clearing a wait duration and reordering preserved the empty value and blocked publication. Expiring the stored session produced a reconnect dialog; reconnect preserved the draft and did not automatically repeat its write.

Root visually inspected desktop and mobile screenshots. Test harness selectors were tightened where sidebar and content buttons shared labels; those initial automation failures were not product failures.

## Evidence and reproduction

Raw command output is in [evidence/backend-tests.txt](evidence/backend-tests.txt), [evidence/browser-tests.txt](evidence/browser-tests.txt), and [evidence/syntax.txt](evidence/syntax.txt). The evidence folder also contains browser-results.json, screenshots, runtime details and SHA-256 hashes of the verified implementation and tests. Agent reports under [reviews](reviews) distinguish source review from executed tests.

Run the commands above from this folder. Install dependencies with `npm ci`; if necessary install the matching browser with `npx playwright install chromium`. Node 22.16 emits an expected experimental SQLite warning. Windows PowerShell may wrap that stderr warning as a NativeCommandError in captured text; the recorded commands exited successfully and their assertions passed.

The notification provider is a local adapter backed by a separate SQLite database, not a remote network service. These results establish the tested crash/retry behavior with that cooperating provider. They do not prove universal exactly-once effects, distributed scalability, arbitrary-code isolation, or production authentication. The UI uses a local in-process worker during browser automation; the independent durability and lifecycle suites exercise real child processes.
