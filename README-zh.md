# Canvas Haptics

Canvas Haptics 是一个仅支持 macOS 桌面版 Obsidian 的插件。当 Canvas 节点进入对齐阈值时，它会通过 MacBook 触控板提供轻微的触觉反馈。

## 功能

- 检测 Canvas 节点拖拽。
- 检测左边缘、中心线、右边缘以及上边缘、中心线、下边缘对齐。
- 每次进入新的对齐状态时触发一次反馈。
- 支持启用/禁用反馈和调整对齐容差。
- 提供触觉反馈测试按钮。

## 平台限制

本插件依赖 macOS AppKit 的触觉反馈 API 和 MacBook 触控板硬件，仅支持 Apple Silicon macOS 桌面版 Obsidian。移动端和非 macOS 平台不在支持范围内。

## 安装

从 Obsidian 的社区插件目录安装，或将 Release 中的 `main.js`、`manifest.json` 和 `styles.css` 复制到：

```text
<Vault>/.obsidian/plugins/canvas-haptics/
```

启用插件后，打开 Canvas 并拖拽节点。也可以在 **设置 → Canvas Haptics → Test feedback** 中测试触觉反馈。

## 开发

```sh
pnpm install
pnpm check
pnpm build
```

`main.js` 是构建产物，不作为源码提交。JXA 脚本位于 `src/haptic.jxa`，构建时会嵌入 `main.js`，插件首次加载时释放到插件目录供 `/usr/bin/osascript` 执行。

## 隐私与安全

插件不联网、不使用遥测、不包含广告、不要求账号或付款，也不会读取或传输 Vault 笔记内容。它只调用系统提供的 `/usr/bin/osascript`，并在自身插件目录中写入内嵌的 JXA 辅助脚本。Canvas DOM 选择器属于 Obsidian 内部行为，未来版本可能发生变化。

## 许可证

本项目采用 [Mozilla Public License 2.0](LICENSE) 发布。
