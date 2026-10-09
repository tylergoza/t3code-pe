// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("returns only the process environment for an unconfigured clone", () => {
    expect(loadRepoEnv({ baseEnv: { PORT: "1" }, repoRoot: makeTemporaryDirectory() })).toEqual({
      PORT: "1",
    });
  });

  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env"), "PORT=root\nHOST=root\nMODE=root\n");
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env.local"), "PORT=local\nHOST=local\n");

    expect(loadRepoEnv({ baseEnv: { PORT: "process" }, repoRoot })).toEqual({
      PORT: "process",
      HOST: "local",
      MODE: "root",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
