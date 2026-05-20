## ADDED Requirements

### Requirement: 插件身份与运行环境
系统 SHALL 以 Obsidian Lark 作为插件名称和用户可见品牌，并 SHALL 仅支持 Obsidian Desktop 环境。

#### Scenario: 用户查看插件信息
- **WHEN** 用户在 Obsidian 插件列表或 manifest 中查看插件
- **THEN** 插件名称显示为 `Obsidian Lark`
- **AND** 插件 ID 为 `obsidian-lark`
- **AND** 插件标记为 desktop-only

### Requirement: Lark 影子文件格式
系统 SHALL 使用 `.lark.md` 文件作为 Lark / 飞书文档的本地影子文件，并 SHALL 通过 Front matter 保存文档 ID、URL 和缓存标题。

#### Scenario: 创建本地影子文件
- **WHEN** 系统为远端文档创建本地文件
- **THEN** 文件扩展名 SHALL 为 `.lark.md`
- **AND** Front matter SHALL 包含远端文档 ID
- **AND** Front matter SHALL 包含远端文档 URL
- **AND** Front matter SHALL 包含远端文档标题

### Requirement: 自动打开 Lark WebView
系统 SHALL 在用户打开已关联的 `.lark.md` 文件时自动打开对应 Lark / 飞书文档 WebView。

#### Scenario: 打开已关联文件
- **WHEN** 用户在 Obsidian 中打开包含有效 Lark / 飞书 Front matter 的 `.lark.md` 文件
- **THEN** 系统 SHALL 打开插件 WebView
- **AND** WebView SHALL 加载 Front matter 中记录的文档 URL

### Requirement: 复用同一文件的打开标签
系统 SHALL 对同一个 `.lark.md` 文件复用既有标签页，而不是每次点击都打开新的 WebView 标签。

#### Scenario: 重复点击同一文件
- **WHEN** 用户多次打开同一个 `.lark.md` 文件
- **THEN** 系统 SHALL 定位并复用该文件已有的 Lark WebView 标签页
- **AND** 不 SHALL 为同一源文件创建重复的插件视图

### Requirement: 添加已有 Lark 文档
系统 SHALL 提供 `Add linked Lark document` 能力，让用户只输入 Lark / 飞书文档 URL，并在本地创建对应 `.lark.md` 文件。

#### Scenario: 用户添加已有文档链接
- **WHEN** 用户执行 `Add linked Lark document`
- **AND** 输入有效的 `feishu.cn` 或 `larksuite.com` 文档 URL
- **THEN** 系统 SHALL 通过 `lark-cli` 获取远端文档标题
- **AND** 系统 SHALL 在默认笔记目录创建以远端标题命名的 `.lark.md` 文件
- **AND** 系统 SHALL 打开新创建的本地文件

### Requirement: 新建 Lark 文档
系统 SHALL 提供 `Create Lark document` 能力，让用户输入标题后创建远端 Lark / 飞书文档，并在本地创建关联 `.lark.md` 文件。

#### Scenario: 用户创建新文档
- **WHEN** 用户执行 `Create Lark document`
- **AND** 输入文档标题
- **THEN** 系统 SHALL 通过 `lark-cli` 创建远端文档
- **AND** 系统 SHALL 在默认笔记目录创建对应 `.lark.md` 文件
- **AND** 本地文件 SHALL 关联新创建的远端文档 URL

### Requirement: 默认笔记目录
系统 SHALL 使用 `Default note folder` 决定新建 Lark 影子文件和 Lark Base 文件的位置，默认值 SHALL 为 `Lark`。

#### Scenario: 未配置默认目录
- **WHEN** 用户未修改默认笔记目录
- **THEN** 新建 `.lark.md` 文件 SHALL 位于 `Lark` 目录
- **AND** `Lark Documents.base` SHALL 位于 `Lark` 目录

#### Scenario: 用户配置默认目录
- **WHEN** 用户将 `Default note folder` 设置为自定义目录
- **THEN** 新建 `.lark.md` 文件 SHALL 位于该目录
- **AND** `Lark Documents.base` SHALL 位于该目录

### Requirement: Lark Documents Base
系统 SHALL 在默认笔记目录中维护 `Lark Documents.base`，用于汇总关联文档。

#### Scenario: 插件加载
- **WHEN** 插件加载
- **THEN** 系统 SHALL 确保默认笔记目录存在
- **AND** 系统 SHALL 确保 `Lark Documents.base` 存在
- **AND** Base SHALL 包含文档标题、URL 和文件元数据相关列

### Requirement: 标题同步
系统 SHALL 支持从远端 Lark / 飞书文档同步标题到本地 Front matter。

#### Scenario: 打开文件时同步标题
- **WHEN** 用户打开已关联 `.lark.md` 文件
- **AND** 标题同步设置开启
- **THEN** 系统 SHALL 通过 `lark-cli` 获取远端标题
- **AND** 系统 SHALL 更新本地 Front matter 中的缓存标题

### Requirement: 文件名同步
系统 SHALL 在文件名同步设置开启时，把远端标题同步为本地 `.lark.md` 文件名。

#### Scenario: 远端标题变化
- **WHEN** 系统获取到新的远端标题
- **AND** 文件名同步设置开启
- **THEN** 系统 SHALL 将本地文件重命名为远端标题对应的 `.lark.md` 文件名

#### Scenario: 文件名冲突
- **WHEN** 目标文件名已经存在
- **THEN** 系统 SHALL 为目标文件名追加递增索引后缀
- **AND** 系统 SHALL 使用第一个不存在的候选文件名

### Requirement: 手动同步入口
系统 SHALL 在 Lark WebView 顶部提供同步按钮，用于主动同步标题和文件名。

#### Scenario: 用户点击同步按钮
- **WHEN** 用户在 Lark WebView 顶部点击同步按钮
- **THEN** 系统 SHALL 对当前关联的源文件执行标题同步
- **AND** 若文件名同步设置开启，系统 SHALL 同步本地文件名

### Requirement: 隐藏默认浏览器导航按钮
系统 SHALL 在 Lark WebView 顶部隐藏默认返回和前进按钮，并使用同步按钮作为主要操作。

#### Scenario: Lark WebView 打开
- **WHEN** Lark WebView 渲染
- **THEN** 用户 SHALL 看不到默认返回按钮
- **AND** 用户 SHALL 看不到默认前进按钮
- **AND** 用户 SHALL 能看到同步按钮

### Requirement: 多语言配置
系统 SHALL 支持插件界面语言配置，并 SHALL 至少支持自动、English 和简体中文。

#### Scenario: 用户选择简体中文
- **WHEN** 用户将语言设置为简体中文
- **THEN** 插件设置项、命令名称、弹窗文案和通知 SHALL 使用简体中文

#### Scenario: 用户选择 English
- **WHEN** 用户将语言设置为 English
- **THEN** 插件设置项、命令名称、弹窗文案和通知 SHALL 使用英文

### Requirement: 不兼容未发布旧数据
系统 SHALL 以当前 Obsidian Lark 行为作为基线，不 SHALL 为尚未发布的旧插件 ID、旧默认目录或旧 Base 文件名实现迁移兼容逻辑。

#### Scenario: Vault 中存在旧 Base 文件名
- **WHEN** Vault 中存在 `Feishu Documents.base`
- **AND** 插件加载
- **THEN** 系统 SHALL 创建或维护 `Lark Documents.base`
- **AND** 系统不 SHALL 迁移 `Feishu Documents.base`
