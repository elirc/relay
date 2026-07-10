import { buildServer } from "./server";
import { env } from "./env";

const app = buildServer();

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((address) => {
    console.log(`api listening on ${address}`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
