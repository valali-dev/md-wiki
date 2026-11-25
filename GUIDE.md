# GUIDE: Status and next steps

This document is for anyone who continues building the project (including a new Claude session).
Just upload this project and say: "Continue with Step 6 in GUIDE.md." The core wiki is finished and runs on the
home server; Step 6 and the open list below it only contain optional extras.

## CURRENT STATE — updated 2026-11-22 (Steps 1–5 done; Step 4 done except drag-and-drop move)

Everything below the old sections is unchanged; this section is the up-to-date picture on top of it.

### Where things live
- `mdwiki/` is the real project (`server.js`, `public/`, `test/`, `Dockerfile`, `docker-compose.yml`).
- `temp-files/` is scratch only (not part of the app, ignored by git): it currently holds a portable Node.js v22.14.0
  (`temp-files/node/node-v22.14.0-win-x64/node.exe`, zip next to it) plus test logs. Node is NOT installed
  on the Windows development machine and not on PATH — run tests with that binary, e.g.
  `& '...\temp-files\node\node-v22.14.0-win-x64\node.exe' mdwiki\test\render.js`
- `GUIDE.md` and `README.md` exist only in the repo root. There is no copy in `mdwiki/`; do not create one.
- There is no offline demo (`demo/`) in this repository and none is planned. Test the frontend against the real
  server (see "Running locally" and "First test on the server").

### What was ADDED in the 2026-11-21 session (Step 2: CodeMirror 6 editor; Step 3: Image upload; Step 5: Download backup button)
- **`mdwiki/tools/fetch-cm6.mjs`** (new): downloads CodeMirror 6 and all dependencies as ES modules from
  jsDelivr (`+esm` bundles), rewrites every CDN import to a flat local file name, saves the licences, and
  verifies the result (no external URLs left, every file passes `node --check`). Re-run with
  `node tools/fetch-cm6.mjs` from `mdwiki/` if the editor libs should be refreshed.
- **`mdwiki/public/vendor/cm6/`** (new): 21 vendored packages, ~460 KB total, fully offline.
  Key files: `@codemirror__state.js`, `@codemirror__view.js`, `@codemirror__commands.js`,
  `@codemirror__language.js`, `@codemirror__lang-markdown.js`, `@lezer__markdown.js`, `@lezer__highlight.js`,
  plus small deps (`style-mod`, `crelt`, `w3c-keyname`, `@marijn__find-cluster-break`, …).
  Note the flat naming (`@codemirror__view.js`, slash replaced by `__`) so `./name.js` imports resolve from
  every file. `VERSIONS.txt` lists exact versions, `LICENSES/` the licences (all MIT/BSD-style).
  Verified: the whole import graph loads in Node 22 (`import cm-editor.js` → exports `createEditor`).
- **`mdwiki/public/cm-editor.js`** (new): the glue module. Exports
  `createEditor(host, { value, onUpdate, onCommand })` → `{ view, getValue, setValue, focus, setDisabled }`.
  Inside: Markdown language (`markdown({ base: markdownLanguage })`), a `HighlightStyle` that uses only the
  CSS variables from `style.css` (so light/dark both work; headings use `--head-text`, NOT `--head`, which is the
  background colour of the top bar), `bracketMatching()`, `history()`,
  `EditorView.lineWrapping`, `highlightActiveLine()`, an editable `Compartment`, and a keymap routing
  **Mod-b / Mod-i / Mod-k / Mod-s** to `onCommand(name, view)` (return `true` = handled) plus `indentWithTab`.
- **`mdwiki/public/index.html`** (changed): added `<div id="cmHost" hidden></div>` inside `#panes`,
  directly before the existing `<textarea id="editor">` (the textarea stays as fallback).
  **Step 5:** added "Download backup" button in `#acctMenu`.
- **`mdwiki/public/app.js`** (changed): wired the CM6 editor + image upload:
  - Lazy-loads via `import("./cm-editor.js").catch(() => null)`; keeps `<textarea>` as fallback.
  - Helpers `editorValue()`, `setEditorValue()`, `setEditorDisabled()`, `editorFocus()` used in
    `openEditor()`, `save()`, `setMode()`, input handler (live preview via `onUpdate`).
  - Ctrl+B / Ctrl+I / Ctrl+K for CM6 via `onCommand` (bold/italic/link wrap), and for textarea via keydown.
  - Global Ctrl+S guarded with `if (e.defaultPrevented) return;` to avoid double-save.
  - Shows `#cmHost` / hides `#editor` when CM6 active, reverse when fallback.
  - **Step 3:** `uploadFiles(files)` — validates allowed types (png, jpg, jpeg, gif, webp, svg, pdf),
    generates names for pasted screenshots (`pasted-YYYYMMDD-HHMMSS.png`), POSTs to `/api/upload`,
    shows "Uploading..." status, handles errors via `uiAlert`, returns markdown lines.
  - **Step 3:** `insertMarkdownAtCursor(markdown)` — inserts at cursor in both CM6 (`view.dispatch`)
    and textarea (selectionStart + `input` event), marks dirty, updates preview.
  - **Step 3:** `paste` / `drop` / `dragover` handlers on `#cmHost` and `#editor`, registered once via
    `registerEditorFileEvents()` in `showApp()`; survive CM6 destroy/create cycles.
- **`mdwiki/public/style.css`** (changed): styles for `#cmHost` and `.cm-*` using only CSS variables (light/dark, square corners).
- **`mdwiki/test/cm6-vendor.js`** (new): verifies no external CDN references in vendor imports,
  and that `cm-editor.js` exports `createEditor` function in Node.
- **`mdwiki/test/app-lint.js`** (new): fails if `app.js` contains `$("#...")` (in `app.js` `$` is
  `getElementById`, so a `#` never finds the element).

### What was ADDED for Step 4 (2026-11-21/22)
- **Collapsible tree** (`app.js`): `collapsedFolders` (list of paths, kept in `localStorage`), `toggleCollapsed()`,
  `ensurePathExpanded(path)`, toggle `<button data-toggle>` with the `#i-chevron` icon. `ensurePathExpanded()` is
  called in `go()` BEFORE `showPage()`/`showFolder()`, not in `renderNav()`: otherwise the tree would be drawn
  before it is expanded, and the user could not collapse the folder that contains the current page.
- **Autosave** (`app.js`): toggle `#autosaveToggle` in the editor bar, off by default, remembered in `localStorage`,
  3 s debounce, goes through `save({ autosave: true })`. Reason for "off by default": there is no version history.
- **Page links** (`app.js`): `wikiLinkExt` (marked inline extension) and `resolveWikiLink()`; see "Wiki Link Syntax".
- **Browser back/forward**: a `hashchange` listener calls `go()` unless the page is already shown.
- Lesson from the first browser test: a `const` that is reassigned (`ensurePathExpanded()`) is a runtime error that no
  Node test catches. Test every frontend change in a real browser.

### Step 2 checklist — current state
- DONE: CM6 vendored (`public/vendor/cm6/`), `tools/fetch-cm6.mjs`, `public/cm-editor.js`, `#cmHost` in `index.html`.
- DONE: `public/app.js` lazy-load + helpers + Ctrl+B/I/K + Ctrl+S de-dup.
- DONE: `public/style.css` styles for `#cmHost`/`.cm-*`.
- DONE: `test/cm6-vendor.js` created and passing.
- DONE: `test/app-lint.js` created and passing (checks for `$("#...")` bug).
- FIXED: `app.js` - replaced all `$("#...")` with `$("...")` (11 occurrences).
- FIXED: `openEditor()` - removed `pageContent = val` from CM6 onUpdate callback (pageContent now only changes in save()).
- FIXED: `cmWrapSelection` and `wrapSelection` rewritten for correct selection behavior:
  - bold/italic with selected text: wraps it and keeps inner text selected
  - empty selection: inserts prefix+suffix and puts cursor between them
  - link: inserts `[selected](url)` and selects "url" (empty: `[](url)` with "url" selected)
  - CM6 uses `state.changeByRange` for correct multi-range handling
- FIXED (2026-11-22): headings in the editor were almost invisible in the dark theme; they now use `--head-text`.
- DONE: all Node tests pass (`test/render.js`, `test/cm6-vendor.js`, `test/app-lint.js`); `test/smoke.js` has exactly
  2 failures on Windows only (see below).

### Test/verification status right now
- `node test/render.js` (Markdown renderer, XSS, wiki links; it runs the real `resolveWikiLink` with a test index): **all passed**.
- `node test/cm6-vendor.js` (CM6 vendor imports): **all passed**.
- `node test/app-lint.js` (app.js lint for `$("#...")`): **all passed**.
- `node test/smoke.js` (server API + security): **39 passed, 2 failed on Windows**. Both failures are in the section
  "Sessions + restart": the test stops the server with `srv.kill()`, which is a hard kill on Windows (no SIGTERM,
  so the graceful shutdown that writes `.sessions.json` never runs). Expected on Windows, ignore them. Session
  persistence was confirmed in the Docker test (`docker compose restart` keeps you logged in).
- Browser tests on the home server (Docker), 2026-11-21 and 2026-11-22: login, create shelf/book/page, editor with
  live preview, Ctrl+S, dialogs, search, rename/move/delete, theme switch, image paste and drag-and-drop,
  Download backup, collapsible tree, autosave, `[[links]]` (click, back/forward), unsaved-changes prompt.
  Mobile layout is read-only on purpose.
- A nightly cron backup of `data/` runs on the home server (see Step 5).

## Goal

Similar to BookStack, but: just me as the user, Markdown only (GitHub Flavored Markdown), no database,
files on disk. Access only on the home network and via Tailscale, so no HTTPS of its own is needed.

## What is done

- **Backend (`server.js`)**, no dependencies, logic tested with curl:
  - Password login (`POST /api/login`), session cookie (HttpOnly, SameSite=Strict), brake on failed attempts (1 s, 2 s, 4 s … max. 30 s, global)
  - Read/write pages (`GET/PUT /api/page`), atomic writes (temp file + rename)
  - Create, rename/move and delete folders
  - Tree (`GET /api/tree`), full-text search (`GET /api/search?q=`, simple file scan, enough for private amounts of data)
  - Image upload (`POST /api/upload?name=x.png`, raw data in the body) to `data/assets/`, served at `/files/assets/...`
  - Backup export (`GET /api/export`): the data folder as `.tar.gz`, without `.sessions.json`
  - Protection against path tricks (`..`, dotfiles), `.md` pages only, uploads only for certain image types and PDF
- **Docker**: `Dockerfile` and `docker-compose.yml` (volume `./data:/data`, ports `192.168.1.100:3100:3000` and `100.100.53.111:3100:3000`, password from `.env`).
- **Frontend (`public/`)**:
  - Login, top bar with search and the views Shelves / Books / Chapters, account menu (theme switch, Download backup, log out)
  - Shelves → Books → Chapters → Pages structure, breadcrumbs, side navigation with collapsible folders, "Details" and "Actions" panels, cards
  - Editor (CodeMirror 6, textarea as fallback) with two modes, "Markdown" and "Markdown + Preview" (the choice is remembered), save with Ctrl+S, optional autosave, unsaved-changes warning
  - Images and PDFs via paste and drag-and-drop into the editor
  - New page / new folder / rename or move / delete, full-text search
  - Links between pages with `[[Page name]]`
  - **Markdown renderer = `marked`** (GFM), served locally from `public/vendor/marked.umd.js` (works offline). `md()` in `app.js` is a thin wrapper:
    raw HTML in the text is **escaped, not rendered**, and link/image addresses must pass `safeUrl()` (only http, https, mailto, tel, relative paths, `#anchors`).
    If the library fails to load, the page shows the plain text instead of breaking. Tested with `node test/render.js` (features + XSS attempts).
  - Dark/light theme (default dark), remembered in the browser
  - The current page is kept in the URL hash (`#Technik/Homelab/Docker.md`), so reloading returns to it
  - **Square design**: no rounded corners anywhere, colors unchanged (see "UI conventions")
  - **Own dialogs** instead of the browser's pop-ups for new page/folder, rename, delete and error messages (see "UI conventions")

## What is NOT tested

- **Ctrl+B / Ctrl+I / Ctrl+K** in the CM6 editor and the **textarea fallback** (when `cm-editor.js` fails to load) have not been confirmed in a browser yet.
- Uploading **PDF** and **SVG** files has not been tested in a browser.
- The login brake and real sessions are covered by `test/smoke.js` and the Docker test, not by an automatic browser test.
- The **Docker image was built and tested on the home server (2026-11-21)**: login, create shelf/book/page, editor, restart keeps sessions and data, image paste and drag-and-drop, backup button. The container runs as user `node` (UID 1000); the data folder must be writable by UID 1000 (`sudo chown 1000:1000 data`). Password is read from `.env` (copy `.env.example` to `.env` and `chmod 600 .env`). Ports are bound to specific interfaces (see docker-compose.yml), not all interfaces.

## UI conventions (read this before touching the frontend)

### Structure: Shelves, Books, Chapters, Pages

There is **no extra metadata**. The type of a folder comes only from its depth on disk:

| Depth | Name | Example in `data/` |
|---|---|---|
| 1 | Shelf | `Technik/` |
| 2 | Book | `Technik/Homelab/` |
| 3 and deeper | Chapter | `Technik/Homelab/Server/` |
| `.md` file anywhere | Page | `Technik/Homelab/Server/Docker.md` |

This is computed in `buildIndex()` in `app.js`. Each type has its own color (`--c-shelf`, `--c-book`, `--c-chapter`, `--c-page`). The "New <kind>" button in the actions panel and the new-folder prompt use the depth of the current folder; depth 3 and deeper is always "chapter".

### Colors and theme

All colors are CSS variables at the top of `style.css`: one block for light (`:root`), one for dark (`[data-theme="dark"]`).
Use the variables, never hard-coded colors, so both themes keep working. The accent color is `--accent`, danger is `--danger`.
`--head` is the background of the top bar (a dark navy in the dark theme), it is NOT a text color; use `--head-text` for text.

### Square design

Rounded corners are switched off by **one global rule** at the end of `style.css`:

```css
*, *::before, *::after { border-radius: 0 !important; }
```

Do not add `border-radius` to new components, it would have no effect. Shadows are hard and offset (`4px 4px 0 …`), not soft.
To bring back round corners, remove that one rule.

### Own dialogs (never use `prompt`, `confirm` or `alert`)

The browser's built-in pop-ups look different on every system and cannot be styled, so `app.js` has its own versions.
They live at the top of `app.js`, their styles (`.modal`, `.modal-back`, …) at the end of `style.css`.

| Instead of | Use | Returns |
|---|---|---|
| `prompt(text, value)` | `await uiPrompt(text, value)` | the entered text, or `null` if cancelled |
| `confirm(text)` | `await uiConfirm(text)` | `true` / `false` |
| `alert(text)` | `await uiAlert(text)` | nothing (closes with OK) |

Rules:
- They are **asynchronous**. The calling function must be `async`, and the call needs `await`. A native `confirm()` blocked the code, these do not.
- Enter confirms, Esc or a click next to the dialog cancels.
- A message containing the word "delete" gets a red "Delete" button.
- The text is inserted as plain text, never as HTML.
- The only native pop-up that remains is the browser's "leave this page?" warning (`beforeunload`). Browsers do not allow replacing it.

## Running locally (without Docker)

Run from `mdwiki/`. Node is not on PATH on the Windows machine, use the portable one (see "Where things live").
In PowerShell:

```powershell
$env:APP_PASSWORD = "test"
$env:DATA_DIR = ".\data"
& '...\temp-files\node\node-v22.14.0-win-x64\node.exe' server.js
```

The console prints `mdwiki running on port ...`; open that address in the browser (`http://localhost:<port>`).
`data/` is ignored by git.

## First test on the server (10 minutes)

1. Run the README steps (copy `.env.example` to `.env`, set password, `chmod 600 .env`, create data folder with `chown 1000:1000`, `docker compose up -d --build`), open `http://SERVER-IP:3100` in the browser.
2. Test login (wrong password, then the right one).
3. Create a shelf, a book and a page, write text with `**bold**`, Ctrl+S, reload the page.
4. Check that `data/Shelf/Book/Page.md` really exists on the server.
5. Try rename/move and delete: the own dialogs must appear, not the browser's.
6. Restart the container (`docker compose restart`): pages must still be there and you stay logged in (sessions are stored in `data/.sessions.json`).

## Operating the server

- **Update after code changes:** `git pull` in the clone of the repo on the server, then `docker compose up -d --build` in
  `mdwiki/`. A plain `docker compose restart` is NOT enough, because `public/` is baked into the image. Data and sessions
  survive a rebuild. After the update press Ctrl+F5 in the browser (cached JS/CSS).
- **Refresh the base image** (security updates of `node:22-alpine`) from time to time: `docker compose build --pull`, then `docker compose up -d`.
- **Backups:** the "Download backup" button in the account menu, plus a nightly cron job on the server (see Step 5).
  The backup script is NOT part of the repo.

## Next steps

### Step 1: Markdown renderer. DONE (option B, without DOMPurify)
- Switched to **marked** 18.0.10, served locally (`public/vendor/marked.umd.js`, licence next to it). Only `md()` changed.
- DOMPurify was not available offline. Instead the marked renderer escapes every raw HTML token and checks every URL (see `safeUrl()`), which blocks the same attacks.
- Now supported: nested blockquotes and code in lists, autolinks, hard line breaks, escaped characters, table alignment, `_underscore_` emphasis.
- Not supported (marked has no footnotes): footnotes. They are in Step 6 as an optional extra (needs a marked extension).
- If you change `md()`: run `node test/render.js` and keep the "escape first" rule.

### Step 2: Better editor — STATUS 2026-11-22: DONE, browser tested (except Ctrl+B/I/K and the textarea fallback)
- **Completed:** CodeMirror 6 vendored offline in `public/vendor/cm6/` (via `tools/fetch-cm6.mjs`),
  editor glue module `public/cm-editor.js`, `#cmHost` container added to `index.html`.
- **Wired in `app.js`:** lazy `import()` with textarea fallback, editor helpers (`editorValue()`, `setEditorValue()`,
  `setEditorDisabled()`, `editorFocus()`), Ctrl+B/I/K for both CM6 (via `onCommand`) and textarea (keydown),
  Ctrl+S de-dup guard (`e.defaultPrevented`), show `#cmHost`/hide `#editor` when CM6 active.
- **Styles in `style.css`:** `#cmHost` and `.cm-*` using CSS variables (light/dark, square corners).
- **Test:** `test/cm6-vendor.js` verifies no external CDN references and `createEditor` export.
- **Browser test (2026-11-21/22):** CM6 editor loads, syntax highlighting works in light and dark, live preview updates, Ctrl+S saves,
  Markdown functions work. **Not confirmed yet in a browser:** Ctrl+B/I/K and the textarea fallback.

### Step 3: Images via drag-and-drop and paste — STATUS 2026-11-21: DONE, browser tested (PNG)
- **Completed in `app.js`:** `uploadFiles(files)` validates allowed types (png, jpg, jpeg, gif, webp, svg, pdf),
  generates names for pasted screenshots (`pasted-YYYYMMDD-HHMMSS.png`), POSTs to `/api/upload`,
  shows "Uploading..." status, handles errors via `uiAlert`, returns markdown lines.
- **Insert at cursor:** `insertMarkdownAtCursor(markdown)` works for both CM6 (`view.dispatch` with
  `changes` + selection update) and textarea fallback (insert at `selectionStart`, dispatch `input` event).
  Marks page dirty and updates live preview like normal typing.
- **Events:** `paste` / `drop` / `dragover` on `#cmHost` and `#editor`. Only act when files are present;
  normal text paste/drop passes through. `preventDefault()` only for file events. Listeners registered
  ONCE via `registerEditorFileEvents()` in `showApp()`; survive CM6 destroy/create cycles.
- **Browser test (2026-11-21):** pasting a screenshot and dragging a PNG into the CM6 editor, markdown line inserted at the cursor, preview, save and reload, normal text paste still works, a .txt drop shows the "not allowed" popup, files appear in data/assets. NOT tested: PDF, SVG, the textarea fallback.

### Step 4: Convenience — STATUS 2026-11-22: DONE except drag-and-drop move; browser tested on the server
- ✅ **Collapsible tree**: folders (shelf/book/chapter) have a toggle button; state remembered in `localStorage`; the path to the opened page is expanded automatically.
- ✅ **Autosave**: toggle in editor bar (off by default), 3 s debounce, uses existing `save()` path, status shows "Saving…"/"Autosave failed", no retry loop, timer stops on editor close/page switch.
- ⬜ Move pages and folders in the tree via drag-and-drop (optional; moving already works with the rename/move dialog, backend `/api/rename` is done).
- ✅ **Links between pages** (`[[PageName]]` and `[[PageName|Label]]`) — implemented as marked inline extension, resolving against page index, XSS-safe.
- ✅ **Browser back/forward** works through a `hashchange` listener.
- Already done: current page in the URL hash, dark/light toggle.

### Step 5: Export and backup — STATUS 2026-11-21: DONE, browser tested 2026-11-21
- **Completed:** "Download backup" button in the account menu (`#acctMenu`), fetches `GET /api/export`, shows `uiAlert` with the server's error text on error (e.g. 404 "Nothing to export yet"), downloads `.tar.gz` via temporary `<a download="mdwiki-YYYY-MM-DD.tar.gz">` with local date, closes menu, shows `setStatus("Preparing backup...")` during operation and restores the previous status afterwards. The button downloads a `.tar.gz` with pages and assets and without `.sessions.json` (checked by the user).
- Endpoint `GET /api/export` delivers the data folder as `.tar.gz` (using `tar czf - -C` in Alpine via `child_process`), covered by `test/smoke.js`.
- On the home server an automatic daily backup (03:00, kept 14 days) runs via cron; this script is NOT part of the repo.
- Optional: keep `data/` as a Git repo for a version history.

### Step 6: Optional extras (nothing here is required)
- Footnotes, math (KaTeX), Mermaid diagrams in the preview.
- Drag-and-drop move in the tree (see Step 4).
- (Persistent sessions are already done, see `.sessions.json` and the graceful shutdown in `server.js`.)
- HTTPS via `tailscale serve`, then set `COOKIE_SECURE=true`.
- Version history: make `data/` a Git repo (e.g. commit nightly).
- Confirm the open browser tests from "What is NOT tested".

---

## Wiki Link Syntax (`[[...]]`)

### Syntax
- `[[Page name]]` — link with the page title as label
- `[[Page name|Custom label]]` — link with custom label
- `[[path/to/page]]` — link using path (without `.md` extension)
- Spaces around the name and the label are trimmed.

### Resolving Rules
1. **Path form** (`[[path/to/page]]`): treated as a path without `.md`, looked up directly in the index.
2. **Title form** (`[[Page name]]`): matched against page titles (file name without `.md`), case-insensitive.
3. **Multiple matches**: if several pages have the same title, prefer the one in the same book (depth-2 folder) as the current page; otherwise the first by path order.
4. **Not found**: renders as `<span class="wikilink-missing" title="Page not found">` (muted, dashed underline, not clickable).

### Clicking
- A found link is rendered as `<a href="#ENCODED/PATH" data-p="RAW/PATH.md">`. The click handler on `#view`, `#crumbs` and `#tree`
  calls `preventDefault()` and `go(data-p)`; `go()` also handles the unsaved-changes prompt. `href` stays encoded so that
  "open in new tab" works. **`data-p` must hold the DECODED path** (the index is keyed by the raw path).
- In the editor preview (`#preview`) these links do nothing, so unsaved edits cannot be lost.

### Security
- Page name and label are HTML-escaped before rendering.
- The `href` passes through `safeUrl()` (it's a `#anchor`).
- XSS attempts in name or label (e.g. `[[<img src=x onerror=alert(1)>]]`) are rendered as plain text.
- Code spans and code blocks are NOT processed for wiki links (` `[[code]]` ` stays literal).

### Testing
- `test/render.js` contains the wiki link tests: plain link, link with label, missing page, same name in two books, path form,
  link inside a code span, XSS in name and label, same-book preference, trimmed spaces, decoded `data-p`.
  The test sets `globalThis.index` (a Map of nodes) and `globalThis.sel` and uses the REAL `resolveWikiLink` from `app.js`.
- Run: `& '...\temp-files\node\node-v22.14.0-win-x64\node.exe' mdwiki\test\render.js`
- Browser tested 2026-11-22: click opens the page in the same tab, back/forward works, links in the preview are inert.

### Rules for tests and AI helpers
- In test strings write HTML entities as unicode escapes (e.g. `'\u0026lt;img'` for `&lt;img`). Some AI file tools convert entities
  into plain characters and silently corrupt `test/render.js` (the `esc()` helper and the security tests).
- Do not leave throwaway scripts (`fix_*.js`, `test_extension*.js`) in the repo. Use `temp-files/scratch/` and delete them afterwards.
- Do not claim tests that were not run.

## Important design decisions (please keep)

- **No database.** Files on disk are the only source of truth. The search index may at most live in memory.
- **Markdown only**, no WYSIWYG. This avoids lossy conversion as with BookStack.
- **One password, one user.** Do not add user management.
- **Images live in `data/assets/`** and are embedded with paths like `/files/assets/name.png`.
- **All file access goes through `safePath()`** in `server.js`. New endpoints must use it as well.
- **Never display Markdown as unfiltered HTML.** Raw HTML is escaped in the `html` renderer of `md()` and URLs go through `safeUrl()`, even if only I write.
- **Shelf/Book/Chapter come from folder depth**, not from extra files or a database.
- **Square design and own dialogs** (see "UI conventions"): no `border-radius`, no `prompt`/`confirm`/`alert`.
- **Mobile layout is read-only on purpose (checked by the user).** Editing is only meant for the desktop layout (on a phone, switch the browser to desktop view). Do not 'fix' this.
- **Autosave stays off by default** (no version history; an accidental deletion would be saved after 3 seconds).

## API quick reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | `{password}` |
| POST | `/api/logout` | Log out |
| GET | `/api/session` | checks whether logged in |
| GET | `/api/tree` | Tree of folders and pages |
| GET | `/api/page?path=A/B.md` | Read page |
| PUT | `/api/page` | `{path, content}` save/create |
| POST | `/api/folder` | `{path}` create folder |
| POST | `/api/rename` | `{from, to}` rename/move |
| DELETE | `/api/item?path=` | Delete page or folder |
| GET | `/api/search?q=` | Full-text search |
| POST | `/api/upload?name=x.png` | Upload image (raw data in the body) |
| GET | `/api/export` | Backup: data folder as `.tar.gz` (without `.sessions.json`) |
| GET | `/files/assets/x.png` | Serve file (never `.md`) |
