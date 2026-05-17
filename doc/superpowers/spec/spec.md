# Obsidian Feishu Plugin — Functional Specification

> **Status:** Draft  
> **Date:** 2026-05-17  
> **Scope:** Core feature set — create Feishu docs from Obsidian, bidirectional sync, Base integration

---

## 1. Overview

This plugin bridges Obsidian and Feishu (Lark) by letting users create Feishu documents directly from Obsidian, view them inline, and keep note metadata in sync. All Feishu API interactions are delegated to the Lark CLI, which the user must pre-install and authenticate.

Because we rely on `child_process` to spawn Lark CLI, the plugin is **desktop-only**.

---

## 2. User Workflow

### 2.1 Primary Flow — Create a Feishu Document

1. User opens the Command Palette and runs **"Create Feishu document"** (or clicks the ribbon icon).
2. A modal appears asking for the **document title** (required) and optional **initial content**.
3. Plugin calls `lark-cli docs +create --api-version v2 --content '<title>...</title>'`.
4. On success, plugin receives the new document's `token`, `url`, and resolved `title`.
5. Plugin creates a new markdown note in the vault at a configurable folder (default: `Feishu/`):
   - Filename: `<title>.md`
   - Front matter:
     ```yaml
     ---
     feishu_doc_id: <doc_token>
     feishu_url: <url>
     feishu_title: <title>
     ---
     ```
6. Plugin opens the newly created note and, if `autoOpenFeishuView` is enabled, opens the Feishu document preview in the right sidebar.

### 2.2 Secondary Flow — Open Existing Association

1. User opens a note that already has `feishu_doc_id` in front matter.
2. Plugin detects the association via the indexer.
3. If `autoOpenFeishuView` is enabled, the Feishu document preview opens automatically in the right sidebar.
4. User can also manually trigger **"Open Feishu document for current note"** from the command palette.

### 2.3 Tertiary Flow — Title Sync

1. When a Feishu-associated note is opened (or on a background interval), plugin fetches the current Feishu document title via `lark-cli docs +fetch --api-version v2 --doc <token>`.
2. If the title differs from `feishu_title` in front matter:
   - Update front matter `feishu_title`.
   - Optionally rename the Obsidian note file to match (if `syncTitleToFilename` is enabled).
3. If the title in Feishu was changed from within Feishu, the next open/interval catches it.

### 2.4 Management Flow — Base View

1. Plugin maintains a `.base` file (`Feishu Documents.base`) in the vault root.
2. The Base selects all notes with `feishu_doc_id != ""` and displays them in a table view.
3. Columns: Obsidian filename, Feishu title, Feishu URL, last modified time.
4. This replaces the custom `FeishuIndexPanel` with Obsidian's native Base UI.

---

## 3. Functional Requirements

### 3.1 FR-1: Create Feishu Document

- **Trigger:** Command palette command or ribbon icon.
- **Input:** Document title (required, 1-100 chars). Optional initial content.
- **Action:** Invoke Lark CLI `docs +create`.
- **Output:** New vault note with front matter linking to the Feishu doc.
- **Error Handling:** If Lark CLI fails (not installed, not authenticated, network error), show a `Notice` with the error message and do not create the note.

### 3.2 FR-2: Inline Document Preview

- **Trigger:** Auto (on file open, if enabled) or manual command.
- **UI:** Custom `ItemView` (`FeishuDocView`) in the right sidebar.
- **Rendering:** `iframe` with `src` set to the Feishu document URL.
- **Sandbox:** `allow-scripts allow-same-origin allow-forms allow-popups`.
- **Mobile:** Desktop-only plugin, but iframe works uniformly.

### 3.3 FR-3: Title Synchronization

- **Trigger:** On file-open event, and optionally via a background interval.
- **Fetch:** `lark-cli docs +fetch --api-version v2 --doc <token> --detail title`.
- **Update:** If title changed, rewrite front matter. If `syncTitleToFilename` is true, also rename the file via `Vault.rename()`.
- **Conflict:** If a file with the new name already exists, append a numeric suffix (e.g., `Title (1).md`).

### 3.4 FR-4: Base Integration

- **File:** `Feishu Documents.base` in vault root.
- **Auto-creation:** If missing, plugin creates it on first load.
- **Content:** YAML defining a table view over notes with `feishu_doc_id`.
- **No custom panel:** Remove `FeishuIndexPanel`; Base is the canonical index.

### 3.5 FR-5: Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `larkCliPath` | string | `"lark-cli"` | Path to Lark CLI executable |
| `defaultNoteFolder` | string | `"Feishu"` | Vault folder for new notes |
| `autoOpenFeishuView` | boolean | `true` | Auto-open preview on file open |
| `syncTitle` | boolean | `true` | Enable title sync |
| `syncTitleToFilename` | boolean | `false` | Rename note file when title changes |
| `syncIntervalMinutes` | number | `0` | Background sync interval (0 = disabled) |
| `noteTemplate` | string | `""` | Optional template file for new notes |

### 3.6 FR-6: Note Template

- If `noteTemplate` is set and the template file exists, new notes are created by appending front matter to the template content.
- If not set, new notes contain only front matter.

---

## 4. Data Model

### 4.1 Front Matter Schema

```typescript
interface FeishuFrontMatter {
  feishu_doc_id: string;   // Feishu document token
  feishu_url: string;      // Canonical Feishu URL
  feishu_title?: string;   // Cached title (may be stale)
}
```

### 4.2 Plugin Settings Schema

```typescript
interface ObsidianFeishuSettings {
  larkCliPath: string;
  defaultNoteFolder: string;
  autoOpenFeishuView: boolean;
  syncTitle: boolean;
  syncTitleToFilename: boolean;
  syncIntervalMinutes: number;
  noteTemplate: string;
}
```

### 4.3 Base Schema

```yaml
# Feishu Documents.base
filters: 'feishu_doc_id != ""'

properties:
  feishu_title:
    displayName: "Feishu Title"
  feishu_url:
    displayName: "URL"

formulas:
  doc_url: 'link(feishu_url, feishu_title)'

views:
  - type: table
    name: "All Documents"
    order:
      - file.name
      - feishu_title
      - feishu_url
      - file.mtime
```

---

## 5. Technical Architecture

### 5.1 Module Map

```
src/
  main.ts                 # Plugin lifecycle, command registration
  settings.ts             # Settings interface, tab UI
  types.ts                # Shared types, URL parsing helpers
  lark-cli.ts             # Lark CLI process wrapper, JSON parsing
  doc-creator.ts          # Orchestrates: create Feishu doc → create Obsidian note
  title-sync.ts           # Fetches Feishu title, updates front matter/filename
  feishu-view.ts          # ItemView for iframe preview
  base-manager.ts         # Creates/updates Feishu Documents.base
```

### 5.2 Lark CLI Interface

All calls go through `lark-cli.ts`:

```typescript
interface LarkCliClient {
  createDocument(title: string, content?: string): Promise<FeishuDocInfo>;
  getDocumentTitle(docToken: string): Promise<string>;
}
```

Implementation uses `child_process.spawn` with safe argument passing. Output is parsed as JSON. Errors are caught and surfaced as `Notice` messages.

### 5.3 File Operations

- **Create note:** `Vault.create(normalizePath(folder + "/" + title + ".md"), content)`
- **Update front matter:** Read full content, parse YAML, rewrite, `Vault.modify()`
- **Rename file:** `Vault.rename(file, newPath)`

---

## 6. Error Handling

| Error | User Impact | Recovery |
|-------|-------------|----------|
| Lark CLI not found | Notice: "Lark CLI not found at ..." | User fixes `larkCliPath` setting |
| Lark auth expired | Notice: "Authentication failed..." | User runs `lark auth login` |
| Network error | Notice with stderr | Retry on next trigger |
| Filename collision | Append `(1)`, `(2)`, etc. | Automatic |
| Template file missing | Notice, fall back to empty note | User fixes `noteTemplate` |

---

## 7. Non-Goals (YAGNI)

- Bidirectional content sync (Feishu ↔ Obsidian body text)
- Multi-Feishu-account support
- Offline queue for pending operations
- Custom CSS themes for the preview iframe
- Mobile support (blocked by `child_process` requirement)
- Real-time WebSocket sync

---

## 8. Testing Strategy

- **Manual:** Create doc → verify note created → verify preview opens → change title in Feishu → verify sync.
- **Edge cases:** Special chars in title, very long titles, missing CLI, auth failure, filename collision.
- **Regression:** Ensure existing "Add association" flow still works for manually linking existing docs.
