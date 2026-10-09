import { describe, expect, it } from "vite-plus/test";

import { webhookAddress } from "./webhookAddress.ts";

const path = "/api/hooks/scheduled-task%3Ahook/token";
const endpoint = () => ({ path, hasSecret: false });

describe("webhookAddress", () => {
  it("builds a direct URL on the environment's address", () => {
    const result = webhookAddress(endpoint(), "https://mac.example.com/");
    expect(result.address).toBe(`https://mac.example.com${path}`);
    expect(result.copyable).toBe(true);
    expect(result.note).toContain("your own proxy");
  });

  it("says only this computer can call a loopback address", () => {
    const result = webhookAddress(endpoint(), "http://127.0.0.1:3773/");
    expect(result.copyable).toBe(true);
    expect(result.note).toContain("Only this computer");
  });

  it("falls back to the path when the address is unknown", () => {
    expect(webhookAddress(endpoint(), null)).toMatchObject({
      address: path,
      copyable: false,
    });
  });
});
