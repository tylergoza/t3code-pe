import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import {
  BearerConnectionProfile,
  type ConnectionCatalogEntry,
  type ConnectionRoute,
} from "./catalog.ts";
import { gitHubRoutingConnectionKey } from "./githubRoutingPermissions.ts";
import { BearerConnectionTarget, SshConnectionTarget } from "./model.ts";
import {
  connectionRouteId,
  connectionRouteKind,
  credentialConnectionId,
  insertRoute,
  entryWithRoutes,
  mergeLearnedRoutes,
  routesAfterRemoving,
  upsertRoute,
} from "./routes.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");

function direct(id: string, httpBaseUrl: string): ConnectionRoute {
  return {
    target: new BearerConnectionTarget({
      environmentId: ENVIRONMENT_ID,
      label: "Desk",
      connectionId: id,
    }),
    profile: Option.some(
      new BearerConnectionProfile({
        connectionId: id,
        environmentId: ENVIRONMENT_ID,
        label: "Desk",
        httpBaseUrl,
        wsBaseUrl: httpBaseUrl.replace(/^http/, "ws"),
      }),
    ),
  };
}

const LAN = direct("lan", "http://192.168.1.10:3773/");
const PUBLIC = direct("public", "https://desk.example.com/");

describe("connection routes", () => {
  it("classifies direct routes by address", () => {
    expect(connectionRouteKind(LAN)).toBe("lan");
    expect(connectionRouteKind(PUBLIC)).toBe("public");
    expect(connectionRouteKind(direct("lo", "http://127.0.0.1:3773/"))).toBe("loopback");
  });

  it("places a new route after faster kinds", () => {
    expect(insertRoute([PUBLIC], LAN)).toEqual([LAN, PUBLIC]);
    expect(insertRoute([LAN], PUBLIC)).toEqual([LAN, PUBLIC]);
  });

  it("keeps a user's order when a saved route is replaced", () => {
    // The user preferred the public URL over the LAN; re-pairing the LAN keeps that.
    const repaired = direct("lan", "http://192.168.1.11:3773/");
    expect(upsertRoute([PUBLIC, LAN], repaired)).toEqual([PUBLIC, repaired]);
  });
});

describe("learned routes", () => {
  const paired: ConnectionCatalogEntry = {
    target: PUBLIC.target,
    profile: PUBLIC.profile,
    enabled: true,
  };
  const ids = (routes: ReadonlyArray<ConnectionRoute> | null) =>
    routes?.map((route) => connectionRouteId(route.target)) ?? null;
  const profileOf = (route: ConnectionRoute) => Option.getOrThrow(route.profile);
  const lanId = `learned:${ENVIRONMENT_ID}:http://192.168.1.10:3773@public`;

  it("learns a LAN address ahead of the paired route, borrowing its token", () => {
    const routes = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
      allowInsecure: true,
    });
    expect(ids(routes)).toEqual([lanId, "public"]);
    expect(profileOf(routes![0]!)).toMatchObject({
      learned: true,
      wsBaseUrl: "ws://192.168.1.10:3773/",
    });
    expect(credentialConnectionId(connectionRouteId(routes![0]!.target))).toBe("public");
  });

  it("replaces a learned LAN address when the server reports a new one", () => {
    const first = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
      allowInsecure: true,
    })!;
    const entry = entryWithRoutes(paired, first);
    const moved = mergeLearnedRoutes({
      entry,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://10.0.0.42:3773/" }],
      allowInsecure: true,
    });
    expect(ids(moved)).toEqual([
      `learned:${ENVIRONMENT_ID}:http://10.0.0.42:3773@public`,
      "public",
    ]);
  });

  it("keeps a learned route where the user moved it while the server reports it", () => {
    const lan = { httpBaseUrl: "http://192.168.1.10:3773/" };
    const first = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [lan],
      allowInsecure: true,
    })!;
    // The user prefers the paired URL over the learned LAN address.
    const reordered = entryWithRoutes(paired, [first[1]!, first[0]!]);
    expect(
      mergeLearnedRoutes({
        entry: reordered,
        activeRoute: PUBLIC,
        reported: [lan],
        allowInsecure: true,
      }),
    ).toBeNull();
    // A newly reported address is still placed by speed.
    const next = mergeLearnedRoutes({
      entry: reordered,
      activeRoute: PUBLIC,
      reported: [lan, { httpBaseUrl: "http://100.101.102.103:3773/" }],
      allowInsecure: true,
    });
    expect(ids(next)).toEqual([
      `learned:${ENVIRONMENT_ID}:http://100.101.102.103:3773@public`,
      "public",
      lanId,
    ]);
  });

  it("leaves user routes alone and does not learn an address already saved", () => {
    const entry: ConnectionCatalogEntry = {
      target: LAN.target,
      profile: LAN.profile,
      alternateRoutes: [PUBLIC],
      enabled: true,
    };
    expect(
      mergeLearnedRoutes({
        entry,
        activeRoute: PUBLIC,
        reported: [{ httpBaseUrl: "http://192.168.1.10:3773" }],
        allowInsecure: true,
      }),
    ).toBeNull();
    // The server stops reporting the LAN address; the paired route stays.
    expect(
      mergeLearnedRoutes({ entry, activeRoute: PUBLIC, reported: [], allowInsecure: true }),
    ).toBeNull();
  });

  it("learns nothing over a route with no token to borrow", () => {
    const ssh: ConnectionRoute = {
      target: new SshConnectionTarget({
        environmentId: ENVIRONMENT_ID,
        label: "Desk",
        connectionId: "ssh-1",
      }),
      profile: Option.none(),
    };
    expect(
      mergeLearnedRoutes({
        entry: { target: ssh.target, profile: ssh.profile, enabled: true },
        activeRoute: ssh,
        reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
        allowInsecure: true,
      }),
    ).toBeNull();
  });

  it("skips plain HTTP from an HTTPS page and never learns loopback", () => {
    expect(
      mergeLearnedRoutes({
        entry: paired,
        activeRoute: PUBLIC,
        reported: [
          { httpBaseUrl: "http://192.168.1.10:3773/" },
          { httpBaseUrl: "http://127.0.0.1:3773/" },
        ],
        allowInsecure: false,
      }),
    ).toBeNull();
  });

  it("removes learned routes along with the route whose credential they borrow", () => {
    const overPublic = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
      allowInsecure: true,
    })!;
    expect(routesAfterRemoving(overPublic, "public")).toEqual([]);
    // Removing a learned route leaves the paired one.
    expect(ids(routesAfterRemoving(overPublic, lanId))).toEqual(["public"]);
  });

  it("keeps GitHub routing trust when a route is learned", () => {
    const learned = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
      allowInsecure: true,
    })!;
    expect(gitHubRoutingConnectionKey(entryWithRoutes(paired, learned))).toBe(
      gitHubRoutingConnectionKey(paired),
    );
  });

  it("keeps the paired credential when learning over a learned route", () => {
    const first = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://192.168.1.10:3773/" }],
      allowInsecure: true,
    })!;
    const learnedLan = first[0]!;
    const next = mergeLearnedRoutes({
      entry: entryWithRoutes(paired, first),
      activeRoute: learnedLan,
      reported: [
        { httpBaseUrl: "http://192.168.1.10:3773/" },
        { httpBaseUrl: "http://10.0.0.42:3773/" },
      ],
      allowInsecure: true,
    })!;
    for (const route of next.filter((candidate) => candidate !== first[1])) {
      expect(credentialConnectionId(connectionRouteId(route.target))).toBe("public");
    }
  });

  it("saves a scheme change on the same host as a new address", () => {
    const first = mergeLearnedRoutes({
      entry: paired,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "http://desk.local:3773/" }],
      allowInsecure: true,
    })!;
    const moved = mergeLearnedRoutes({
      entry: entryWithRoutes(paired, first),
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "https://desk.local:3773/" }],
      allowInsecure: true,
    });
    expect(moved).not.toBeNull();
    expect(profileOf(moved![0]!)).toMatchObject({ httpBaseUrl: "https://desk.local:3773/" });
  });
});
