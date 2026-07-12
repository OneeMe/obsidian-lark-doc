# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning.

## [Unreleased]

## [1.1.0] - 2026-07-12

### Added

- Added a configurable shortcut forwarding allowlist so selected shortcuts work when focus is inside a Lark / Feishu WebView. The default `Mod+W` shortcut closes the current app tab.
- Added settings controls to record, remove, clear, and restore forwarded shortcuts.
- Added a macOS end-to-end check that verifies shortcut forwarding in a real Obsidian session.

## [1.0.8] - 2026-07-03

### Fixed

- Raised the declared minimum app version to match the Obsidian APIs used by the plugin.

## [1.0.7] - 2026-06-26

### Fixed

- Read linked Lark / Feishu document and Base titles with user identity so accessible documents do not fail through bot-only permissions.

## [1.0.6] - 2026-05-30

### Changed

- Renamed the user-visible plugin brand from `Lark Doc` to `Lark Wiki` while keeping the plugin ID as `lark-doc`.
- Updated README, release documentation, UI messages, and current project requirements to use the `Lark Wiki` display name.

## [1.0.5] - 2026-05-24

### Added

- Added support for linked Lark / Feishu Base URLs, preserving selected `table` and `view` parameters.
- Added a Doc/Base selector to `Create Lark document`, allowing new Lark / Feishu Bases to be created and linked from the same flow.

### Fixed

- Reopening an already open `.lark.md` file now reveals the existing WebView without refreshing it.

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
