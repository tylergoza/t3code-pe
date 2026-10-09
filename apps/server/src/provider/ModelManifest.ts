/**
 * ModelManifest — provider-model metadata from the bundled
 * `model-manifest.json`, optionally replaced by a local override file.
 *
 * Provider catalogs and legacy classification live in `model-manifest.json`.
 * The bundled copy ships with every release. Admins can drop a newer copy at
 * `<stateDir>/model-manifest.local.json`; it wins when valid and not older
 * than the bundle. Nothing is fetched remotely.
 *
 * Providers with authoritative discovery can use only the classification
 * overlay. Providers with static catalogs can resolve presentation and
 * capabilities from `providers`, then decode their own allowlisted adapter
 * payload separately.
 */
import {
  ModelCapabilities,
  TrimmedNonEmptyString,
  type ProviderDriverKind,
  type ServerProviderModel,
  type ServerProviderUpdateRequiredModel,
} from "@t3tools/contracts";
import { codexModelFamily } from "@t3tools/shared/model";
import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../config.ts";
import { hasValidClaudeManifestAdapters } from "./ClaudeModelManifest.ts";
import bundledManifestJson from "./model-manifest.json" with { type: "json" };
import { ProviderCompatibilityPolicy } from "./providerCompatibility.ts";
import type { ServerProviderDraft } from "@t3tools/provider-core/server/snapshotProbe";

/**
 * Optional admin-supplied manifest in the server state directory. Same shape
 * as the bundled `model-manifest.json`. This fork never fetches the manifest
 * from the network.
 */
export const LOCAL_MODEL_MANIFEST_FILE = "model-manifest.local.json";

const ManifestModelStatus = Schema.Literals(["current", "legacy"]);

const ManifestModelProfile = Schema.Struct({
  capabilities: Schema.optional(ModelCapabilities),
  adapter: Schema.optional(Schema.Unknown),
});

const ManifestProviderModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  shortName: Schema.optional(TrimmedNonEmptyString),
  subProvider: Schema.optional(TrimmedNonEmptyString),
  aliases: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  status: ManifestModelStatus,
  badge: Schema.optional(Schema.Literal("new")),
  profile: Schema.optional(TrimmedNonEmptyString),
  adapter: Schema.optional(Schema.Unknown),
});

const ManifestProviderCatalog = Schema.Struct({
  defaults: Schema.optional(
    Schema.Struct({
      chat: Schema.optional(TrimmedNonEmptyString),
    }),
  ),
  profiles: Schema.Record(Schema.String, ManifestModelProfile),
  models: Schema.Array(ManifestProviderModel),
});

/**
 * `version` gates breaking schema changes. Provider catalogs are additive so
 * clients that only understand `currentModels` keep accepting this v1 file.
 */
const ModelManifestEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(1),
  /**
   * ISO date of the last edit. A release bundles its manifest, and a disk
   * cache of an older edit must not outrank it. Optional so older remote
   * files still decode; they count as older than any dated bundle.
   */
  updatedAt: Schema.optional(Schema.String),
  compatibility: Schema.optional(Schema.Array(ProviderCompatibilityPolicy)),
  currentModels: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  providers: Schema.optional(Schema.Record(Schema.String, ManifestProviderCatalog)),
});

const hasValidProviderCatalogReferences = (
  manifest: typeof ModelManifestEnvelopeSchema.Type,
): boolean =>
  Object.values(manifest.providers ?? {}).every((catalog) => {
    const slugs = new Set<string>();
    const modelsAreValid = catalog.models.every((model) => {
      if (slugs.has(model.slug)) return false;
      slugs.add(model.slug);
      return model.profile === undefined || catalog.profiles[model.profile] !== undefined;
    });
    return (
      modelsAreValid && (catalog.defaults?.chat === undefined || slugs.has(catalog.defaults.chat))
    );
  });

const ModelManifestSchema = ModelManifestEnvelopeSchema.pipe(
  Schema.check(
    Schema.makeFilter(hasValidProviderCatalogReferences, {
      expected: "unique model slugs and existing model and profile references",
    }),
    Schema.makeFilter(hasValidClaudeManifestAdapters, {
      expected: "valid Claude adapter metadata",
    }),
  ),
);
export type ModelManifestData = typeof ModelManifestSchema.Type;

export interface ResolvedManifestModel {
  readonly model: ServerProviderModel;
  readonly adapter: unknown;
  readonly profileAdapter: unknown;
}

export interface ResolvedProviderCatalog {
  readonly models: ReadonlyArray<ResolvedManifestModel>;
  readonly defaults: {
    readonly chat: string | undefined;
  };
}

export const BUNDLED_MODEL_MANIFEST: ModelManifestData =
  Schema.decodeUnknownSync(ModelManifestSchema)(bundledManifestJson);

/** Epoch millis of the manifest's `updatedAt`, or 0 when absent or unparsable. */
function manifestUpdatedAtMs(manifest: ModelManifestData): number {
  if (manifest.updatedAt === undefined) return 0;
  const parsed = Date.parse(manifest.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Resolve provider-neutral model presentation and capability data. */
export function resolveProviderCatalog(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ResolvedProviderCatalog | null {
  const catalog = manifest.providers?.[driverKind];
  if (!catalog) return null;

  const seen = new Set<string>();
  const models: Array<ResolvedManifestModel> = [];
  for (const entry of catalog.models) {
    if (seen.has(entry.slug)) return null;
    seen.add(entry.slug);

    const profile = entry.profile ? catalog.profiles[entry.profile] : undefined;
    if (entry.profile && !profile) return null;

    models.push({
      model: {
        slug: entry.slug,
        name: entry.name,
        ...(entry.shortName ? { shortName: entry.shortName } : {}),
        ...(entry.subProvider ? { subProvider: entry.subProvider } : {}),
        ...(entry.aliases ? { aliases: entry.aliases } : {}),
        ...(entry.badge ? { badge: entry.badge } : {}),
        isCustom: false,
        ...(catalog.defaults?.chat === entry.slug ? { isDefault: true } : {}),
        ...(entry.status === "legacy" ? { isLegacy: true } : {}),
        capabilities: profile?.capabilities ?? null,
      },
      adapter: entry.adapter,
      profileAdapter: profile?.adapter,
    });
  }

  if (catalog.defaults?.chat !== undefined && !seen.has(catalog.defaults.chat)) return null;

  return {
    models,
    defaults: {
      chat: catalog.defaults?.chat,
    },
  };
}

/** JSON-text decoder for the admin-supplied local manifest. */
const decodeManifestJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    ModelManifestSchema as unknown as Schema.Codec<typeof ModelManifestSchema.Type>,
  ),
);

/** True when the manifest classifies `slug` as legacy for `driverKind`. */
function isLegacyModel(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
  slug: string,
): boolean {
  const family = driverKind === "codex" ? codexModelFamily(slug) : slug;
  const catalog = manifest.providers?.[driverKind]?.models;
  const catalogModel =
    catalog?.find((model) => model.slug === slug) ??
    catalog?.find((model) => model.slug === family);
  return catalogModel?.status === "legacy";
}

/**
 * Reclassifies every built-in model on a snapshot draft against the manifest.
 * Custom models are user-defined and never reclassified.
 */
export function applyModelManifest(
  draft: ServerProviderDraft,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ServerProviderDraft {
  const { updateRequiredModels: _previous, ...rest } = draft;
  const updateRequiredModels =
    driverKind === "codex" ? codexUpdateRequiredModels(manifest, draft) : [];
  return {
    ...rest,
    models: applyManifestDefault(
      classifyModels(draft.models, manifest, driverKind),
      manifest,
      driverKind,
    ),
    ...(updateRequiredModels.length > 0 ? { updateRequiredModels } : {}),
  };
}

const CodexModelAdapter = Schema.Struct({
  codex: Schema.optional(Schema.Struct({ minVersion: Schema.optional(TrimmedNonEmptyString) })),
});
const decodeCodexModelAdapter = Schema.decodeUnknownOption(CodexModelAdapter);

/**
 * Codex lists only the models its own build knows, so a model released after
 * the installed CLI never shows up. A current manifest entry with
 * `adapter.codex.minVersion` names that model, letting the picker say an update
 * unlocks it instead of leaving users to wonder where it is.
 */
function codexUpdateRequiredModels(
  manifest: ModelManifestData,
  draft: ServerProviderDraft,
): ReadonlyArray<ServerProviderUpdateRequiredModel> {
  const version = draft.version?.replace(/^v/, "");
  if (!version || parseSemver(version) === null) return [];
  const discovered = new Set(draft.models.map((model) => codexModelFamily(model.slug)));
  return (manifest.providers?.codex?.models ?? []).flatMap((entry) => {
    if (entry.status !== "current" || discovered.has(codexModelFamily(entry.slug))) return [];
    const minVersion = Option.getOrUndefined(decodeCodexModelAdapter(entry.adapter ?? {}))?.codex
      ?.minVersion;
    if (!minVersion || parseSemver(minVersion) === null) return [];
    if (compareSemverVersions(version, minVersion) >= 0) return [];
    return [
      {
        slug: entry.slug,
        name: entry.name,
        ...(entry.badge ? { badge: entry.badge } : {}),
        minVersion,
      },
    ];
  });
}

/** The manifest's chat default for `driverKind`, when it names one. */
export function manifestDefaultModel(
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): string | undefined {
  return manifest.providers?.[driverKind]?.defaults?.chat;
}

/**
 * Moves `isDefault` to the manifest's chat default when the catalog carries
 * it. Providers that learn their default from the runtime (Antigravity takes
 * Google's current model) can be overridden here without a release. Aliases
 * that pointed at the old default move with the flag so the shared
 * "provider default" alias keeps resolving.
 */
export function applyManifestDefault(
  models: ReadonlyArray<ServerProviderModel>,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ReadonlyArray<ServerProviderModel> {
  const requestedSlug = manifestDefaultModel(manifest, driverKind);
  if (requestedSlug === undefined) return models;
  const slug =
    models.find((model) => model.slug === requestedSlug)?.slug ??
    (driverKind === "codex"
      ? models.find(
          (model) =>
            !model.isCustom && codexModelFamily(model.slug) === codexModelFamily(requestedSlug),
        )?.slug
      : undefined);
  if (slug === undefined) return models;
  const previous = models.find((model) => model.isDefault && model.slug !== slug);
  if (!previous) return models;
  const movedAliases = previous.aliases ?? [];
  return models.map((model) => {
    if (model.slug === previous.slug) {
      const { isDefault: _isDefault, aliases: _aliases, ...rest } = model;
      return rest;
    }
    if (model.slug === slug) {
      const aliases = [...new Set([...(model.aliases ?? []), ...movedAliases])];
      return { ...model, isDefault: true, ...(aliases.length > 0 ? { aliases } : {}) };
    }
    return model;
  });
}

/** Model-level half of `applyModelManifest`, exported for focused tests. */
export function classifyModels(
  models: ReadonlyArray<ServerProviderModel>,
  manifest: ModelManifestData,
  driverKind: ProviderDriverKind,
): ReadonlyArray<ServerProviderModel> {
  return models.map((model) => {
    if (model.isCustom) return model;
    if (isLegacyModel(manifest, driverKind, model.slug)) {
      return model.isLegacy ? model : { ...model, isLegacy: true };
    }
    if (!model.isLegacy) return model;
    const { isLegacy: _isLegacy, ...rest } = model;
    return rest;
  });
}

export class ModelManifest extends Context.Service<
  ModelManifest,
  {
    /** Manifest already in memory (local override or bundle); no file I/O
     * after the first read. Snapshot classification reads this. */
    readonly current: Effect.Effect<ModelManifestData>;
    /** Re-reads the local override file; never fails. */
    readonly refresh: Effect.Effect<ModelManifestData>;
    /** Same as `refresh`; kept so callers that force a reload still compile. */
    readonly forceRefresh: Effect.Effect<ModelManifestData>;
    /** Forks `refresh` into the service's own scope. */
    readonly refreshInBackground: Effect.Effect<void>;
  }
>()("t3/provider/ModelManifest") {}

/** Constant service backing the bundled-data test layer. */
const BundledOnlyModelManifest: ModelManifest["Service"] = {
  current: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  refresh: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  forceRefresh: Effect.succeed(BUNDLED_MODEL_MANIFEST),
  refreshInBackground: Effect.void,
};

export const layerTest = Layer.succeed(ModelManifest, BundledOnlyModelManifest);

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const serviceScope = yield* Effect.scope;

  const localPath = path.join(config.stateDir, LOCAL_MODEL_MANIFEST_FILE);
  let manifest = BUNDLED_MODEL_MANIFEST;

  // A missing file is the normal case and stays silent. An invalid file, or
  // one whose `updatedAt` predates the bundle (the release carries newer
  // data), falls back to the bundle so a stale override cannot hide models.
  const reload = Effect.gen(function* () {
    const raw = yield* fileSystem
      .readFileString(localPath)
      .pipe(Effect.catchCause(() => Effect.succeed(null)));
    if (raw === null) {
      manifest = BUNDLED_MODEL_MANIFEST;
      return manifest;
    }
    const local = yield* decodeManifestJson(raw).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Ignoring invalid local model manifest.", {
          path: localPath,
          cause,
        }).pipe(Effect.as(null)),
      ),
    );
    manifest =
      local !== null && manifestUpdatedAtMs(local) >= manifestUpdatedAtMs(BUNDLED_MODEL_MANIFEST)
        ? local
        : BUNDLED_MODEL_MANIFEST;
    return manifest;
  }).pipe(Effect.withSpan("ModelManifest.reload"));

  const initialLoad = yield* Effect.cached(reload);

  return ModelManifest.of({
    current: initialLoad.pipe(Effect.map(() => manifest)),
    refresh: reload,
    forceRefresh: reload,
    refreshInBackground: Effect.forkIn(reload, serviceScope).pipe(Effect.asVoid),
  });
});

export const layer = Layer.effect(ModelManifest, make);
