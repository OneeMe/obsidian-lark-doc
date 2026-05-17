# Clicking Feishu shadow files does not open WebView

## 基本信息

- 日期：2026-05-18
- 严重程度：High
- 状态：Fixed
- 影响范围：Obsidian 文件列表中点击飞书影子文件没有进入 Feishu WebView
- 关联 Commit：未提交

## 问题描述

用户在 `/Users/onee/Code/onee-workspace/wiki` vault 中测试 `.lark` 扩展注册方案，点击文件后没有打开对应 Feishu WebView，而是显示 Obsidian 最开始的 tab 页面。第一次补齐 `FileView` 的 `.lark` 接管合约后仍不生效，因此切换策略：飞书影子文件改为 Markdown 兼容的 `*.lark.md`。

## 复现路径

1. 打开 vault：`/Users/onee/Code/onee-workspace/wiki`。
2. 启用 `obsidian-feishu` 插件。
3. 点击飞书影子文件。
4. 期望当前 leaf 进入 `FeishuDocView` 并加载 front matter 中的 `feishu_url`。
5. 实际显示默认 tab 页面。

## 代码位置

- `src/main.ts`：`WorkspaceLeaf.setViewState` 路由拦截、文件打开事件后备处理和 WebView 切换。
- `src/doc-creator.ts`：飞书影子文件创建。
- `src/title-sync.ts`：标题同步时的文件重命名。
- `src/lark-file.ts`：`*.lark.md` 文件名约定。
- `src/feishu-frontmatter.ts`：读取 Markdown front matter。

## 根因分析

`.lark` 是 Obsidian 非原生 Markdown 扩展。即使插件调用 `registerExtensions(["lark"], FEISHU_VIEW_TYPE)`，实际测试中点击文件仍没有稳定进入插件 WebView，说明问题发生在 Obsidian 的自定义扩展名文件路由层。

飞书影子文件本质上只需要保存 front matter 元数据，不需要成为真正的新文件格式。继续走 `.lark` 会让插件依赖 Obsidian 的扩展注册和 `FileView` 文件状态链路；改为 `*.lark.md` 后，文件仍是普通 Markdown，Obsidian 的 `WorkspaceLeaf.setViewState({type: "markdown", state: {file}})`、metadata cache、文件列表、重命名等行为都能复用原生路径。

参考 Excalidraw 的 `.excalidraw.md` 实现，它不是注册 `md` 扩展，而是在 Markdown view state 进入 leaf 时判断 front matter/路径并改成自定义 view type。

## 修复方案

采用 `*.lark.md` 作为飞书影子文件约定：

1. 移除 `.lark` 扩展注册，避免继续依赖自定义文件扩展路由。
2. 新建飞书文档时生成 `标题.lark.md`。
3. monkey patch `WorkspaceLeaf.prototype.setViewState`：当 Obsidian 准备以 Markdown 打开 `*.lark.md` 且文件 front matter 中有有效飞书元数据时，把 view state 改为 `FEISHU_VIEW_TYPE`。
4. 保留 `file-open` 事件作为后备：普通 `.md` 仍按设置 `autoOpenFeishuView` 决定是否自动打开；`*.lark.md` 无视该设置，命中 front matter 后直接切换 `FeishuDocView`。
5. 标题同步重命名时保留 `.lark.md` 后缀，避免同步后变成普通 `.md`。

## 测试策略

新增 `tests/lark-file.test.mjs`，覆盖新的文件名约定：

1. `*.lark.md` 被识别为飞书影子 Markdown。
2. `.lark` 和普通 `.md` 不会误判。
3. 能从 Markdown view state 中提取 `*.lark.md` 文件路径，用于 `setViewState` 拦截。
4. 标题同步时 `*.lark.md` 会保留完整后缀。

更新 `tests/feishu-frontmatter.test.mjs`，用 `.lark.md` 文件路径验证 metadata cache 为空时仍能从文件内容读取 front matter。

## 验证结果

- `npm test`：通过。
- `npm run build`：通过，`main.js` 已重新生成。
- `npm run lint`：通过。
- `git diff --check`：通过。
- 已确认 `/Users/onee/Code/onee-workspace/wiki/Feishu/` 下测试文件当前为 `test.lark.md`、`ttt.lark.md`、`tttt.lark.md`。

## 经验总结

对于只保存元数据的影子文件，优先复用 Obsidian 原生 Markdown 文件生命周期，再用文件名约定切换自定义视图。这样比注册全新扩展名更稳，也更接近 Excalidraw 这类 `*.xxx.md` 插件文件的思路。
