import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "./server";

// Boots the app in-process. /health touches neither Postgres nor Redis, so this runs infra-free.
const app = buildServer();
afterAll(async () => {
  await app.close();
});

describe("health route", () => {
  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
