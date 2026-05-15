# Shelly Content Agent Status

Updated: 2026-05-15

## Goal

Shelly単体で、Shelly/Chelly開発ログとSTEAM x AI発信をスマホだけで半自動運用する。

## Current Runtime

- Scheduler: Shelly native Android AlarmManager.
- Source collection:
  - Substack: Perplexity `sonar-deep-research`.
  - X: Perplexity `sonar`.
- Drafting:
  - Substack: `sonar-deep-research` first, Codex CLI for article reasoning when installed.
  - X: `sonar`.
  - Local comparison: Qwen3-8B vs Codex via the A/B eval agent.
- Publishing:
  - X API is not used.
  - Outputs are drafts in Obsidian / Shelly files.

## Default Agent Cadence

- Monday 06:00: academic source collection.
- Monday 08:00: Substack deep-research draft.
- Monday 10:00: Codex article draft.
- Daily 07:00: X trend source collection.
- Daily 08:00: X casual draft.

## Output Paths

Shelly project:

```text
~/projects/shelly-content-studio
```

Obsidian mirror:

```text
/sdcard/Documents/ObsidianVault/20_Literature/Papers
/sdcard/Documents/ObsidianVault/50_Drafts/Substack
/sdcard/Documents/ObsidianVault/50_Drafts/X
/sdcard/Documents/ObsidianVault/90_Log/Agent_Output
```

Duplicate source registry:

```text
~/projects/shelly-content-studio/sources/source-registry.tsv
```

## Remaining Risks

- `PERPLEXITY_API_KEY` must be present in `~/.shelly/agents/.env`.
- Codex CLI must be installed and logged in inside Shelly before the Codex drafting agent can run.
- Full APK packaging currently fails in Gradle Prefab native library resolution; Kotlin/source compile passes.
- The failing packaging path is currently `expo-modules-core:buildCMakeDebug`, where Gradle transform output points to missing React Native / fbjni Prefab `.so` files such as `libjsi.so` or `libfbjni.so`.
- A temporary Gradle cache repair can replace broken Prefab links with the matching `jni/<abi>/` `.so`, but this environment can regenerate the broken transform during assemble. Treat this as a build-environment issue to fix before final APK smoke testing.
