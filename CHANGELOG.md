# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning.

## [Unreleased]

## [1.0.4] - 2026-05-23

### Fixed

- Improved the missing `lark-cli` error message with localized, actionable setup guidance.

## [1.0.3] - 2026-05-23

### Added

- Added a preview header action to copy the current Lark / Feishu document link.
- Added README screenshots for the WebView preview and Lark Documents base views.

### Changed

- Renamed generated `.lark.md` metadata and `Lark Documents.base` columns from `feishu_*` to `lark_*`.

### Fixed

- Fixed Lark WebView tabs so Obsidian can keep the linked `.lark.md` file selected in the file explorer.
- Fixed title sync so the sync button writes the remote title back to the actual `.lark.md` file even when Obsidian metadata cache is stale.
- Fixed `lark-cli` launch failures when the configured CLI path needs `node` from the same executable directory.

## [1.0.2] - 2026-05-23

### Changed

- Added GitHub artifact attestations for release assets.
- Removed runtime filesystem probing for `lark-cli`; users can configure an explicit CLI path when needed.
- Tightened release validation and community submission checks for `styles.css` and asset attestations.
- Documented shell execution and optional background vault enumeration behavior for review transparency.

## [1.0.1] - 2026-05-23

### Changed

- Renamed the project package and repository references to `obsidian-lark-doc` while keeping the Obsidian plugin ID as `lark-doc`.
- Replaced the obsolete `obsidian-releases` pull request workflow with a Community directory submission check.

### Fixed

- Removed the redundant word `Obsidian` from the plugin description for Community directory review.

## [1.0.0] - 2026-05-23

### Added

- Initialized the first public Lark Doc release baseline.
- Added the initial Lark Doc plugin experience for linking Obsidian `.lark.md` files to Lark / Feishu cloud documents.
- Added automatic WebView opening for linked `.lark.md` files and tab reuse for repeated opens.
- Added commands to create new Lark / Feishu documents and link existing document URLs.
- Added title synchronization from remote documents to local front matter and filenames, including collision-safe indexed suffixes.
- Added `Lark Documents.base` generation in the configured default note folder.
- Added English, Simplified Chinese, and automatic UI language settings.
- Added automated release workflows for GitHub Releases and official Obsidian community plugin submission.
