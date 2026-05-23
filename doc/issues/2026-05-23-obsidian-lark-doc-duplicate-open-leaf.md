# Reopening the same Lark note creates duplicate view tabs

## 基本信息

- 日期：2026-05-23
- 严重程度：Medium
- 状态：Fixed locally
- 影响范围：Obsidian 文件列表中重复点击同一个 `*.lark.md` 文件时会打开重复的 Lark 文档视图
- 关联 Commit：待补充

## 问题描述

用户在 Obsidian 中多次点击同一个 Lark 影子 Markdown 文件时，插件会重复打开同一个飞书文档查看页。这个行为不同于原生 Markdown：如果目标文件已经在某个 tab 中打开，再次点击应该聚焦已有 tab，而不是创建新的查看页。

## 复现路径

1. 打开包含 `*.lark.md` 文件的 vault。
2. 点击某个已经关联 `feishu_url` 的 Lark 影子文件。
3. 再次从文件列表点击同一个文件。
4. 期望聚焦已有 Lark 文档 tab。
5. 实际出现重复的同文档查看 tab。

## 代码位置

- `src/main.ts`：`WorkspaceLeaf.setViewState` 路由拦截与 `file-open` 后备打开逻辑。
- `src/feishu-view.ts`：`openFeishuView()` 选择或创建 `FeishuDocView` leaf。
- `tests/feishu-view.test.mjs`：视图打开行为测试。

## 根因分析

插件有两条打开路径：

1. `WorkspaceLeaf.setViewState` monkey patch 会在 Obsidian 准备以 Markdown 打开 `*.lark.md` 时，把 view state 改写成 `FEISHU_VIEW_TYPE`。
2. `file-open` 后备逻辑会继续调用 `openFeishuView()`，把关联文件切到 Lark WebView。

旧逻辑只把 `*.lark.md` 打开请求转换成自定义 view，没有先检查是否已经存在同一个 `sourcePath/file` 的 `FeishuDocView` leaf。因此当 Obsidian 为这次点击分配了新的目标 leaf 时，插件会直接在这个新 leaf 中创建同文档的 Lark 视图，而不是像原生 Markdown 那样聚焦已有 tab。

`openFeishuView()` 也有同类问题：它优先复用当前 Markdown leaf，而不是先查找是否已经有同源文件的 Feishu leaf。

第一次修复后，用户回测发现点击文件反而不再打开 WebView。原因是复用已有 leaf 时只调用了 `revealLeaf()` 并取消原始打开流程，但 Obsidian 中已有的自定义 leaf 可能处于 deferred/restored 状态，或者保存的 state 不完整。此时只 reveal 不能保证 `FileView` 已经拿到完整的 `url/sourcePath` 并渲染 WebView。

第二次修复后，用户回测发现首次点击也无法稳定渲染 WebView。调试日志显示 `WorkspaceLeaf.setViewState` 已正确命中 `*.lark.md`，front matter 也解析出了 `feishu_url`，并且 `FeishuDocView.renderWebview()` 已执行。真正的问题是自定义 `feishu-doc-view` state 中写入了 `file` 字段，导致 `FileView.super.setState()` 走 Obsidian 文件加载生命周期，视图先渲染空态，再由自定义 URL state 渲染 WebView，生命周期互相覆盖。Lark WebView 需要保留的是来源文件身份，不应让 Obsidian 把这个自定义视图继续当作 Markdown file view 管理。

## 修复方案

采用同源文件优先复用策略：

1. 在 `src/feishu-view.ts` 中新增 `findFeishuLeafForSourcePath()`，通过 `leaf.getViewState().state.sourcePath/file` 查找已有的同文件 Lark view。
2. `openFeishuView()` 先查找同源 Feishu leaf；找到后把完整 `FEISHU_VIEW_TYPE` state 写回已有 leaf，再加载并聚焦，不再改写当前 Markdown leaf。
3. `WorkspaceLeaf.setViewState` 路由阶段也先查找同源 Feishu leaf；如果已有 leaf 且不是当前目标 leaf，则把完整 Lark view state 写入已有 leaf，聚焦已有 leaf，并跳过当前目标 leaf 的原始 `setViewState()`。
4. 如果这次点击产生的目标 leaf 还是空 tab，则在聚焦已有 leaf 后调用 `detach()` 清理空 tab，避免留下空白重复页。
5. 写入已有 leaf 后调用 `loadIfDeferred?.()`，确保 restored/deferred leaf 被实际加载后再 reveal。
6. 自定义 `FEISHU_VIEW_TYPE` state 只保存 `sourcePath/url/title`，不再保存 `file`；`FeishuDocView.setState()` 在有 URL 时直接加载 WebView，不再调用 `FileView.super.setState()`，避免触发 Markdown 文件加载链路覆盖 WebView。

## 测试策略

新增和更新自动化测试：

1. `tests/feishu-view.test.mjs`：覆盖 `openFeishuView()` 在已有同源 Feishu leaf 时刷新已有 leaf state，不改写当前 Markdown leaf，并覆盖 reveal 前会加载 deferred leaf。
2. `tests/main-routing.test.mjs`：模拟 `WorkspaceLeaf.setViewState` 被 patch 后，重复打开同一个 `*.lark.md` 时刷新并聚焦已有 Feishu leaf、关闭空目标 leaf；同时覆盖首次打开无已有 leaf 时会直接转换成 Feishu view state。
3. `tests/run-coverage.mjs`：项目更名后把覆盖率临时目录清理规则扩展到 `obsidian-lark-doc-*`。
4. `tests/feishu-view.test.mjs`：覆盖 URL state 加载不会调用 `FileView.setState()`，并确认自定义视图 state 只暴露 `sourcePath`，不暴露 `file`。

## 验证结果

- `node --test tests/feishu-view.test.mjs`：通过。
- `node --test tests/main-routing.test.mjs`：通过。
- `npm test`：41 个测试全部通过。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。

## 经验总结

自定义视图想模拟原生 Markdown 的“同文件只打开一个 tab”行为时，不能只依赖 Obsidian 对文件 leaf 的查找。插件把 Markdown view state 改写成自定义 view type 后，需要自己保留并查询来源文件身份，在所有入口优先复用同源 leaf。同时，自定义 WebView state 不应继续写入 `file` 字段，否则会重新触发 Obsidian 的文件视图生命周期，和自定义 URL 渲染链路互相覆盖。
