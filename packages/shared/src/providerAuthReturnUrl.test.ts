import { describe, expect, it } from "vite-plus/test";
import { providerAuthReturnUrl } from "./providerAuthReturnUrl.ts";

describe("provider auth return destinations", () => {
  it.each(["t3code-ee", "t3code-ee-dev"])(
    "returns to %s Welcome and the selected settings instance",
    (scheme) => {
      expect(providerAuthReturnUrl(`${scheme}://app/welcome?code=secret#agents:machine-id`)).toBe(
        `${scheme}://app/welcome#agents:machine-id`,
      );
      expect(
        providerAuthReturnUrl(`${scheme}://app/settings/providers?instanceId=work&code=secret`),
      ).toBe(`${scheme}://app/settings/providers?instanceId=work`);
    },
  );
  it.each([
    "t3code-ee://attacker/welcome",
    "t3code-ee://app:123/welcome",
    "t3code-ee://app/auth/callback",
    "t3code-ee://user@ app/welcome",
    "t3code-ee://app/welcome/../evil",
    "https://attacker.example/welcome",
    "https://app.t3.codes/welcome",
    "file:///welcome",
    "javascript:alert(1)",
  ])("rejects %s", (url) => expect(providerAuthReturnUrl(url)).toBeUndefined());
});
