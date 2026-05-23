# Change: 文档化 Lark Doc 当前需求

## Why

Lark Doc 已经围绕 `.lark.md` 影子文件、Lark / 飞书 WebView、标题同步、默认目录和多语言完成了一组核心能力。为了后续继续迭代，需要用 OpenSpec 把当前需求沉淀成可验证的中文 proposal，作为之后开发和验收的共同基线。

## What Changes

- 新增 `obsidian-lark-plugin` capability，描述插件当前应满足的核心行为。
- 明确 `.lark.md` 文件打开时的 WebView 路由和标签页复用语义。
- 明确 `Add linked Lark document`、`Create Lark document`、默认笔记目录和 Base 文件位置。
- 明确标题同步、文件名冲突处理、手动同步按钮和多语言配置。
- 明确当前阶段不需要兼容旧 `obsidian-feishu` 数据布局。

## Impact

- Affected specs: `obsidian-lark-plugin`
- Affected code: `src/main.ts`, `src/feishu-view.ts`, `src/lark-note.ts`, `src/title-sync.ts`, `src/base-manager.ts`, `src/i18n.ts`, `src/settings.ts`
- Affected tests: existing unit tests that cover modal behavior, view routing, title sync, Base creation, i18n, and `.lark.md` helpers
