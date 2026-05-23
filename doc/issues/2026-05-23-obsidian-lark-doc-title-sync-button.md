# Sync button does not persist remote title into Lark note

## 基本信息

- 日期：2026-05-23
- 严重程度：Medium
- 状态：Fixed locally
- 影响范围：Lark WebView 顶部同步按钮无法可靠地把远端标题写回对应的 `*.lark.md` 文件
- 关联 Commit：待补充

## 问题描述

用户在 Obsidian 中打开一个关联 Lark 文档的 `*.lark.md` 文件后，点击 WebView 顶部的同步按钮，期望插件从 Lark 获取最新标题，并把标题同步到本地 `*.lark.md` 的 front matter 中。当前实际效果是标题没有可靠写入本地文件。

## 复现路径

1. 打开包含 Lark front matter 的 `*.lark.md` 文件。
2. 修改远端 Lark / 飞书文档标题，或让远端标题与本地 `lark_title` 不一致。
3. 点击 WebView 顶部的同步按钮。
4. 期望本地 `*.lark.md` 中的 `lark_title` 更新为远端标题。
5. 实际观察到 `*.lark.md` 中的标题没有被正确更新。

## 代码位置

- `src/feishu-view.ts`：顶部同步按钮调用 `syncCurrentFile()`。
- `src/main.ts`：`syncSourceFile()` 把 WebView 的 `sourcePath` 转回 vault 文件并调用同步逻辑。
- `src/title-sync.ts`：读取 front matter、获取远端标题、写回本地文件和重命名文件。
- `src/feishu-frontmatter.ts`：优先读取 Obsidian metadata cache 中的 front matter。

## 根因分析

`syncTitle()` 通过 `readFeishuFrontMatter()` 获取本地关联信息，而 `readFeishuFrontMatter()` 会优先读取 Obsidian metadata cache。同步按钮是一个即时写文件操作，metadata cache 与实际 `*.lark.md` 文件内容可能短时间不同步。

当 cache 中的 `lark_title` 已经是远端标题，但实际文件内容仍是旧标题时，旧逻辑会判断 `titleChanged === false`，从而跳过 `app.vault.modify()`，导致远端标题没有写回本地 `*.lark.md`。

另外，旧逻辑直接拼接 `lark_title: ${newTitle}`。如果远端标题包含 `: `、引号等 YAML 敏感字符，写出的 front matter 可能无法被 Obsidian 正确解析。

## 修复方案

采用“同步写入以实际文件内容为准”的策略：

1. `syncTitle()` 改为通过 `app.vault.read(file)` 读取实际 `*.lark.md` 内容。
2. 使用 `parseFeishuFrontMatterContent()` 从实际文件内容解析 front matter，而不是优先使用 metadata cache。
3. 远端标题会先 `trim()`，避免尾随空格造成反复同步。
4. 写回 `lark_title` 时使用 JSON 字符串格式作为 YAML 双引号字符串，保证包含 `: ` 等字符的标题仍可被 YAML 正确解析。

## 测试策略

新增回归测试：

1. 构造 metadata cache 中标题已经是远端标题、但实际文件内容仍是旧标题的场景。
2. 点击同步对应的 `syncTitle()` 应继续读取实际文件内容并写回 `lark_title`。
3. 远端标题包含 `: ` 时，应写成 YAML 安全的双引号字符串。

同步更新既有测试，确认普通标题替换仍可写回，文件名同步仍保持原行为。

## 验证结果

- `node --test tests/title-sync.test.mjs`：通过。
- `npm run lint`：通过。
- `npm test`：49 个测试全部通过。
- `npm run test:coverage`：通过，核心单元覆盖率保持 100% statements、branches、functions、lines。
- `npm run build`：通过。
- `npm run release:validate`：通过。

## 经验总结

即时同步类写操作不能把 Obsidian metadata cache 当作文件真实状态。cache 适合展示和索引，但写入前的变更判断应读取实际文件内容，否则会出现“UI 看起来已更新、文件实际没更新”的状态错位。手工写 YAML front matter 时也必须处理字符串转义，远端文档标题不能假设是 YAML plain scalar。
