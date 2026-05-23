# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning.

## [Unreleased]

### Changed

- Renamed the project package and repository references to `obsidian-lark-doc` while keeping the Obsidian plugin ID as `lark-doc`.

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
