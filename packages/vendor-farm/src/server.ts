import { buildVendorFarm } from "./index";

// Standalone farm for local dev / staging. Chaos is off by default here; tests dial it up per-case.
const port = Number(process.env.VENDOR_FARM_PORT ?? 4000);
const app = buildVendorFarm();

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => console.log(`vendor farm on ${address} (mailpost, sheetlite, chatbox)`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
