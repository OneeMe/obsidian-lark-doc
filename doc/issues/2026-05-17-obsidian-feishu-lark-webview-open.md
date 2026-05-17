# .lark files do not open Feishu WebView automatically

## 基本信息

- 日期：2026-05-17
- 严重程度：High
- 状态：Fixed locally
- 影响范围：Obsidian 中打开 `.lark` 影子文件时无法直接显示对应飞书文档
- 关联 Commit：待补充

## 问题描述

用户希望在 Obsidian 中打开 `.lark` 文件时，插件自动使用 `FeishuDocView` 中的 WebView 打开对应飞书文档。目前 `.lark` 扩展已注册到自定义视图，但打开后没有稳定显示远端文档。

## 复现路径

1. 通过插件创建或手动准备一个包含 `feishu_doc_id`、`feishu_url`、`feishu_title` front matter 的 `.lark` 文件。
2. 在 Obsidian 文件列表中打开该 `.lark` 文件。
3. 期望直接进入 Feishu WebView。
4. 实际表现为无法解析出 URL，或视图停留在空状态。

## 代码位置

- `src/main.ts`：注册 `.lark` 扩展与文件打开逻辑。
- `src/feishu-view.ts`：`FeishuDocView` 负责加载文件并渲染 WebView。
- `src/indexer.ts`、`src/title-sync.ts`：当前读取 front matter 的路径依赖 metadata cache。

## 根因分析

问题不是 `registerExtensions(["lark"], FEISHU_VIEW_TYPE)` 这条路线本身错误，而是打开后的数据加载链路断了：

1. `.lark` 通过扩展注册进入 `FeishuDocView` 时，Obsidian 会按 `FileView` 的文件状态加载文件；当前自定义 `setState()` 只处理 `url` 状态，没有把带 `file` 的状态交给 `FileView.setState()`，导致文件绑定和 `onLoadFile()` 链路不可靠。
2. `FeishuDocView`、`FeishuIndexer`、`title-sync` 都只从 `metadataCache.getFileCache(file)?.frontmatter` 读取飞书元数据。Obsidian 的 front matter cache 主要面向 Markdown 笔记，`.lark` 自定义扩展不能稳定依赖这层缓存，所以会解析不到 `feishu_url`，最终 WebView 没有 URL 可加载。

## 修复方案

采用方案：

- 新增 `src/feishu-frontmatter.ts`，统一读取飞书 front matter。
- 读取策略为：先读 metadata cache，适配已有 `.md` 文件；cache 无结果时用 `vault.cachedRead(file)` 读取文件原文，再通过 Obsidian `getFrontMatterInfo()` 和 `parseYaml()` 解析 YAML。
- `FeishuDocView` 改为 `FileView` 打开 `.lark` 文件，并在 state 带 `file` 时调用 `super.setState()`，保留 Obsidian 的文件加载流程。
- `FeishuDocView`、`FeishuIndexer`、`title-sync`、后台同步统一使用新读取函数。
- 手动“Open Feishu document”和“Sync Feishu title now”命令支持 `.md` 与 `.lark`。
- 标题同步重命名时保留当前文件扩展名，避免 `.lark` 被改回 `.md`。

未采用方案：

- 没有把 `.lark` 内容伪装成 Markdown 来强行进入 metadata cache；这会依赖 Obsidian 内部索引行为，不如直接读取影子文件稳定。
- 没有为缺失 `feishu_url` 的文件用租户域名猜 URL；当前 `.lark` 创建流程会写入完整 URL，猜测域名容易打开到错误租户。

## 测试策略

自动化测试：

- 新增 `tests/feishu-frontmatter.test.mjs`，覆盖 metadata cache 为空时仍能从 `.lark` 文件内容读取 `feishu_doc_id`、`feishu_url`、`feishu_title`。
- 新增 `npm test` 脚本，使用 Node 内置 test runner。

手动/静态验证：

- `npm run build` 验证 TypeScript 与 esbuild 生产构建。
- `npm run lint` 用于检查 Obsidian lint 规则。

## 验证结果

- `npm test`：通过。
- `npm run build`：通过。
- `npm run lint`：通过。lint 清理记录见 `doc/issues/2026-05-17-obsidian-feishu-lint-cleanup.md`。

## 经验总结

- 自定义文件扩展要走 `FileView`，并让带 `file` 的 state 继续进入 `super.setState()`；只处理自定义 state 会绕开 Obsidian 的文件加载流程。
- 非 Markdown 扩展不要假设有 `metadataCache.frontmatter`。影子文件这种场景应该直接读取文件内容，使用 Obsidian 的 front matter/YAML parser 做显式解析。
- `.lark` 作为影子文件时应保存完整 `feishu_url`，不要只保存 token；WebView 打开需要的是 URL，不是文档 token。
