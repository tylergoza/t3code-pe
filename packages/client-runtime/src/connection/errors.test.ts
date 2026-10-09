import { EnvironmentAuthInvalidError } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { mapRemoteEnvironmentError } from "./errors.ts";
import { RemoteEnvironmentAuthFetchError, RemoteEnvironmentAuthTimeoutError } from "../rpc/http.ts";

describe("mapRemoteEnvironmentError", () => {
  it("blocks the connection on an invalid environment credential", () => {
    const mapped = mapRemoteEnvironmentError(
      new EnvironmentAuthInvalidError({
        code: "auth_invalid",
        reason: "invalid_credential",
        traceId: "trace-1",
      }),
    );
    expect(mapped).toMatchObject({
      _tag: "ConnectionBlockedError",
      reason: "authentication",
      detail: "The environment credential is invalid.",
      traceId: "trace-1",
    });
  });

  it.each([
    [
      "network",
      new RemoteEnvironmentAuthFetchError({
        message: "Failed to fetch remote environment endpoint.",
        cause: new TypeError("Failed to fetch"),
      }),
    ],
    ["timeout", new RemoteEnvironmentAuthTimeoutError("https://environment.example.test", 10_000)],
  ] as const)("retries a %s failure with the original message", (reason, error) => {
    expect(mapRemoteEnvironmentError(error)).toMatchObject({
      _tag: "ConnectionTransientError",
      reason,
      detail: error.message,
    });
  });
});
