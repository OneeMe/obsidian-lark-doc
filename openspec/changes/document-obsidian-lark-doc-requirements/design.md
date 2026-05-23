## Context

Lark Doc 的核心不是把远端文档内容复制到 Obsidian，而是在 vault 中保留一个轻量 `.lark.md` 影子文件，并把打开、索引、同步和预览体验接入 Obsidian 工作流。

当前插件尚未发布，因此可以直接采用新的品牌、默认目录和 Base 文件名，不需要迁移旧的 `obsidian-feishu` 插件数据。

## Goals / Non-Goals

- Goals: 让 `.lark.md` 像普通 Markdown 一样被打开和复用标签页。
- Goals: 通过 Lark / 飞书 URL 创建本地关联文件，并自动使用远端文档标题命名。
- Goals: 支持主动或自动同步远端标题，并在冲突时生成可预测的索引后缀。
- Goals: 保持默认笔记目录、Base 文件和新建文档位置一致。
- Goals: 提供中英文 UI 文案。
- Non-Goals: 同步远端文档正文到本地 Markdown。
- Non-Goals: 兼容尚未发布的旧插件 ID、旧 Base 文件名或旧默认目录。

## Decisions

- Decision: 使用 `.lark.md` 作为影子文件后缀。
  Rationale: Obsidian 仍把文件视为 Markdown，同时插件可通过复合后缀识别 Lark 文档代理。

- Decision: 继续使用 Front matter 保存 `feishu_doc_id`、`feishu_url`、`feishu_title`。
  Rationale: 字段表示当前支持的 Feishu / Lark 云文档元数据，且代码已围绕这些字段建立索引和同步逻辑。

- Decision: `Add linked Lark document` 只输入 URL。
  Rationale: 标题应来自远端文档，减少用户重复输入和本地标题不一致。

- Decision: WebView 顶部使用同步按钮替代默认返回 / 前进按钮。
  Rationale: 用户在 Obsidian 中更需要主动同步标题和文件名，而不是维护独立浏览器导航历史。

- Decision: `Lark Documents.base` 放在 `Default note folder`。
  Rationale: 新建本地影子文件和聚合视图应在同一个用户选择的目录中，避免 vault 根目录产生额外文件。

## Risks / Trade-offs

- `lark-cli` 不可用会影响创建文档和读取标题。Mitigation: 暴露 CLI 路径设置，并在失败时用 Notice 告知用户。
- WebView 行为依赖 Obsidian Desktop。Mitigation: manifest 标记 `isDesktopOnly`。
- 远端标题可能与已有文件冲突。Mitigation: 使用递增索引后缀生成可用文件名。

## Migration Plan

无需迁移。插件尚未发布，新的插件 ID、默认目录和 Base 文件名直接作为当前基线。

## Open Questions

- 是否要在未来版本中将 Front matter 字段从 `feishu_*` 重命名为 `lark_*`。
- 是否要支持将远端文档正文导出或缓存到本地 Markdown。
