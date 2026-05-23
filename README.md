# Lark Doc

![Lark Doc header](assets/obsidian-lark-doc-header.png)

Lark Doc connects local Obsidian notes with Lark / Feishu cloud documents. It keeps a lightweight `.lark.md` file in your vault, opens the linked document in an Obsidian WebView, and can keep the local filename aligned with the remote document title.

[中文说明](README-CN.md)

## Features

- Automatically opens the linked Lark / Feishu document when a `.lark.md` file is opened in Obsidian.
- Reuses the existing tab for the same `.lark.md` file, matching normal Markdown file behavior.
- Creates a local `.lark.md` file from an existing document URL through `Add linked Lark document`.
- Creates a remote Lark / Feishu document and a local linked note through `Create Lark document`.
- Syncs document titles from Lark / Feishu and can rename the local Obsidian file.
- Appends an indexed suffix when a synced filename would collide, such as `Product Spec 1.lark.md`.
- Maintains `Lark Documents.base` in the default note folder for browsing linked documents.
- Supports configurable UI language: Auto, English, and Simplified Chinese.

## Requirements

- Obsidian Desktop. This plugin uses WebView and is desktop-only.
- A working authenticated `lark-cli` installation.
- Supported document URLs are `docs`, `docx`, and `wiki` links on `feishu.cn` or `larksuite.com`.

## Usage

1. Configure `Lark CLI path` in plugin settings. The default is `lark-cli`; use an absolute path if the desktop app cannot find it.
2. Configure `Default note folder`. The default is `Lark`; linked notes and `Lark Documents.base` are created there.
3. Run `Add linked Lark document` and paste an existing Lark / Feishu document URL.
4. The plugin fetches the remote title and creates `Title.lark.md`.
5. Open the `.lark.md` file in Obsidian to view the remote document inside the plugin view.
6. Use the sync button in the view header to manually sync the remote title and local filename.

## Local File Format

`.lark.md` files are local proxy notes. They store only metadata and a short explanation; the full content stays in Lark / Feishu. The plugin uses Front matter for the document ID, URL, and cached title.

## Security and Permissions

- The plugin uses the vault API for note reads, creates, and updates. It does not use Node.js `fs` in runtime plugin code.
- The plugin runs the configured `lark-cli` executable with fixed arguments through `child_process.spawn` and `shell: false` when creating documents or fetching titles.
- Background title sync is disabled by default. If enabled, it enumerates Markdown file paths in the vault to find linked `.lark.md` notes.

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run test:coverage
npm run build
```

Release assets for Obsidian:

- `manifest.json`
- `main.js`
- `styles.css`

See [Release guide](doc/release.md) for the automated release and community submission check workflow.
Changes are tracked in [CHANGELOG.md](CHANGELOG.md).
