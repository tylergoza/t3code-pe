# Model manifest

The [bundled manifest](../../apps/server/src/provider/model-manifest.json) is the
only built-in source; T3 Code EE never fetches it from the network. An admin can
place a manifest of the same shape at `<stateDir>/model-manifest.local.json` to
update model metadata between releases. It must pass catalog-reference and
provider adapter validation, and it only applies when its `updatedAt` is not older
than the bundle's, so an upgrade cannot be masked by a stale override. Bump
`updatedAt` whenever either file changes.

Claude also merges in models the installed Claude Code reports at initialization
that the manifest does not know (`mergeClaudeReportedModels` in
[ClaudeProvider.ts](../../apps/server/src/provider/ClaudeProvider.ts)). Those get
the effort levels Claude Code advertises but no manifest runtime profile.

Generic catalog data describes presentation and capabilities. Each provider owns
its adapter schema and dispatch mappings. Claude uses the manifest for its entire
built-in catalog. Adding a model with an existing capability profile is a JSON
edit; a new profile is needed only for a new capability combination. Codex still
gets its model list from its app server.

A model that needs a newer provider CLI should still be announced as soon as it
ships. Claude entries set `adapter.claudeCode.minVersion`; Codex entries set
`adapter.codex.minVersion`, since Codex's own `model/list` cannot name models
released after the installed build. Snapshots report those models in
`updateRequiredModels`, and the picker tells the user which update unlocks them.

`currentModels.claudeAgent` is the current-model classification overlay for
releases that predate catalog discovery; it does not add models to their catalogs.
Catalog-aware releases use `providers.claudeAgent.models[].status` instead.
Codex uses `currentModels.codex` as a legacy-classification overlay for discovered
models.

Model data is schema-validated configuration. Tests should cover resolver, local-override,
and adapter semantics with synthetic model names, so adding a model never requires
tests that repeat the configuration.
