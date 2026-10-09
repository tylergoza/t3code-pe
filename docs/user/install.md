# Install T3 Code PE

T3 Code runs coding agents on your computer and lets you control them from its
desktop or web app. T3 Code PE does not publish prebuilt downloads. You build it
from source, so you can read exactly what you are about to run before you run it.
Build on the machine where the agents will work.

## Requirements

- Git and Node.js 24.
- `vp`, the Vite+ command-line tool
  ([Install vp](../../README.md#install-vp)).
- The build tools for your platform, listed under
  [Desktop app](#desktop-app).
- An installed, authenticated provider before starting a thread. You can build
  and launch T3 Code PE first and configure providers afterwards.

## Get and review the source

```bash
git clone https://github.com/tylergoza/t3code-pe
cd t3code-pe
```

Review the code, then check out the exact commit you reviewed so the build
matches it:

```bash
git checkout <commit>
vp i
```

`vp i` downloads the npm dependencies pinned in `pnpm-lock.yaml`. Review that
file too if you want to check the dependency tree.

## Desktop app

The desktop app runs a server on your computer and includes the `t3` command.
From the repository root:

| Platform              | Build                            | Output in `release/`                    |
| --------------------- | -------------------------------- | --------------------------------------- |
| macOS (Apple Silicon) | `vp run dist:desktop:dmg:arm64`  | `T3-Code-PE-<version>-arm64.dmg`        |
| macOS (Intel)         | `vp run dist:desktop:dmg:x64`    | `T3-Code-PE-<version>-x64.dmg`          |
| Windows               | `vp run dist:desktop:win`        | `T3-Code-PE-<version>-<arch>.exe`       |
| Linux                 | `vp run dist:desktop:linux`      | `.AppImage` and `.deb`                  |

Each platform needs its own build tools:

- **macOS:** Xcode Command Line Tools (`xcode-select --install`) and
  [Rust](https://rustup.rs).
- **Windows:** [Rust](https://rustup.rs), Python 3, and Visual Studio Build
  Tools with **Desktop development with C++**.
- **Linux:** build on Linux with Rust, C/C++ build tools, libsecret headers,
  pkg-config, and ImageMagick. On Debian and Ubuntu:
  `sudo apt-get install cargo rustc build-essential libsecret-1-dev pkg-config imagemagick`.

The [development guide](../operations/development.md#desktop-artifacts) has the
full prerequisite lists for each platform.

Then install the build:

- **macOS:** open the `.dmg` and drag T3 Code PE to Applications.
- **Windows:** run the `.exe` installer.
- **Debian, Ubuntu:** `sudo apt install ./release/T3-Code-PE-*.deb`.
- **Other Linux:** mark the `.AppImage` executable and run it.

Builds are unsigned. They open normally on the machine that built them. macOS
and Windows warn about them when you copy them to another computer.

T3 Code PE installs alongside upstream T3 Code and keeps its data in
`~/.t3code-pe`.

### The `t3` command

The desktop app includes the `t3` command-line tool. To run it from any
terminal, open **Settings → General → About** and choose **Install** next to
**t3 command**. On macOS and Linux it adds a `t3` link to a folder on your
`PATH`; on Windows it adds the app's command folder to your `PATH`. Open a new
terminal afterwards. **Remove** takes it off again. If you already have `t3`
from npm, it stays as it is.

### Windows Subsystem for Linux

Choose a WSL distro in **Settings → Connections** to run agents and projects
there. Install the provider CLIs inside that distro. T3 Code installs its server
runtime there from the copy bundled in the installer. A Windows build includes
that copy only when built with the Linux CLI archive; see the
[release runbook](../operations/release.md#windows-payload-topology-and-update-validation).

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
t3 app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `t3 app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start the desktop app and try again.

## Command line

To run only the server and use the web app in a browser, build it from the
repository root and start it with Node.js:

```bash
vp run build:desktop
node apps/server/dist/bin.mjs
```

This starts the server and opens the local web app. The same entry point takes
the `t3` subcommands, such as `node apps/server/dist/bin.mjs serve` to start
without a browser. Run `node apps/server/dist/bin.mjs --help` for the full
reference.

To start in a new working directory, pass an explicit path such as
`node apps/server/dist/bin.mjs ./my-project`. A bare directory name is accepted
only if it already exists.

If the server reports an already running server, connect to that server instead.
Stop it before starting a replacement, or use a different `--base-dir` for an
independent server.

`t3 update`, `t3 service install`, and the hosted install scripts download
published release archives. T3 Code PE does not publish any, so these do not
work with a source build.

## Updating

Fetch the new code and review what changed before building it:

```bash
git fetch
git log -p HEAD..origin/main
git checkout <commit>
vp i
```

Then rebuild and reinstall the desktop app, or rebuild and restart the server,
the same way you installed it. Your projects, threads, and settings in
`~/.t3code-pe` are kept. Desktop builds do not update themselves.

## Mobile app

T3 Code PE does not publish a mobile app. The upstream T3 Code store apps are a
separate product.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Cursor      | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                                                                                     |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                                                                                        |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                                                                                  |
| Antigravity | Install and sign in with Google from T3 Code's provider settings.                                                                                         |
| Pi          | Install [Pi](https://pi.dev), then run `pi` once to finish its login or API-key setup.                                                                    |
| Muse Code   | Install [Muse Code](https://dev.meta.ai/docs/muse-code) on the server, run `muse login`, then enable it in Settings → Providers.                          |

Provider CLIs must be on the server's `PATH`. If T3 Code cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Codex connected through ChatGPT and Antigravity can use their
managed runtimes without a `PATH` entry.

T3 Code warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or the
CLI's own update command when T3 Code cannot tell. Update a CLI installed with
mise through mise. Cursor and Antigravity update with T3 Code. Homebrew installs
compare against the version Homebrew offers, which can trail the npm release by
a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, T3 Code does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md),
[Antigravity](./providers-antigravity.md), [Pi](./providers-pi.md), and
[Muse Code](./providers-muse.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Updating T3 Code PE](#updating): fetch, review, and rebuild.
