# Project Context

## Purpose

Obsidian Lark 是一个 Obsidian 桌面端插件，用于把本地 vault 中的 `.lark.md` 影子文件与 Lark / 飞书云文档关联起来。插件的目标是让用户在 Obsidian 中像打开普通 Markdown 一样打开远端文档，同时保留本地索引、标题同步和 Obsidian Bases 汇总能力。

## Tech Stack

- TypeScript
- Obsidian Plugin API
- Electron WebView
- Node.js test runner (`node --test`)
- esbuild
- ESLint
- `lark-cli` 作为 Lark / 飞书 API 操作入口

## Project Conventions

### Code Style

- 源码使用 TypeScript，保持模块职责清晰。
- 复用 Obsidian API 的 `TFile`、`WorkspaceLeaf`、`Modal`、`PluginSettingTab` 等类型。
- 用户可见文本通过 `src/i18n.ts` 维护，避免在功能代码中散落硬编码文案。
- 手动修改代码时保持小范围变更，避免与当前需求无关的重构。

### Architecture Patterns

- `.lark.md` 文件是本地影子文件，只保存 Front matter 元数据和说明文本。
- `src/main.ts` 负责插件生命周期、命令注册、文件打开路由和 modal 编排。
- `src/feishu-view.ts` 负责 WebView 视图、标签页状态和手动同步入口。
- `src/lark-cli.ts` 和 `src/lark-cli-resolver.ts` 负责调用并定位 `lark-cli`。
- `src/title-sync.ts` 负责远端标题到 Front matter / 文件名的同步。
- `src/base-manager.ts` 负责在默认笔记目录下维护 `Lark Documents.base`。

### Testing Strategy

- 单元测试使用 `node --test`。
- 测试通过 esbuild 打包目标模块，并用本地 stub 隔离 Obsidian API。
- 行为变更需要补充或更新对应测试。
- 发布前至少运行 `npm run lint`、`npm test` 和 `npm run build`。

### Git Workflow

- 使用 conventional commit 信息。
- 本项目尚未发布，不需要对历史插件 ID、Base 文件名或旧数据布局做兼容。
- 多阶段工作按阶段独立提交并推送，便于回滚和审查。

## Domain Context

- Lark 与飞书在产品和域名上并存，插件品牌使用 Obsidian Lark，但仍支持 `feishu.cn` 和 `larksuite.com` 链接。
- Obsidian 普通 Markdown 文件的打开语义是重复点击同一文件时复用已有标签页；`.lark.md` 也必须遵循该体验。
- 远端文档标题是本地 `.lark.md` 文件名的主要来源，文件名冲突时使用递增索引后缀解决。

## Important Constraints

- 插件依赖 WebView，因此仅支持 Obsidian Desktop。
- `Add linked Lark document` 只要求输入 URL，不要求用户手动输入标题。
- 默认创建的本地 Lark 文档必须位于 `Default note folder`。
- 当前阶段不需要兼容旧的 `obsidian-feishu` 发布数据，因为插件尚未正式发布。

## External Dependencies

- Obsidian Desktop 和 Obsidian Plugin API。
- `lark-cli`，用于创建文档、读取标题和解析 wiki 节点信息。
- Lark / 飞书云文档服务。
