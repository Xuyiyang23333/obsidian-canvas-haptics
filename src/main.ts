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
  resizeFeedback: boolean;
  hapticPattern: HapticPattern;
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

interface DragState {
  node: HTMLElement;
  pointerId: number;
  initialWidth: number;
  initialHeight: number;
}

type HapticPattern = "generic" | "alignment" | "level";

const DEFAULT_SETTINGS: CanvasHapticsSettings = {
  enabled: true,
  alignmentFeedback: true,
  resizeFeedback: true,
  hapticPattern: "alignment",
  tolerance: 8,
  cooldown: 120,
};

const HAPTIC_SCRIPT_FILENAME = "haptic.jxa";

class CanvasHapticsPlugin extends Plugin {
  settings: CanvasHapticsSettings = { ...DEFAULT_SETTINGS };
  private activeAlignments = new Set<string>();
  private activeResizeAlignments = new Set<string>();
  private lastFeedbackAt = 0;
  private dragState: DragState | null = null;
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
    const resizeHandle = this.findResizeHandle(event.target);
    const node = this.findCanvasNode(event, Boolean(resizeHandle));
    if (!node) return;
    const rect = node.getBoundingClientRect();
    this.dragState = {
      node,
      pointerId: event.pointerId,
      initialWidth: rect.width,
      initialHeight: rect.height,
    };
    this.activeAlignments.clear();
    this.activeResizeAlignments.clear();
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

    const isResizing = movingRect.width !== this.dragState.initialWidth || movingRect.height !== this.dragState.initialHeight;
    const resizeAlignments = isResizing
      ? findResizeAlignments(movingRect, candidates, this.settings.tolerance)
      : [];
    const currentResizeKeys = new Set(resizeAlignments.map((alignment) => alignment.key));
    const enteredResizeAlignment = resizeAlignments.find((alignment) => !this.activeResizeAlignments.has(alignment.key));
    this.activeResizeAlignments = currentResizeKeys;

    const shouldPlayAlignment = Boolean(enteredAlignment && this.settings.alignmentFeedback);
    const shouldPlayResize = Boolean(enteredResizeAlignment && this.settings.resizeFeedback);
    if (!shouldPlayAlignment && !shouldPlayResize) return;

    const now = performance.now();
    if (now - this.lastFeedbackAt < this.settings.cooldown) return;
    this.lastFeedbackAt = now;
    this.performHaptic(this.settings.hapticPattern);
  }

  private endDrag(): void {
    this.dragState = null;
    this.activeAlignments.clear();
    this.activeResizeAlignments.clear();
  }

  private findCanvasNode(event: PointerEvent, allowResizeHitTest: boolean): HTMLElement | null {
    const { target } = event;
    if (!(target instanceof Element)) return null;
    const node = target.closest<HTMLElement>(".canvas-node");
    if (node?.closest(".canvas-wrapper, .canvas")) return node;
    if (!allowResizeHitTest) return null;

    const parentNode = target.closest<HTMLElement>(".canvas-node-resizer")?.closest<HTMLElement>(".canvas-node");
    if (parentNode?.closest(".canvas-wrapper, .canvas")) return parentNode;

    const padding = 12;
    let nearestNode: HTMLElement | null = null;
    let nearestArea = Number.POSITIVE_INFINITY;
    document.querySelectorAll<HTMLElement>(".canvas-wrapper .canvas-node, .canvas .canvas-node").forEach((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const withinExpandedBounds = event.clientX >= rect.left - padding
        && event.clientX <= rect.right + padding
        && event.clientY >= rect.top - padding
        && event.clientY <= rect.bottom + padding;
      if (!withinExpandedBounds) return;

      const area = rect.width * rect.height;
      if (area < nearestArea) {
        nearestArea = area;
        nearestNode = candidate;
      }
    });

    return nearestNode;
  }

  private findResizeHandle(target: EventTarget | null): Element | null {
    return target instanceof Element ? target.closest(".canvas-node-resizer") : null;
  }

  private performHaptic(pattern: HapticPattern): void {
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

  performHapticForPreview(pattern: HapticPattern): void {
    this.performHaptic(pattern);
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

export function findResizeAlignments(moving: RectLike, nodes: Array<HTMLElement>, tolerance: number): Alignment[] {
  const matches: Alignment[] = [];

  for (const [index, node] of nodes.entries()) {
    const rect = node.getBoundingClientRect();
    const nodeKey = node.dataset.nodeId || node.id || index;

    if (Math.abs(moving.width - rect.width) <= tolerance) {
      matches.push({ key: `${nodeKey}:width` });
    }
    if (Math.abs(moving.height - rect.height) <= tolerance) {
      matches.push({ key: `${nodeKey}:height` });
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
      .setName("Resize feedback")
      .setDesc("Pulse once when a resized node reaches another node's width or height.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.resizeFeedback)
        .onChange(async (value) => {
          this.plugin.settings.resizeFeedback = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Haptic type")
      .setDesc("Choose the macOS feedback pattern used for alignment, resize, and preview feedback.")
      .addDropdown((dropdown) => dropdown
        .addOptions({
          generic: "Generic",
          alignment: "Alignment",
          level: "Level change",
        })
        .setValue(this.plugin.settings.hapticPattern)
        .onChange(async (value) => {
          this.plugin.settings.hapticPattern = value as HapticPattern;
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
      .setName("Haptic preview")
      .setDesc("Play each macOS pattern to compare the available feedback effects.")
      .setHeading();

    const previews: Array<{ pattern: HapticPattern; name: string; description: string }> = [
      { pattern: "generic", name: "Generic", description: "A general-purpose trackpad pulse." },
      { pattern: "alignment", name: "Alignment", description: "A pattern intended for alignment feedback." },
      { pattern: "level", name: "Level change", description: "A pattern intended to indicate a level change." },
    ];

    previews.forEach(({ pattern, name, description }) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addButton((button) => button.setButtonText("Play").onClick(() => {
          this.plugin.performHapticForPreview(pattern);
          new Notice(`${name} preview requested`);
        }));
    });
  }
}

export default CanvasHapticsPlugin;
