import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as DesktopPreReadyFileSystem from "./DesktopPreReadyFileSystem.ts";
import * as DesktopUserData from "./DesktopUserData.ts";

const resolveWindowsUserData = (appDataDirectory: string) =>
  DesktopUserData.resolveUserDataPath({
    appDataDirectory,
    isDevelopment: false,
    platform: "win32",
  }).pipe(Effect.provide(DesktopPreReadyFileSystem.layer));

it.layer(NodeServices.layer)("DesktopPreReadyFileSystem", (it) => {
  it.effect("never copies upstream Windows profile state", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-pre-ready-fs-" });
      yield* fileSystem.makeDirectory(path.join(root, "upstream"));
      yield* fileSystem.writeFileString(path.join(root, "upstream", "Local State"), "keys");

      const userData = yield* resolveWindowsUserData(root);

      assert.equal(userData, path.join(root, "t3code-pe"));
      assert.isFalse(yield* fileSystem.exists(path.join(userData, "Local State")));
    }),
  );
});
