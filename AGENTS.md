# Repository Guidelines

## Project Structure

This repository is a small, macOS-only Obsidian plugin. TypeScript source and the JXA source template live under `src/`; the generated `main.js` bundle is a local/release artifact:

- `src/main.ts` contains the plugin lifecycle, pointer-event handling, alignment detection, settings UI, and process bridge.
- `src/haptic.jxa` is embedded during the build and released into the plugin directory on first load.
- `manifest.json` defines the Obsidian plugin metadata and minimum app version.
- `styles.css` contains the plugin’s minimal CSS hook.
- `README.md` documents the prototype scope and manual installation.

There are currently no separate source, asset, or test directories.

## Build, Run, and Validate

Use pnpm for the development workflow:

```sh
pnpm install
pnpm check
pnpm build
```

`pnpm check` runs TypeScript validation; `pnpm build` emits the readable `main.js` release bundle; `pnpm dev` watches and rebuilds during development. Copy the generated `main.js`, `manifest.json`, and `styles.css` into a test vault, enable **Canvas Haptics**, open a Canvas, drag and resize nodes, and use **Settings → Canvas Haptics → Haptic preview**.

## Coding Style and Naming

Use two-space indentation, semicolons, double-quoted strings, and descriptive camelCase names. Keep plugin behavior in `CanvasHapticsPlugin`; keep pure alignment calculations in standalone functions. Use PascalCase for classes, lower camelCase for methods/settings, and kebab-case for plugin IDs and CSS classes. Keep the JXA source separately under `src/` so the build can embed it deterministically.

## Testing Guidelines

No automated behavior-test framework or coverage requirement is configured. Every behavior change should pass `pnpm check` and receive a manual Obsidian smoke test covering node dragging, horizontal and vertical alignment, node resizing against matching widths and heights, Canvas viewport zoom feedback at key and fine levels, tolerance changes, disabled feedback, helper-file creation, and plugin reload. Confirm that failures are logged without leaving the plugin unusable. Test on supported Apple Silicon macOS because the JXA bridge depends on AppKit haptic APIs; mobile support is intentionally excluded.

## Commits and Pull Requests

Use short, imperative commit subjects such as `fix: reset alignment state after drag`. Pull requests should explain the user-visible behavior, list manual validation steps and macOS/Obsidian versions, link any relevant issue, and include screenshots or a short recording for settings or Canvas interaction changes.

## Platform and Safety Notes

Keep the plugin desktop-only and avoid introducing downloaded or unsigned executables. Route haptic feedback through the system `/usr/bin/osascript` bridge. Do not add network calls, telemetry, or Vault-content transmission. Obsidian Canvas selectors are internal DOM behavior; isolate selector changes and verify compatibility after Obsidian updates.
