# Reopening an already open Lark note refreshes the WebView

## 基本信息

- 日期：2026-05-24
- 严重程度：Medium
- 状态：Fixed locally
- 影响范围：Obsidian 文件列表中重复点击已打开的 `*.lark.md` 文件时，Lark 文档 WebView 会重新加载
- 关联 Commit：待补充

## 问题描述

用户已经打开某个 `*.lark.md` 对应的 Lark 文档后，再次从文件列表点击同一个文件，插件会聚焦已有 tab，但同时刷新 WebView 页面。这个行为不同于原生 Markdown：只要文件对应的 tab 没有关掉，再次打开应该直接回到已有 tab，并保留 WebView 内部状态。

## 复现路径

1. 在 Obsidian 中打开一个带有 `lark_url` front matter 的 `*.lark.md` 文件。
2. 等待 Lark 文档 WebView 加载完成。
3. 再次从文件列表点击同一个 `*.lark.md` 文件。
4. 期望：已有 tab 被激活，WebView 保持当前页面状态。
5. 实际：已有 tab 被激活，但 WebView 重新加载。

## 代码位置

- `src/main.ts`：`routeLarkMarkdownViewState()` 在发现已有同源 Lark view 后仍调用 `existingLeaf.setViewState()`。
- `src/feishu-view.ts`：`openFeishuView()` 在发现已有同源 Lark view 后仍调用 `existingLeaf.setViewState()`。
- `tests/main-routing.test.mjs`：重复点击同一 `*.lark.md` 的路由行为测试。
- `tests/feishu-view.test.mjs`：命令入口打开 Lark view 的 leaf 复用测试。

## 根因分析

插件为了避免重复打开同一个 `*.lark.md`，已经会通过 `sourcePath/file` 找到已有的 `feishu-doc-view` leaf。但找到之后，旧逻辑仍然把新的 Lark view state 写回已有 leaf：

1. `routeLarkMarkdownViewState()` 调用 `existingLeaf.setViewState(routedState)`。
2. `openFeishuView()` 调用 `existingLeaf.setViewState({type: FEISHU_VIEW_TYPE, state})`。

`setViewState()` 会再次进入 `FeishuDocView.setState()`，继而调用 `loadUrl()` 和 `renderWebview()`，重新创建 `<webview>` 并设置 `src`。因此虽然 tab 没有重复打开，但 WebView 页面仍然被刷新。

另一个边界情况是 Obsidian 可能把本次文件点击派发给当前已经打开的 Lark leaf。旧逻辑只在 `existingLeaf !== leaf` 时走复用分支，如果二者是同一个 leaf，就会继续返回新的 view state，让当前 leaf 自己刷新。

## 修复方案

采用“已有同源 leaf 只 reveal，不重写 state”的策略：

1. `routeLarkMarkdownViewState()` 只要发现已有同源 leaf，就消费本次 Markdown 打开请求。
2. 对已有 leaf 仅调用 `loadIfDeferred?.()` 和 `revealLeaf()`，不再调用 `setViewState()`。
3. 如果本次点击产生的是额外空 leaf，仍然 detach，避免留下空 tab。
4. 当已有 leaf 就是当前 leaf 时，也消费本次请求并 reveal，不再让它进入原始 `setViewState()`。
5. `openFeishuView()` 的同源 leaf 复用逻辑同样不再刷新 state，只负责加载 deferred leaf 并 reveal。

## 测试策略

先补充/调整自动化测试，要求已有同源 Lark view 被再次打开时只执行 `loadIfDeferred()` 和 `revealLeaf()`，不能重新调用 `setViewState()`。

## 验证结果

- `node --test tests/main-routing.test.mjs`：通过。
- `node --test tests/feishu-view.test.mjs`：通过。
- `npm test`：54 个测试全部通过。
- `npm run lint`：通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。
- `npm run build`：通过。

## 经验总结

“复用已有 tab”和“刷新已有 view state”不是同一件事。对 WebView 类视图而言，重复写入相同 URL 也会造成用户可见的刷新；只要同源 leaf 已经存在且未关闭，打开动作应该只负责激活已有 leaf，不能重新渲染内容。
