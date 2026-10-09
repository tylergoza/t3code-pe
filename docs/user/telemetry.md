# Privacy and network use

T3 Code EE sends no product analytics or usage data. The server does not record or upload events
about your sessions, providers, or clients, and nothing is sent to the T3 Code maintainers.

There is no T3 Connect, hosted account, relay, or Tailscale integration. Clients reach your server
directly on this machine or your LAN, using pairing.

Network calls happen only when you use a feature that needs one:

- **Providers.** Each agent CLI (Claude Code, Codex, Cursor, and others) talks to its own vendor
  under that vendor's terms.
- **Provider update checks.** The server asks the npm registry for newer CLI versions. Turn this
  off with **Settings → General → Provider update checks**.
- **Usage pricing.** Cost estimates load the LiteLLM price table from GitHub.
- **Source control.** Pull request and repository features call the host you configure, such as
  GitHub.

Model lists come from the bundled model manifest and from your installed Claude Code. An
administrator can supply `model-manifest.local.json` in the server state directory to update model
metadata without network access.

Desktop builds do not check for updates unless they were built with an update repository.

Optional OpenTelemetry tracing stays off unless you set the `T3CODE_OTLP_*` or `OTEL_*` environment
variables, and then it goes only to the endpoint you choose.
