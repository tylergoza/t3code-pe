/**
 * Product analytics service. T3 Code EE ships no analytics: the live layer is
 * a no-op, and call sites keep calling `record` so the event shape stays
 * visible in one place.
 *
 * @module AnalyticsService
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class AnalyticsService extends Context.Service<
  AnalyticsService,
  {
    /** Record an event. Discarded in this build. */
    readonly record: (
      event: string,
      properties?: Readonly<Record<string, unknown>>,
    ) => Effect.Effect<void>;

    /** Flush queued events. Nothing is queued in this build. */
    readonly flush: Effect.Effect<void>;
  }
>()("t3/telemetry/AnalyticsService") {
  /** No-op layer used by the server runtime. */
  static readonly layerNoop = Layer.succeed(
    AnalyticsService,
    AnalyticsService.of({
      record: () => Effect.void,
      flush: Effect.void,
    }),
  );

  /** No-op layer for tests. */
  static readonly layerTest = AnalyticsService.layerNoop;
}
