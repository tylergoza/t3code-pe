import { assert, describe, it } from "@effect/vitest";
import type { ServerProviderModel } from "@t3tools/contracts";

import { mergeClaudeReportedModels } from "./ClaudeProvider.ts";

const known: ServerProviderModel = {
  slug: "claude-known-1",
  name: "Claude Known 1",
  aliases: ["known"],
  isCustom: false,
  capabilities: null,
};

describe("mergeClaudeReportedModels", () => {
  it("appends only models the catalog does not already cover", () => {
    const merged = mergeClaudeReportedModels(
      [known],
      [
        { value: "default", displayName: "Default", description: "" },
        { value: "known", resolvedModel: "claude-known-1", displayName: "Known", description: "" },
        { value: "claude-known-1[1m]", displayName: "Known 1M", description: "" },
        {
          value: "fresh",
          resolvedModel: "claude-fresh-2",
          displayName: "Claude Fresh 2",
          description: "",
          supportedEffortLevels: ["low", "high"],
        },
        { value: "claude-fresh-2", displayName: "Duplicate", description: "" },
      ],
    );

    assert.deepStrictEqual(
      merged.map((model) => model.slug),
      ["claude-known-1", "claude-fresh-2"],
    );
    const fresh = merged[1]!;
    assert.strictEqual(fresh.name, "Claude Fresh 2");
    assert.strictEqual(fresh.isCustom, false);
    assert.deepStrictEqual(
      fresh.capabilities?.optionDescriptors?.[0]?.type === "select"
        ? fresh.capabilities.optionDescriptors[0].options.map((option) => option.id)
        : [],
      ["low", "high"],
    );
  });

  it("returns the original list when Claude Code reports nothing new", () => {
    const models = [known];
    assert.strictEqual(mergeClaudeReportedModels(models, []), models);
  });
});
