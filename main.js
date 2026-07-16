const { execFile } = require("child_process");
const path = require("path");

const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");

const DEFAULT_SETTINGS = {
  enabled: true,
  alignmentFeedback: true,
  tolerance: 8,
  cooldown: 120,
};

class CanvasHapticsPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.activeAlignments = new Set();
    this.lastFeedbackAt = 0;
    this.dragState = null;
    this.registeredCanvasRoots = new WeakSet();

    this.addSettingTab(new CanvasHapticsSettingTab(this.app, this));
    this.registerDomEvent(document, "pointerdown", (event) => this.onPointerDown(event), true);
    this.registerDomEvent(document, "pointermove", (event) => this.onPointerMove(event), true);
    this.registerDomEvent(document, "pointerup", () => this.endDrag(), true);
    this.registerDomEvent(document, "pointercancel", () => this.endDrag(), true);

    this.registerInterval(window.setInterval(() => this.discoverCanvasRoots(), 1500));
    this.discoverCanvasRoots();
    console.info("[Canvas Haptics] loaded");
  }

  onunload() {
    this.endDrag();
    console.info("[Canvas Haptics] unloaded");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  discoverCanvasRoots() {
    // Canvas is an internal Obsidian view, so this intentionally uses DOM
    // selectors instead of relying on private Canvas classes.
    document.querySelectorAll(".canvas-wrapper, .canvas").forEach((root) => {
      if (!this.registeredCanvasRoots.has(root)) {
        this.registeredCanvasRoots.add(root);
        root.classList.add("canvas-haptics-active");
      }
    });
  }

  onPointerDown(event) {
    if (!this.settings.enabled || event.button !== 0) return;
    const node = this.findCanvasNode(event.target);
    if (!node) return;
    this.dragState = { node, pointerId: event.pointerId };
    this.activeAlignments.clear();
  }

  onPointerMove(event) {
    if (!this.settings.enabled || !this.dragState) return;
    if (event.pointerId !== this.dragState.pointerId) return;

    const movingNode = this.dragState.node;
    const movingRect = movingNode.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll(".canvas-node"))
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

  endDrag() {
    this.dragState = null;
    this.activeAlignments.clear();
  }

  findCanvasNode(target) {
    if (!(target instanceof Element)) return null;
    const node = target.closest(".canvas-node");
    if (!node || !node.closest(".canvas-wrapper, .canvas")) return null;
    return node;
  }

  performHaptic(pattern) {
    if (pattern === "alignment" && !this.settings.alignmentFeedback) return;
    const script = this.hapticScriptPath();
    execFile("/usr/bin/osascript", ["-l", "JavaScript", script, pattern], { windowsHide: true, timeout: 1000 }, (error, _stdout, stderr) => {
      if (error) {
        const details = stderr ? `${error.message}: ${stderr.trim()}` : error.message;
        console.warn("[Canvas Haptics] feedback unavailable", details);
        if (!this.hapticFailureShown) {
          this.hapticFailureShown = true;
          new Notice("Canvas Haptics：macOS 未能执行触觉反馈，请查看开发者控制台。", 6000);
        }
      }
    });
  }

  hapticScriptPath() {
    const basePath = this.app.vault.adapter.getBasePath();
    return path.join(basePath, this.app.vault.configDir, "plugins", this.manifest.id, "haptic.jxa");
  }
}

function findAlignments(moving, nodes, tolerance) {
  const movingEdges = {
    left: moving.left,
    centerX: moving.left + moving.width / 2,
    right: moving.right,
    top: moving.top,
    centerY: moving.top + moving.height / 2,
    bottom: moving.bottom,
  };

  const xTargets = ["left", "centerX", "right"];
  const yTargets = ["top", "centerY", "bottom"];
  const matches = [];
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const targetEdges = {
      left: rect.left,
      centerX: rect.left + rect.width / 2,
      right: rect.right,
      top: rect.top,
      centerY: rect.top + rect.height / 2,
      bottom: rect.bottom,
    };

    for (const [sources, axis] of [[xTargets, "x"], [yTargets, "y"]]) {
      for (const source of sources) {
        for (const target of sources) {
        const distance = Math.abs(movingEdges[source] - targetEdges[target]);
        if (distance <= tolerance) {
          matches.push({ key: `${node.dataset.nodeId || node.id || nodes.indexOf(node)}:${axis}:${source}:${target}` });
        }
        }
      }
    }
  }
  return matches;
}

class CanvasHapticsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Canvas Haptics" });

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
        this.plugin.performHaptic("generic");
        new Notice("Canvas Haptics test requested");
      }));
  }
}

module.exports = CanvasHapticsPlugin;
