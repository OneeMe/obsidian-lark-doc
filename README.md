# Obsidian Lark

![Obsidian Lark header](assets/obsidian-lark-header.svg)

Obsidian Lark connects local Obsidian notes with Lark / Feishu cloud documents. It keeps a lightweight `.lark.md` file in your vault, opens the linked document in an Obsidian WebView, and can keep the local filename aligned with the remote document title.

[中文说明](#中文说明) | [English](#english)

## 中文说明

### 功能

- 打开 `.lark.md` 文件时，自动在 Obsidian 内打开对应的 Lark / 飞书文档预览。
- 同一个 `.lark.md` 文件重复点击时复用已有标签页，行为接近普通 Markdown 文件。
- 通过 `Add linked Lark document` 输入文档 URL，在默认笔记目录中创建对应的 `.lark.md` 文件。
- 通过 `Create Lark document` 输入标题，创建远端 Lark / 飞书文档并在本地生成关联文件。
- 从 Lark / 飞书同步文档标题，并可把标题同步到 Obsidian 文件名。
- 文件名冲突时自动追加索引后缀，例如 `Product Spec 1.lark.md`。
- 在默认笔记目录中维护 `Lark Documents.base`，用于集中查看关联文档。
- 支持插件界面语言配置：自动、English、简体中文。

### 使用前提

- Obsidian Desktop。插件使用 WebView，因此是桌面端插件。
- 已安装并登录可用的 `lark-cli`。
- Lark / 飞书文档 URL 需要是 `feishu.cn` 或 `larksuite.com` 的 `docs`、`docx`、`wiki` 链接。

### 使用方式

1. 在插件设置中配置 `Lark CLI path`，默认使用 `lark-cli`。
2. 设置 `Default note folder`，默认是 `Lark`。新建的关联文件和 `Lark Documents.base` 都会放在这里。
3. 执行命令 `Add linked Lark document`，输入已有 Lark / 飞书文档 URL。
4. 插件会读取远端标题，并创建 `标题.lark.md`。
5. 在 Obsidian 中打开该 `.lark.md` 文件，即可在插件视图中查看远端文档。
6. 点击视图顶部的同步按钮，可以主动同步远端标题和本地文件名。

### 本地文件格式

`.lark.md` 文件只保存关联元数据和一个简短说明，真实内容仍保存在 Lark / 飞书文档中。插件会使用 Front matter 记录文档 ID、URL 和缓存标题。

### 开发

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

构建后的 Obsidian 插件文件为：

- `manifest.json`
- `main.js`
- `styles.css`

## English

### Features

- Automatically opens the linked Lark / Feishu document when a `.lark.md` file is opened in Obsidian.
- Reuses the existing tab for the same `.lark.md` file, matching normal Markdown file behavior.
- Creates a local `.lark.md` file from an existing document URL through `Add linked Lark document`.
- Creates a remote Lark / Feishu document and a local linked note through `Create Lark document`.
- Syncs document titles from Lark / Feishu and can rename the local Obsidian file.
- Appends an indexed suffix when a synced filename would collide, such as `Product Spec 1.lark.md`.
- Maintains `Lark Documents.base` in the default note folder for browsing linked documents.
- Supports configurable UI language: Auto, English, and Simplified Chinese.

### Requirements

- Obsidian Desktop. This plugin uses WebView and is desktop-only.
- A working authenticated `lark-cli` installation.
- Supported document URLs are `docs`, `docx`, and `wiki` links on `feishu.cn` or `larksuite.com`.

### Usage

1. Configure `Lark CLI path` in plugin settings. The default is `lark-cli`.
2. Configure `Default note folder`. The default is `Lark`; linked notes and `Lark Documents.base` are created there.
3. Run `Add linked Lark document` and paste an existing Lark / Feishu document URL.
4. The plugin fetches the remote title and creates `Title.lark.md`.
5. Open the `.lark.md` file in Obsidian to view the remote document inside the plugin view.
6. Use the sync button in the view header to manually sync the remote title and local filename.

### Local File Format

`.lark.md` files are local proxy notes. They store only metadata and a short explanation; the full content stays in Lark / Feishu. The plugin uses Front matter for the document ID, URL, and cached title.

### Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

Release assets for Obsidian:

- `manifest.json`
- `main.js`
- `styles.css`
