import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect("uses T3 Code EE profile names and never an upstream T3 Code profile", () =>
  Effect.gen(function* () {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      assert.equal(
        yield* resolveUserDataPath({
          appDataDirectory: "/profiles",
          isDevelopment: false,
          platform,
        }),
        "/profiles/t3code-ee",
      );
    }
    assert.equal(
      yield* resolveUserDataPath({
        appDataDirectory: "/profiles",
        isDevelopment: true,
        platform: "darwin",
      }),
      "/profiles/t3code-ee-dev",
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
