# Releases

> For maintainers. Using T3 Code EE? See [docs/user](../user/).

T3 Code EE has no release process or CI yet. Builds are made and checked locally. This page records
what a future release has to provide so the features that depend on it keep working.

## Local builds

Use Node 24, then build from the repo root:

```sh
vp run dist:desktop:dmg:arm64   # macOS Apple Silicon (also :x64, or dist:desktop:dmg for both)
vp run dist:desktop:win         # Windows NSIS installer
vp run dist:desktop:linux       # Linux AppImage
```

Builds are unsigned unless you pass `--signed` or set `T3CODE_DESKTOP_SIGNED=true` (see
[Signing](#signing)). Before handing a build to anyone, run `vp run -r typecheck` and
`vp run -r test`. `vp run release:smoke` checks the release tooling against a temporary copy of the
workspace.

## What a release must publish

Several features download release artifacts from GitHub Releases on `tylergoza/t3code-ee`
(`CLI_RELEASE_REPOSITORY` in `packages/shared/src/cliRelease.ts`). All of them fail until releases
exist there:

- `t3 update`, the server self-update action, and background-service installs download the
  `t3-<version>-<os>-<arch>` CLI archives.
- SSH environments install the same archives on the remote host.
- `scripts/install.sh` and `scripts/install.ps1` install from those releases.

Set `T3CODE_RELEASE_BASE_URL` to serve the archives from an internal mirror instead of GitHub.

Connected servers update to the client's exact version, never to a dist-tag. Publish the CLI
archives for a version before publishing desktop builds of that version, or **Update server** will
target an archive that does not exist yet.

## Desktop auto-update

Auto-update is off unless a build sets `T3CODE_DESKTOP_UPDATE_REPOSITORY` (`owner/repo`). That bakes
a GitHub Releases feed into `app-update.yml`, and the app then checks it on startup and on an
interval. It never downloads or installs without the user clicking.

A release that serves updates needs these assets:

- platform installers (`.exe`, `.dmg`, `.AppImage`, `.deb`, plus the macOS `.zip` used by
  Squirrel.Mac)
- channel metadata: `latest*.yml` for stable, `nightly*.yml` for nightly
- `*.blockmap` files for differential downloads

On macOS, `electron-updater` reads one `latest-mac.yml` for both Intel and Apple Silicon, so merge
the per-arch manifests before publishing.

## Signing

### macOS

electron-builder reads these from the environment:

- `CSC_LINK`: the `Developer ID Application` certificate and key exported as `.p12` (a path or
  base64)
- `CSC_KEY_PASSWORD`: the `.p12` password
- `APPLE_API_KEY`: path to the App Store Connect API key (`.p8`), used for notarization
- `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`

Create the certificate for an explicit App ID of `com.t3tools.t3code-ee`.

### Windows

Azure Trusted Signing reads:

- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` for the service principal
- `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

If a signed build fails, build once without `--signed` to confirm the unsigned path still works,
then recheck the certificate, profile, and credential values.

## Windows payload topology and update validation

Windows packages the bundled server and only its runtime-external/native dependency closure in
`resources/server.asar`. Native modules and helper executables declared as unpacked by that archive
must be present at the matching paths below `resources/server.asar.unpacked`. The Windows-native
backend reads the archive in place through Electron. Packaged Windows builds also ship
`resources/wsl-runtime.tar.gz` plus its SHA-256 sidecar: the Linux CLI archive
(`t3-<version>-linux-<arch>.tar.gz`, the same arch as the Windows host), passed to the Windows build
as `--wsl-runtime` and copied in verbatim so WSL runs the exact bytes a Linux user downloads. WSL
verifies and extracts that archive into `~/.t3code-ee/wsl-runtime/sha256-<archive-digest>` inside
the selected distro, then reuses it for later launches of the same update.

Windows keeps JavaScript and package metadata inside `app.asar` and unpacks only native libraries
and helper executables. Avoid enabling whole-package smart unpacking: each loose file adds work to
NSIS installation and counts against the payload limit.

The artifact builder rejects a Windows package when any of these invariants break:

- `resources/server.asar` is absent or does not contain the server entry.
- Any file marked unpacked in the ASAR header is absent from `resources/server.asar.unpacked`.
- On same-architecture Windows builds, the packaged primary cannot load the fff native library from
  inside `server.asar` through its `.unpacked` sibling.
- The isolated, extracted sidecar cannot load the server entry with plain Node.
- A Windows build given `--wsl-runtime` omits the WSL archive or SHA-256 sidecar, or the sidecar
  digest does not match the emitted archive.
- The emitted WSL archive is not a Linux CLI release archive: it must unpack to a single
  `t3-<version>-linux-<arch>` directory holding `t3`, `client/`, and `node_modules/` with the Linux
  node-pty binary, and must not carry a loose server bundle (`bin.mjs`).
- The external Windows resource monitor is absent.
- The unpacked Windows application contains more than 80 files.

Cross-architecture Windows builds keep every structural and extracted-sidecar check but skip
executing the target Electron binary. Exercise the primary native-load probe with a
same-architecture build for each release target.
