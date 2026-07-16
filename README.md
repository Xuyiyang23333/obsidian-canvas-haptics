# Canvas Haptics

An experimental macOS-only Obsidian plugin that gives a subtle trackpad pulse when a Canvas node enters an alignment threshold.

## Prototype scope

- Detects dragging of `.canvas-node` elements.
- Compares visible left, center, and right / top, center, and bottom edges.
- Pulses once when a new alignment is entered.
- Uses the macOS-provided `osascript` runtime with a bundled AppKit JXA script, so the user installs one plugin folder and no unsigned executable is launched.
- Supports Apple Silicon in this prototype.

Canvas DOM selectors are internal Obsidian behavior and may need adjustment after Obsidian updates.

## Build

Copy `manifest.json`, `main.js`, `styles.css`, and `haptic.jxa` into `<vault>/.obsidian/plugins/canvas-haptics/`, enable it in Obsidian, and open Settings → Canvas Haptics → Test.

The JXA file is interpreted by the system-supplied `/usr/bin/osascript`; it is not a downloaded native executable and therefore avoids the helper's Gatekeeper quarantine problem. The prototype still depends on Obsidian's internal Canvas DOM selectors, which may need adjustment after Obsidian updates.
