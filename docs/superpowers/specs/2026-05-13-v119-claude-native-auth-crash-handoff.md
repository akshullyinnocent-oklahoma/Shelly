# 2026-05-13 — v119 Claude native TUI success, auth/post-login crash handoff

**Date**: 2026-05-13
**Branch**: `main`
**Latest commit**: `9eb4970f fix(cli): prefer native claude tui`
**GitHub Actions**: `25770400693` succeeded
**BASHRC_VERSION**: `119`
**Device**: Galaxy Z Fold / Android, package `dev.shelly.terminal`

## Current release target

Pragmatic release scope is now:

- Codex CLI works standalone in Shelly.
- Claude Code works standalone in Shelly.
- Gemini CLI can be deferred as a known issue if Codex + Claude are solid.

Latest-version tracking is also not solved by v119. The npm registry had
`@anthropic-ai/claude-code@2.1.140` while v119 native tier displayed
`Claude Code v2.1.138`. Treat "always latest" as a v120+ track.

## What v119 fixed

Real-device testing showed:

- Node/extracted/legacy Claude tiers can hang before drawing the TUI.
- Native musl Bun SEA route draws Claude Code correctly.
- Command that proved the working route before v119:

```bash
SHELLY_PREFER_NATIVE_CLAUDE=1 SHELLY_DISABLE_EXTRACTED_CLAUDE=1 SHELLY_VERBOSE_CLI_TIER=1 claude
```

v119 makes bare `claude` prefer that native foreground route by default.

Verification from device:

```bash
cat ~/.bashrc_version
# 119

claude
# Welcome to Claude Code v2.1.138
# TUI renders, theme selection renders, colors/diff preview render.
```

## Current blocker

Claude Code authentication/post-login is not release-ready yet.

Observed flow:

1. Start bare `claude`.
2. TUI renders.
3. Run `/login`.
4. Select "Claude account with subscription".
5. Native route emits the browser URL and prompt:

```text
Browser didn't open? Use the url below to sign in
Paste code here if prompted >
```

6. In-app/browser pane opens a Claude login page. Manual Chrome copy/paste also works.
7. Browser reaches `platform.claude.com/oauth/code/callback` and displays an auth code.
8. Pasting the code into Claude Code advances to:

```text
Accessing workspace:
/data/data/dev.shelly.terminal/files/home

Quick safety check: Is this a project you created or one you trust?
Claude Code'll be able to read, edit, and execute files here.
```

9. Immediately after this workspace trust/safety step, native Bun SEA crashes:

```text
Bun v1.3.14 ... Linux arm64
Args: "/data/user/0/dev.shelly.terminal/files/home/.shelly-runtime/claude/current/claude"
panic(main thread): Segmentation fault at address 0x10
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
```

Important interpretation:

- This is not primarily "browser auth failed".
- The auth link and manual code path can progress.
- The crash happens after auth, at first-run workspace trust/onboarding.
- The failing binary is the native musl Bun SEA route that v119 made default.

## Likely next fix direction

The smallest likely fix is not to revert v119 globally. Native route is the only
route that has proven able to render Claude TUI on-device.

Investigate one or more of:

- Pre-seed Claude Code first-run state so the workspace trust/safety prompt is
  not shown for `$HOME`.
- Detect `/login`/post-login setup and route only that narrow flow through a
  non-native path if it can complete credential writes without needing TUI.
- Patch the native route environment/config so the trust prompt does not trigger
  the Bun crash.
- Confirm whether the crash happens only in `$HOME` trust prompt or also after
  choosing a workspace trust answer manually.

Be careful with Node/extracted fallback: previous device tests showed those
tiers often hang before drawing. They may still be useful for non-TUI commands
or credential setup, but should not become the default bare `claude` path until
real-device TUI proves it.

## Useful code locations

- `modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/HomeInitializer.kt`
  - `BASHRC_VERSION`
  - generated `.bashrc`
  - `claude()` function
  - `__shelly_run_claude_musl_clean`
  - auth isolation helpers
- `modules/terminal-emulator/android/src/main/assets/shelly-runtime-update.js`
  - Claude native/extracted updater
  - native SEA patching
  - auth/functional smoke classification
- `app/_layout.tsx`
  - deep-link queue draining
  - in-app browser vs external browser routing
- `modules/terminal-emulator/android/src/main/jni/shelly-xdg-open.c`
  - shell-to-browser queue writer
- `modules/terminal-emulator/android/src/main/assets/shelly-doctor.js`
  - diagnostics around Claude runtime/auth files

## Commands and checks for the next session

On-device, after installing a candidate:

```bash
cat ~/.bashrc_version
claude
/login
```

To prove auth files exist after manual auth-code paste:

```bash
ls -la ~/.claude ~/.claude.json 2>/dev/null
shelly-doctor
```

To compare routing:

```bash
SHELLY_VERBOSE_CLI_TIER=1 claude --version
SHELLY_DISABLE_NATIVE_CLAUDE=1 SHELLY_VERBOSE_CLI_TIER=1 claude --version
SHELLY_FORCE_LEGACY_CLAUDE=1 SHELLY_VERBOSE_CLI_TIER=1 claude --version
```

If ADB is available:

```bash
adb devices
adb logcat -c
adb logcat -s HomeInitializer:* Shelly:* chromium:* AndroidRuntime:* DEBUG:*
```

`run-as dev.shelly.terminal` currently fails on release builds because the app
is not debuggable. Shizuku was present but stopped during the last session, so
do not assume privileged app-data access unless Shizuku is explicitly started.

## Current repo state when this note was added

Committed and pushed:

- `bd8a9614 fix(cli): harden claude and gemini auth launch`
- `2d9dba34 fix(cli): prefer stable bundled launch paths`
- `0d9ad0c4 fix(cli): add linux node compat preload`
- `9eb4970f fix(cli): prefer native claude tui`

Untracked local diagnostics may exist under:

```text
diagnostics/
```

They are local log extracts. Do not remove them unless intentionally cleaning
the workspace.

## Suggested Codex next-session plan

1. Read this file and `CLAUDE.md`.
2. Inspect the current `claude()` wrapper and v119 native routing.
3. Determine where Claude Code stores first-run trust/onboarding state.
4. Add a minimal v120 fix that avoids the post-login workspace trust crash while
   keeping bare `claude` on native route.
5. Run local tests and push.
6. Build via GitHub Actions.
7. Install on device and verify: bare TUI, `/login`, auth-code paste, workspace
   trust transition, then a short prompt.

## Prompt for Claude Code investigation

Use the following prompt when asking Claude Code on a PC to analyze the issue:

```text
We are debugging Shelly, an Android terminal IDE that runs Claude Code/Codex/Gemini inside its own JNI forkpty environment without Termux. Current repo branch is main. Latest key commit is 9eb4970f `fix(cli): prefer native claude tui`; GitHub Actions run 25770400693 succeeded; device shows BASHRC_VERSION=119.

Current facts:
- Codex CLI auth and launch are considered working.
- Gemini CLI remains deferred; do not spend primary time on it.
- Claude Code bare `claude` now uses native musl Bun SEA by default because Node/extracted/legacy tiers hang before drawing TUI on device.
- v119 bare `claude` renders Claude Code v2.1.138 correctly on Galaxy Z Fold.
- `/login` starts, browser URL is shown, manual Chrome auth works, and the browser returns an auth code.
- After pasting the auth code, Claude Code reaches the first-run workspace trust/safety screen:
  `Accessing workspace: /data/data/dev.shelly.terminal/files/home`
  `Quick safety check: Is this a project you created or one you trust?`
- Immediately after that, native Bun SEA crashes:
  `panic(main thread): Segmentation fault at address 0x10`
  `Args: ".../.shelly-runtime/claude/current/claude"`

Interpretation:
- This is not simply browser auth failure. Auth progresses.
- The blocker is post-login first-run workspace trust/onboarding crashing native Bun SEA.
- We need a minimal v120 fix that preserves native route for bare TUI but avoids this crash.

Please use agents to propose concrete verification and implementation options. Focus on:
1. Where Claude Code stores workspace trust/onboarding state.
2. Whether we can pre-seed trust for Shelly HOME safely.
3. Whether `/login` or post-login credential setup can be routed through a non-native path without using TUI.
4. Whether env vars or config flags disable first-run trust/onboarding.
5. Exact files and bash wrapper changes needed in Shelly.

Relevant files:
- modules/terminal-emulator/android/src/main/java/expo/modules/terminalemulator/HomeInitializer.kt
- modules/terminal-emulator/android/src/main/assets/shelly-runtime-update.js
- app/_layout.tsx
- modules/terminal-emulator/android/src/main/jni/shelly-xdg-open.c
- modules/terminal-emulator/android/src/main/assets/shelly-doctor.js
- docs/superpowers/specs/2026-05-13-v119-claude-native-auth-crash-handoff.md

Please return:
- ranked hypotheses,
- concrete on-device commands to validate each,
- recommended minimal patch,
- risks and rollback path.
```

