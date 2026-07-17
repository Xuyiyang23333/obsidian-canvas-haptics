# Canvas Haptics

A macOS-only Obsidian plugin that gives a subtle trackpad pulse when a Canvas node enters an alignment threshold.

中文文档：[README-zh.md](README-zh.md)

## Prototype scope

- Detects dragging of `.canvas-node` elements.
- Compares visible left, center, and right / top, center, and bottom edges.
- Pulses once when a new alignment is entered.
- Pulses once when resizing a node reaches another node's width or height.
- Offers Generic, Alignment, and Level Change macOS haptic patterns, each with a settings-page preview button.
- Uses the macOS-provided `osascript` runtime with an embedded AppKit JXA script. The script is released into the plugin folder on first load; no unsigned executable is installed.
- Supports Apple Silicon macOS only. Mobile support is intentionally out of scope because the feature depends on MacBook trackpad hardware and AppKit haptics.

Canvas DOM selectors are internal Obsidian behavior and may need adjustment after Obsidian updates.

## Development

Install dependencies and build the release artifact:

```sh
pnpm install
pnpm build
```

For local development, use `pnpm dev` and copy the generated `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/canvas-haptics/`. Enable the plugin in Obsidian and open Settings → Canvas Haptics → Haptic preview.

The production release contains `main.js`, `manifest.json`, and `styles.css`. The JXA source is embedded into `main.js`; on plugin load, it is written to the plugin directory as `haptic.jxa` for `/usr/bin/osascript` to execute.

## Privacy and platform disclosures

Canvas Haptics does not use a network connection, telemetry, advertising, accounts, or payments. It does not read or transmit Vault note content. It invokes the system `/usr/bin/osascript` process and writes its bundled JXA helper inside the plugin's own directory. Canvas DOM selectors are internal Obsidian behavior and may need adjustment after Obsidian updates.

## License

This project is licensed under the Mozilla Public License 2.0. See [LICENSE](LICENSE).
