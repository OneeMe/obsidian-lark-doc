# Lark WebView 打开后文件树高亮停留在上一个文件

## 基本信息

- 日期：2026-05-23
- 严重程度：中
- 状态：Fixed locally
- 影响范围：打开 `.lark.md` 后 Obsidian 文件树的当前文件高亮状态
- 关联 Commit：待补充

## 问题描述

用户在文件树中点击一个 `.lark.md` 文档后，右侧已经正确打开对应的 Lark WebView，但左侧文件树高亮仍停留在前一个文档，例如停留在 `Lark Documents.base` 上。

## 复现路径

1. 打开 sandbox vault。
2. 先选中 `Lark Documents.base`。
3. 点击同目录下的 `.lark.md` 文档。
4. 右侧进入 Lark WebView，但文件树高亮仍显示前一个 Base 文件。

## 代码位置

- `src/main.ts`：将 Markdown view state 路由为 Lark WebView state。
- `src/feishu-view.ts`：自定义 `FeishuDocView` 的 state 与 `FileView.file` 绑定。

## 根因分析

为了避免自定义 WebView 被 Obsidian 的 `FileView` 文件加载生命周期覆盖，之前的 view state 中只保留了 `sourcePath`，没有保留或绑定 `file`。这样可以避免重复生命周期问题，但副作用是 Obsidian 无法从当前 active view 识别对应的 vault 文件，文件树高亮和 `workspace.getActiveFile()` 仍停留在上一个文件。

第一轮修复恢复了 `file` state 并手动绑定 `this.file`，但用户回测仍未高亮。进一步判断文件树的选中态还依赖 Obsidian workspace 的 `file-open` 通知。由于 `.lark.md` 打开请求被路由为自定义 view state，普通 Markdown 打开的 `file-open` 链路没有完整发生，文件树监听者仍没有收到当前文件变更。

## 修复方案

在包含 URL 的自定义 view state 中恢复 `file` 路径，并在 `FeishuDocView.setState()` 中手动把 `sourcePath` 对应的 `TFile` 绑定到 `this.file`，但仍不调用 `FileView.setState()` 的文件加载流程。这样 Obsidian 能识别当前 active file，WebView 渲染也不会被空态覆盖。

同时，在 Lark markdown 路由完成后主动触发一次 `workspace.trigger("file-open", file)`，通知文件树刷新当前文件高亮。插件自己的 `file-open` 后备监听会吞掉这次人工事件，避免重复调用 `openFeishuView()` 造成循环。

## 测试策略

先补充失败测试，确认 URL state 会绑定源文件但不会调用 `FileView.setState()`；再更新路由测试，确认生成的 view state 同时包含 `file` 和 `sourcePath`，并在首次打开与复用已有 Lark view 时都会触发 `file-open` 通知。

## 验证结果

- `npm test -- tests/feishu-view.test.mjs tests/main-routing.test.mjs`：先红后绿，覆盖 `file/sourcePath` state 与不调用 `FileView.setState()` 的回归点。
- `npm run lint`：通过。
- `npm test`：49 个测试全部通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。
- `npm run build`：通过。
- `npm run release:validate`：通过。
- `git diff --check`：通过。

## 经验总结

自定义 `FileView` 仍需要让 Obsidian 能识别当前文件，否则文件树、active file 和命令可用性都会停留在上一个文件状态。避免生命周期覆盖的关键不是完全移除 `file`，而是在 URL state 下自己绑定 `this.file`，同时跳过 `FileView.setState()` 的自动文件加载流程。
