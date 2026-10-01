import { createApp } from "./app.js";
const port = process.env.PORT === undefined ? 4319 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be an integer from 0 to 65535.");
const instance = createApp({
  dbPath: process.env.DB_PATH || "data/relay.sqlite",
  providerDbPath: process.env.PROVIDER_DB_PATH || "data/provider.sqlite",
});
const server = instance.app.listen(port, "127.0.0.1", () =>
  console.log(`Relay ready http://127.0.0.1:${server.address().port}`),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    instance.close();
    process.exitCode = 0;
    if (process.connected) process.disconnect();
  });
  server.closeIdleConnections();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.on("message", (message) => {
  if (message === "shutdown") shutdown();
});
server.on("error", (error) => {
  console.error(error.message);
  instance.close();
  process.exitCode = 1;
});
