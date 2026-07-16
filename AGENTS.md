# Repository Guidelines

## Project Structure

This repository is a small, macOS-only Obsidian plugin prototype. Runtime code lives at the repository root:

- `main.js` contains the plugin lifecycle, pointer-event handling, alignment detection, settings UI, and process bridge.
- `haptic.jxa` is the AppKit JavaScript for Automation bridge used for trackpad feedback.
- `manifest.json` defines the Obsidian plugin metadata and minimum app version.
- `styles.css` contains the plugin’s minimal CSS hook.
- `README.md` documents the prototype scope and manual installation.

There are currently no separate source, asset, or test directories.

## Build, Run, and Validate

There is no package manager or build script. Install the prototype into a test vault with:

```sh
mkdir -p <vault>/.obsidian/plugins/canvas-haptics
cp manifest.json main.js styles.css haptic.jxa <vault>/.obsidian/plugins/canvas-haptics/
```

Enable **Canvas Haptics** in Obsidian, open a Canvas, drag nodes, and use **Settings → Canvas Haptics → Test**. On macOS, validate the bridge directly with `osascript -l JavaScript haptic.jxa generic`. If Node.js is available, `node --check main.js` catches JavaScript syntax errors.

## Coding Style and Naming

Use two-space indentation, semicolons, double-quoted strings, and descriptive camelCase names, matching the existing JavaScript. Keep plugin behavior in `CanvasHapticsPlugin`; keep pure alignment calculations in standalone functions. Use PascalCase for classes, lower camelCase for methods/settings, and kebab-case for plugin IDs and CSS classes. Preserve the existing CommonJS export and Obsidian API usage.

## Testing Guidelines

No automated test framework or coverage requirement is configured. Every behavior change should receive a manual Obsidian smoke test covering node dragging, horizontal and vertical alignment, tolerance changes, disabled feedback, and plugin reload. Confirm that failures are logged without leaving the plugin unusable. Test on a supported Apple Silicon macOS environment because the JXA bridge depends on AppKit haptic APIs.

## Commits and Pull Requests

The repository has no established commit history yet. Use short, imperative commit subjects such as `fix: reset alignment state after drag`. Pull requests should explain the user-visible behavior, list manual validation steps and macOS/Obsidian versions, link any relevant issue, and include screenshots or a short recording for settings or Canvas interaction changes.

## Platform and Safety Notes

Keep the plugin desktop-only and avoid introducing downloaded or unsigned executables. Route haptic feedback through the system `/usr/bin/osascript` bridge. Obsidian Canvas selectors are internal DOM behavior; isolate selector changes and verify compatibility after Obsidian updates.
