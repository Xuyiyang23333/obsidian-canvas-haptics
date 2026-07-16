// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { execFile } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";

import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

import hapticScriptAsset from "./haptic.jxa";

const hapticScript = hapticScriptAsset as unknown as string;

interface CanvasHapticsSettings {
  enabled: boolean;
  alignmentFeedback: boolean;
  tolerance: number;
  cooldown: number;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface Alignment {
  key: string;
}

type HapticPattern = "generic" | "alignment";

const DEFAULT_SETTINGS: CanvasHapticsSettings = {
  enabled: true,
  alignmentFeedback: true,
  tolerance: 8,
  cooldown: 120,
};

const HAPTIC_SCRIPT_FILENAME = "haptic.jxa";

class CanvasHapticsPlugin extends Plugin {
  settings: CanvasHapticsSettings = { ...DEFAULT_SETTINGS };
  private activeAlignments = new Set<string>();
  private lastFeedbackAt = 0;
  private dragState: { node: HTMLElement; pointerId: number } | null = null;
  private registeredCanvasRoots = new WeakSet<Element>();
  private hapticFailureShown = false;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CanvasHapticsSettings>);

    try {
      await this.ensureHapticScript();
    } catch (error) {
      this.reportHapticFailure(error);
    }

    this.addSettingTab(new CanvasHapticsSettingTab(this.app, this));
    this.registerDomEvent(document, "pointerdown", (event) => this.onPointerDown(event as PointerEvent), true);
    this.registerDomEvent(document, "pointermove", (event) => this.onPointerMove(event as PointerEvent), true);
    this.registerDomEvent(document, "pointerup", () => this.endDrag(), true);
    this.registerDomEvent(document, "pointercancel", () => this.endDrag(), true);

    this.registerInterval(window.setInterval(() => this.discoverCanvasRoots(), 1500));
    this.discoverCanvasRoots();
  }

  onunload(): void {
    this.endDrag();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private discoverCanvasRoots(): void {
    document.querySelectorAll(".canvas-wrapper, .canvas").forEach((root) => {
      if (!this.registeredCanvasRoots.has(root)) {
        this.registeredCanvasRoots.add(root);
        root.classList.add("canvas-haptics-active");
      }
    });
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.settings.enabled || event.button !== 0) return;
    const node = this.findCanvasNode(event.target);
    if (!node) return;
    this.dragState = { node, pointerId: event.pointerId };
    this.activeAlignments.clear();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.settings.enabled || !this.dragState) return;
    if (event.pointerId !== this.dragState.pointerId) return;

    const movingNode = this.dragState.node;
    const movingRect = movingNode.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(".canvas-node"))
      .filter((node) => node !== movingNode && node.getBoundingClientRect().width > 0);

    const alignments = findAlignments(movingRect, candidates, this.settings.tolerance);
    const currentKeys = new Set(alignments.map((alignment) => alignment.key));
    const enteredAlignment = alignments.find((alignment) => !this.activeAlignments.has(alignment.key));
    this.activeAlignments = currentKeys;
    if (!enteredAlignment) return;

    const now = performance.now();
    if (now - this.lastFeedbackAt < this.settings.cooldown) return;
    this.lastFeedbackAt = now;
    this.performHaptic("alignment");
  }

  private endDrag(): void {
    this.dragState = null;
    this.activeAlignments.clear();
  }

  private findCanvasNode(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const node = target.closest<HTMLElement>(".canvas-node");
    if (!node || !node.closest(".canvas-wrapper, .canvas")) return null;
    return node;
  }

  private performHaptic(pattern: HapticPattern): void {
    if (pattern === "alignment" && !this.settings.alignmentFeedback) return;

    let scriptPath: string;
    try {
      scriptPath = this.hapticScriptPath();
    } catch (error) {
      this.reportHapticFailure(error);
      return;
    }

    execFile("/usr/bin/osascript", ["-l", "JavaScript", scriptPath, pattern], { windowsHide: true, timeout: 1000 }, (error, _stdout, stderr) => {
      if (!error) return;
      const details = stderr ? `${error.message}: ${stderr.trim()}` : error.message;
      this.reportHapticFailure(details);
    });
  }

  performHapticForTest(): void {
    this.performHaptic("generic");
  }

  private async ensureHapticScript(): Promise<void> {
    const scriptPath = this.hapticScriptPath();
    let currentScript: string | null = null;

    try {
      currentScript = await fs.readFile(scriptPath, "utf8");
    } catch {
      // The helper is created below when it is missing or unreadable.
    }

    if (currentScript === hapticScript) return;
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, hapticScript, "utf8");
  }

  private hapticScriptPath(): string {
    const adapter = this.app.vault.adapter;
    if (!("getBasePath" in adapter) || typeof adapter.getBasePath !== "function") {
      throw new Error("Canvas Haptics requires a desktop file-system adapter.");
    }

    return path.join(
      adapter.getBasePath(),
      this.app.vault.configDir,
      "plugins",
      this.manifest.id,
      HAPTIC_SCRIPT_FILENAME,
    );
  }

  private reportHapticFailure(error: unknown): void {
    if (this.hapticFailureShown) return;
    this.hapticFailureShown = true;
    const details = error instanceof Error ? error.message : String(error);
    console.warn("[Canvas Haptics] feedback unavailable", details);
    new Notice("Canvas Haptics：macOS 未能执行触觉反馈，请查看开发者控制台。", 6000);
  }
}

export function findAlignments(moving: RectLike, nodes: Array<HTMLElement>, tolerance: number): Alignment[] {
  const movingEdges = {
    left: moving.left,
    centerX: moving.left + moving.width / 2,
    right: moving.right,
    top: moving.top,
    centerY: moving.top + moving.height / 2,
    bottom: moving.bottom,
  };

  const xTargets = ["left", "centerX", "right"] as const;
  const yTargets = ["top", "centerY", "bottom"] as const;
  const matches: Alignment[] = [];

  for (const [index, node] of nodes.entries()) {
    const rect = node.getBoundingClientRect();
    const targetEdges = {
      left: rect.left,
      centerX: rect.left + rect.width / 2,
      right: rect.right,
      top: rect.top,
      centerY: rect.top + rect.height / 2,
      bottom: rect.bottom,
    };

    for (const [sources, axis] of [[xTargets, "x"], [yTargets, "y"]] as const) {
      for (const source of sources) {
        for (const target of sources) {
          const distance = Math.abs(movingEdges[source] - targetEdges[target]);
          if (distance <= tolerance) {
            matches.push({ key: `${node.dataset.nodeId || node.id || index}:${axis}:${source}:${target}` });
          }
        }
      }
    }
  }

  return matches;
}

class CanvasHapticsSettingTab extends PluginSettingTab {
  constructor(app: CanvasHapticsPlugin["app"], private plugin: CanvasHapticsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable feedback")
      .setDesc("Enable macOS trackpad feedback while dragging Canvas nodes.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Alignment feedback")
      .setDesc("Pulse once when a dragged node enters an alignment threshold.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.alignmentFeedback)
        .onChange(async (value) => {
          this.plugin.settings.alignmentFeedback = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Alignment tolerance")
      .setDesc("Distance in screen pixels used to detect alignment.")
      .addSlider((slider) => slider
        .setLimits(2, 20, 1)
        .setValue(this.plugin.settings.tolerance)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.tolerance = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Test feedback")
      .setDesc("Call the macOS AppKit bridge once.")
      .addButton((button) => button.setButtonText("Test").onClick(() => {
        this.plugin.performHapticForTest();
        new Notice("Canvas Haptics test requested");
      }));
  }
}

export default CanvasHapticsPlugin;
