/* ===== Eigene Dialoge (ersetzen prompt/confirm/alert) ===== */
function uiDialog({ message, input, value, ok = "OK", cancel = "Cancel", danger = false, alertOnly = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-back";
    wrap.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-msg"></div>' +
      (input ? '<input class="modal-input" type="text" spellcheck="false">' : "") +
      '<div class="modal-btns">' +
      (alertOnly ? "" : '<button type="button" data-r="cancel"></button>') +
      '<button type="button" data-r="ok" class="' + (danger ? "danger-solid" : "primary") + '"></button>' +
      "</div></div>";
    wrap.querySelector(".modal-msg").textContent = message;
    const inp = wrap.querySelector(".modal-input");
    if (inp) inp.value = value || "";
    const bc = wrap.querySelector('[data-r="cancel"]');
    if (bc) bc.textContent = cancel;
    wrap.querySelector('[data-r="ok"]').textContent = ok;
    const prevFocus = document.activeElement;
    const done = (okRes) => {
      document.removeEventListener("keydown", onKey, true);
      wrap.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
      resolve(okRes);
    };
    const result = (okRes) => done(input ? (okRes ? inp.value : null) : okRes);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); result(false); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); result(true); }
    };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) result(false); });
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-r]");
      if (b) result(b.dataset.r === "ok");
    });
    document.body.appendChild(wrap);
    if (inp) { inp.focus(); inp.select(); } else wrap.querySelector('[data-r="ok"]').focus();
  });
}
const uiPrompt = (message, value) => uiDialog({ message, input: true, value });
const uiConfirm = (message) => uiDialog({ message, ok: /delete/i.test(message) ? "Delete" : "OK", danger: /delete/i.test(message) });
const uiAlert = (message) => uiDialog({ message, alertOnly: true });

"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const ICON = {
  shelf: "i-shelf",
  book: "i-book",
  chapter: "i-chapter",
  page: "i-page",
};
const LABEL = {
  shelf: "Shelf",
  book: "Book",
  chapter: "Chapter",
  page: "Page",
};
const ico = (k) => `<svg><use href="#${ICON[k]}"/></svg>`;
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  },
  getJson: (k, def) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  },
  setJson: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};

// ---- CodeMirror 6 editor (lazy-loaded) ----
let cmModule = null;
let cmEditor = null; // { view, getValue, setValue, focus, setDisabled }
let EditorSelection = null; // CM6 EditorSelection class

// Lazy-load CM6 editor module; falls back to null if anything fails
async function loadCmEditor() {
  if (cmModule !== null) return cmModule; // already loaded or failed
  try {
    cmModule = await import("./cm-editor.js").catch(() => null);
    if (cmModule && cmModule.EditorSelection) {
      EditorSelection = cmModule.EditorSelection;
    }
  } catch (e) {
    cmModule = null;
  }
  return cmModule;
}

// Editor helper functions that work with both CM6 and textarea fallback
function editorValue() {
  return cmEditor ? cmEditor.getValue() : $("editor").value;
}

function setEditorValue(v) {
  if (cmEditor) cmEditor.setValue(v);
  else $("editor").value = v;
}

function setEditorDisabled(d) {
  if (cmEditor) cmEditor.setDisabled(d);
  else $("editor").disabled = d;
}

function editorFocus() {
  if (cmEditor) cmEditor.focus();
  else $("editor").focus();
}

// Initialize CM6 editor inside #cmHost; returns true if CM6 is active
async function initCmEditor(initialValue, onUpdate, onCommand) {
  const mod = await loadCmEditor();
  if (!mod || typeof mod.createEditor !== "function") return false;

  const host = $("cmHost");
  host.hidden = false;
  $("editor").hidden = true;

  cmEditor = mod.createEditor(host, {
    value: initialValue,
    onUpdate,
    onCommand,
  });
  return true;
}

// Switch to textarea fallback (hide CM6, show textarea)
function useTextareaFallback() {
  if (cmEditor) {
    cmEditor.view.destroy();
    cmEditor = null;
  }
  $("cmHost").hidden = true;
  $("editor").hidden = false;
}

// CM6 helper: wrap selection with prefix/suffix (like wrapSelection for textarea)
function cmWrapSelection(view, prefix, suffix) {
  const { state } = view;
  const transaction = state.update(
    state.changeByRange((range) => {
      const from = range.from;
      const to = range.to;
      const selected = state.sliceDoc(from, to);
      let insert, newAnchor, newHead;
      if (selected) {
        // Selected text: wrap it and keep inner text selected
        insert = prefix + selected + suffix;
        newAnchor = from + prefix.length;
        newHead = from + prefix.length + selected.length;
      } else {
        // Empty selection: insert prefix+suffix and put cursor between them
        insert = prefix + suffix;
        newAnchor = newHead = from + prefix.length;
      }
      return { changes: [{ from, to, insert }], range: EditorSelection.range(newAnchor, newHead) };
    }),
    { scrollIntoView: true, userEvent: "input" }
  );
  view.dispatch(transaction);
  view.focus();
}

// CM6 helper: insert link markup [text](url) and select "url"
function cmInsertLink(view) {
  const { state } = view;
  const transaction = state.update(
    state.changeByRange((range) => {
      const from = range.from;
      const to = range.to;
      const selected = state.sliceDoc(from, to);
      let insert, newAnchor, newHead;
      if (selected) {
        // Wrap selected text: [selected](url) and select "url"
        insert = "[" + selected + "](url)";
        // "url" starts after "[selected](" which is 2 + selected.length + 1 = selected.length + 3
        newAnchor = from + 2 + selected.length + 1; // after "[selected]("
        newHead = newAnchor + 3; // "url" is 3 chars
      } else {
        // Empty selection: [](url) and select "url"
        insert = "[](url)";
        // "url" starts after "[]( " which is 3 chars
        newAnchor = from + 3;
        newHead = newAnchor + 3; // "url" is 3 chars
      }
      return { changes: [{ from, to, insert }], range: EditorSelection.range(newAnchor, newHead) };
    }),
    { scrollIntoView: true, userEvent: "input" }
  );
  view.dispatch(transaction);
  view.focus();
}

let tree = [],
  index = new Map();
let sel = "",
  pageContent = "",
  editing = false,
  dirty = false;
let collapsedFolders = store.getJson("collapsedFolders", []);

// Autosave state
let autosaveEnabled = store.getJson("autosaveEnabled", false);
let autosaveTimer = null;
let autosaveSaving = false;

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  if (r.status === 401 && url !== "/api/login") {
    showLogin();
    throw new Error("Not logged in");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Error " + r.status);
  return data;
}
const setStatus = (t) => {
  $("status").textContent = t;
};

// ---- Markdown ----
// Rendered with "marked" (public/vendor/marked.umd.js, served locally so it works offline).
// Safety rules (do not remove): raw HTML in the text is ESCAPED, never rendered,
// and link/image addresses must pass safeUrl() (no javascript:, data:, vbscript: ...).
function safeUrl(u) {
  u = String(u || "").trim();
  // allowed: http(s), mailto, tel, absolute or relative paths, #anchors, and addresses without a scheme
  return /^(https?:|mailto:|tel:|\/|#|\.{1,2}\/|[^:]*$)/i.test(u) ? u : "#";
}

// Wiki link resolver - injectable for testing (test/render.js sets a stub)
// name: the page name or path from [[name]] or [[name|label]]
// label: the label part (or name if no label)
// currentPagePath: the path of the page being rendered (e.g. "Technik/Homelab/Docker.md")
// Returns: { found: boolean, path: string|null, label: string }
//   - found: true if page exists
//   - path: the hash path (e.g. "#Technik/Homelab/Docker.md") if found
//   - label: the label to display (escaped by caller)
function resolveWikiLink(name, label, currentPagePath) {
  // Use globalThis.index for testability (tests populate it)
  const idx = globalThis.index || index;
  // If name contains "/", treat as path without .md
  if (name.includes("/")) {
    const path = name.endsWith(".md") ? name : name + ".md";
    const node = idx.get(path);
    if (node && node.type === "page") {
      return { found: true, path: "#" + encodeURIComponent(path), label: label };
    }
    return { found: false, path: null, label: label };
  }
  // Match by title (file name without .md), case-insensitive
  const lowerName = name.toLowerCase();
  let candidates = [];
  for (const node of idx.values()) {
    if (node.type === "page") {
      const title = node.name; // file name without .md
      if (title.toLowerCase() === lowerName) {
        candidates.push(node);
      }
    }
  }
  if (candidates.length === 0) {
    return { found: false, path: null, label: label };
  }
  // Prefer page in same book as current page
  if (currentPagePath) {
    const currentNode = idx.get(currentPagePath);
    if (currentNode) {
      // Find the book (depth 2 folder) for current page
      let currentBook = null;
      let n = currentNode;
      while (n && n.parent) {
        const parent = idx.get(n.parent);
        if (parent && parent.depth === 2 && parent.type === "folder") {
          currentBook = parent.path;
          break;
        }
        n = parent;
      }
      if (currentBook) {
        for (const cand of candidates) {
          // Check if candidate is in the same book
          let candBook = null;
          let m = cand;
          while (m && m.parent) {
            const parent = idx.get(m.parent);
            if (parent && parent.depth === 2 && parent.type === "folder") {
              candBook = parent.path;
              break;
            }
            m = parent;
          }
          if (candBook === currentBook) {
            return { found: true, path: "#" + encodeURIComponent(cand.path), label: label };
          }
        }
      }
    }
  }
  // Otherwise first by path
  candidates.sort((a, b) => a.path.localeCompare(b.path));
  return { found: true, path: "#" + encodeURIComponent(candidates[0].path), label: label };
}

// Make resolver globally accessible for the marked extension
globalThis.resolveWikiLink = resolveWikiLink;

// Wiki link marked inline extension
const wikiLinkExt = {
  name: "wikilink",
  level: "inline",
  start: (src) => src.indexOf("[["),
  tokenizer: (src, tokens) => {
    const match = src.match(/^\[\[([^\]]+)\]\]/);
    if (match) {
      const content = match[1];
      const parts = content.split("|");
      const name = parts[0].trim();
      const label = (parts[1] || name).trim();
      return { type: "wikilink", raw: match[0], name: name, label: label };
    }
  },
  renderer: (token) => {
    // currentPagePath is the page being rendered (globalThis.sel), or empty string
    const resolved = globalThis.resolveWikiLink(token.name, token.label, globalThis.sel || "");
    const safeName = esc(token.name);
    const safeLabel = esc(token.label);
    if (resolved.found) {
      // href is already a #anchor, pass through safeUrl for consistency
      const safeHref = esc(safeUrl(resolved.path));
      // data-p must hold the DECODED raw path (go() looks it up in the index);
      // the encoded form stays in href for the browser
      const rawPath = resolved.path.startsWith("#") ? resolved.path.slice(1) : resolved.path;
      const decodedPath = decodeURIComponent(rawPath);
      return `<a href="${safeHref}" data-p="${esc(decodedPath)}">${safeLabel}</a>`;
    } else {
      return `<span class="wikilink-missing" title="Page not found">${safeLabel}</span>`;
    }
  },
};

const mdParser =
  typeof marked !== "undefined"
    ? new marked.Marked({
        gfm: true,
        extensions: [wikiLinkExt],
        renderer: {
          html({ text, block }) {
            return block ? `<p>${esc(text.trim())}</p>\n` : esc(text);
          },
          link({ href, title, tokens }) {
            const t = title ? ` title="${esc(title)}"` : "";
            return `<a href="${esc(safeUrl(href))}"${t} target="_blank" rel="noopener">${this.parser.parseInline(tokens)}</a>`;
          },
          image({ href, title, text }) {
            const t = title ? ` title="${esc(title)}"` : "";
            return `<img alt="${esc(text)}" src="${esc(safeUrl(href))}"${t}>`;
          },
        },
      })
    : null;
function md(src) {
  src = String(src).replace(/\r/g, "");
  // If the library failed to load, show the text as-is instead of breaking the page.
  if (!mdParser) return `<pre>${esc(src)}</pre>`;
  return mdParser.parse(src);
}
// ---- end Markdown ----

// ---- Login / account ----
function showLogin() {
  $("app").hidden = true;
  $("login").hidden = false;
  $("pw").focus();
}
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  registerEditorFileEvents();
  init();
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/login", { password: $("pw").value });
    $("pw").value = "";
    $("loginErr").textContent = "";
    showApp();
  } catch (err) {
    $("loginErr").textContent = err.message;
  }
});
$("logout").onclick = async () => {
  await api("POST", "/api/logout", {}).catch(() => {});
  showLogin();
};
$("downloadBackup").onclick = async () => {
  const previousStatus = $("status").textContent;
  setStatus("Preparing backup...");
  try {
    const res = await fetch("/api/export", { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.error || "Export failed (status " + res.status + ")";
      await uiAlert(message);
      return;
    }
    const blob = await res.blob();
    const day = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdwiki-${day}.tar.gz`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    await uiAlert("Export failed: " + e.message);
  } finally {
    // Restore status only if it still says "Preparing backup..."
    if ($("status").textContent === "Preparing backup...") {
      setStatus(previousStatus);
    }
    $("acctMenu").hidden = true;
  }
};
$("acctBtn").onclick = (e) => {
  e.stopPropagation();
  $("acctMenu").hidden = !$("acctMenu").hidden;
};
document.addEventListener("click", () => {
  $("acctMenu").hidden = true;
});
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set("theme", t);
  $("themeToggle").textContent =
    t === "dark" ? "Switch to light mode" : "Switch to dark mode";
}
$("themeToggle").onclick = () =>
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );
applyTheme(document.documentElement.dataset.theme || "dark");

// ---- Tree data ----
function buildIndex(nodes, depth, parent) {
  for (const n of nodes) {
    n.depth = depth;
    n.parent = parent;
    n.kind =
      n.type === "page"
        ? "page"
        : depth === 1
          ? "shelf"
          : depth === 2
            ? "book"
            : "chapter";
    index.set(n.path, n);
    if (n.children) buildIndex(n.children, depth + 1, n.path);
  }
}
async function refresh() {
  tree = await api("GET", "/api/tree");
  index = new Map();
  buildIndex(tree, 1, "");
}
const chain = (p) => {
  const o = [];
  let n = index.get(p);
  while (n) {
    o.unshift(n);
    n = index.get(n.parent);
  }
  return o;
};
const all = () => [...index.values()];

// ---- Navigation / views ----
async function leaveEditor() {
  if (!editing) return true;
  if (dirty && !await uiConfirm("Discard unsaved changes?")) return false;
  editing = false;
  dirty = false;
  cancelAutosave();
  // Clean up CM6 editor if active
  if (cmEditor) {
    cmEditor.view.destroy();
    cmEditor = null;
  }
  // Ensure textarea is visible for next edit
  $("cmHost").hidden = true;
  $("editor").hidden = false;
  $("editorWrap").hidden = true;
  $("view").hidden = false;
  return true;
}
async function go(path) {
  if (!(await leaveEditor())) return;
  $("search").value = "";
  const n = index.get(path);
  try {
    if (!n) return showHome();
    // Expand the tree to the target BEFORE rendering so the nav is correct on first paint
    ensurePathExpanded(path);
    if (n.type === "page") {
      await showPage(n);
    } else {
      showFolder(n);
    }
  } catch (e) {
    uiAlert(e.message);
  }
}
const setView = (html) => {
  $("view").innerHTML = html;
  $("content").scrollTop = 0;
};
const sub = (n, withPath) => {
  if (n.type === "page") return esc(n.parent.replace(/\//g, " › "));
  const f = n.children.filter((c) => c.type === "folder").length,
    p = n.children.length - f;
  const bits = [];
  if (f) bits.push(f + (f === 1 ? " folder" : " folders"));
  if (p) bits.push(p + (p === 1 ? " page" : " pages"));
  return esc(
    (withPath && n.parent ? n.parent.replace(/\//g, " › ") + " · " : "") +
      (bits.join(", ") || "empty"),
  );
};
const cards = (nodes, withPath) =>
  '<div class="cards">' +
  nodes
    .map(
      (n) =>
        `<div class="card t-${n.kind}" data-p="${esc(n.path)}"><h3>${ico(n.kind)}<span>${esc(n.name)}</span></h3><div class="muted">${sub(n, withPath)}</div></div>`,
    )
    .join("") +
  "</div>";
const title = (kind, text) =>
  `<h1 class="vh">${ico(kind)}<span>${esc(text)}</span></h1>`;

function showHome() {
  sel = "";
  const top = tree;
  setView(
    title("shelf", "Own Wiki") +
      (top.length
        ? cards(top)
        : '<p class="muted">Nothing here yet. Use “New shelf” on the right to start.</p>'),
  );
  chrome();
}
function showList(kind) {
  const d = { shelves: 1, books: 2, chapters: 3 }[kind],
    k = { shelves: "shelf", books: "book", chapters: "chapter" }[kind];
  const label = kind[0].toUpperCase() + kind.slice(1),
    nodes = all().filter((n) => n.type === "folder" && n.depth === d);
  sel = "";
  setView(
    title(k, label) +
      (nodes.length
        ? cards(nodes, true)
        : `<p class="muted">No ${kind} yet.</p>`),
  );
  chrome(label);
}
function showFolder(n) {
  sel = n.path;
  setView(
    title(n.kind, n.name) +
      (n.children.length
        ? cards(n.children)
        : '<p class="muted">Empty. Use the actions on the right to add something.</p>'),
  );
  chrome();
}
async function showPage(n) {
  const d = await api("GET", "/api/page?path=" + encodeURIComponent(n.path));
  pageContent = d.content;
  sel = n.path;
  renderPageView();
  chrome();
}
function renderPageView() {
  setView(
    pageContent.trim()
      ? `<div class="md-body">${md(pageContent)}</div>`
      : '<p class="muted">This page is empty. Click “Edit” to write.</p>',
  );
}

// ---- Chrome: breadcrumbs, side navigation, details, actions ----
function chrome(listLabel) {
  renderCrumbs(listLabel);
  renderNav();
  renderDetails();
  renderActions();
  try {
    history.replaceState(
      null,
      "",
      sel ? "#" + encodeURIComponent(sel) : location.pathname,
    );
  } catch (e) {}
}
function renderCrumbs(label) {
  const parts = ['<a data-p="">Home</a>'];
  for (const n of chain(sel))
    parts.push(
      `<a class="t-${n.kind}" data-p="${esc(n.path)}">${ico(n.kind)}${esc(n.name)}</a>`,
    );
  if (label) parts.push(`<a>${esc(label)}</a>`);
  $("crumbs").innerHTML = parts.join('<span class="sep">›</span>');
}

function isCollapsed(path) {
  return collapsedFolders.includes(path);
}

function toggleCollapsed(path) {
  if (isCollapsed(path)) {
    collapsedFolders = collapsedFolders.filter((p) => p !== path);
  } else {
    collapsedFolders.push(path);
  }
  store.setJson("collapsedFolders", collapsedFolders);
  renderNav();
}

function ensurePathExpanded(path) {
  let n = index.get(path);
  if (!n) return;
  let changed = false;
  while (n && n.parent) {
    if (isCollapsed(n.parent)) {
      collapsedFolders = collapsedFolders.filter((p) => p !== n.parent);
      changed = true;
    }
    const pn = index.get(n.parent);
    if (!pn) break;
    n = pn;
  }
  if (changed) {
    store.setJson("collapsedFolders", collapsedFolders);
  }
}

const nodeHtml = (n) => {
  const active = n.path === sel ? " active" : "";
  const hasChildren = n.type === "folder" && n.children.length > 0;
  const collapsed = hasChildren && isCollapsed(n.path);
  const toggleBtn = hasChildren
    ? `<button class="toggle" data-toggle="${esc(n.path)}" aria-label="${collapsed ? "Expand" : "Collapse"}"><svg><use href="#i-chevron"/></svg></button>`
    : `<span class="toggle-placeholder"></span>`;
  const childrenHtml = hasChildren
    ? `<div class="children${collapsed ? " collapsed" : ""}">${n.children.map(nodeHtml).join("")}</div>`
    : "";
  return (
    `<div class="node t-${n.kind}${active}" data-p="${esc(n.path)}">${toggleBtn}${ico(n.kind)}<span>${esc(n.name)}</span></div>` +
    childrenHtml
  );
};

function renderNav() {
  const ch = chain(sel);
  const root =
    ch.find((x) => x.type === "folder" && x.depth === 2) ||
    ch.find((x) => x.type === "folder" && x.depth === 1) ||
    null;
  document.querySelector("#navSide .side-title").textContent = root
    ? root.name
    : "Shelves";
  $("tree").innerHTML = root
    ? root.children.map(nodeHtml).join("") || '<p class="muted">Empty</p>'
    : tree
        .map(
          (n) =>
            `<div class="node t-${n.kind}" data-p="${esc(n.path)}">${ico(n.kind)}<span>${esc(n.name)}</span></div>`,
        )
        .join("");
}
function renderDetails() {
  const n = index.get(sel),
    cnt = (k) => all().filter((x) => x.kind === k).length;
  if (!n) {
    $("details").innerHTML =
      `Shelves: ${cnt("shelf")}<br>Books: ${cnt("book")}<br>Chapters: ${cnt("chapter")}<br>Pages: ${cnt("page")}`;
    return;
  }
  let h = `Type: ${LABEL[n.kind]}<br>Name: ${esc(n.name)}<br>Path: ${esc(n.path)}`;
  if (n.type === "page") {
    const w = (pageContent.trim().match(/\S+/g) || []).length;
    h += `<br>Words: ${w}`;
  } else h += `<br>Contains: ${sub(n)}`;
  $("details").innerHTML = h;
}
const ctxFolder = () => {
  const n = index.get(sel);
  return !n ? null : n.type === "folder" ? n : index.get(n.parent) || null;
};
function renderActions() {
  const n = index.get(sel),
    ctx = ctxFolder(),
    d = ctx ? ctx.depth : 0;
  $("edit").disabled = !(n && n.type === "page") || editing;
  $("rename").disabled = $("delete").disabled = !n;
  const kinds = ["shelf", "book", "chapter"];
  $("newFolder").textContent = "New " + kinds[Math.min(d, kinds.length - 1)];
}
for (const id of ["view", "crumbs", "tree"])
  $(id).addEventListener("click", (e) => {
    // Handle toggle button clicks (expand/collapse folders)
    const toggleBtn = e.target.closest("[data-toggle]");
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleCollapsed(toggleBtn.dataset.toggle);
      return;
    }
    // Handle navigation clicks on <a data-p> (wiki links, breadcrumbs, tree nodes, search results)
    const a = e.target.closest("a[data-p]");
    if (a) {
      e.preventDefault();
      go(a.dataset.p);
      return;
    }
    // Handle navigation clicks on other [data-p] elements (cards, etc.)
    const c = e.target.closest("[data-p]");
    if (c) go(c.dataset.p);
  });
// Preview area: prevent navigation on wiki links so unsaved edits are not lost
$("preview").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-p]");
  if (a) e.preventDefault();
});
$("logo").onclick = (e) => {
  e.preventDefault();
  go("");
};
for (const b of document.querySelectorAll("#topnav button"))
  b.onclick = async () => {
    if (await leaveEditor()) {
      $("search").value = "";
      showList(b.dataset.view);
    }
  };

// ---- Actions ----
$("newPage").onclick = async () => {
  const ctx = ctxFolder();
  let name = await uiPrompt(
    "Name of the new page" + (ctx ? ` (in ${ctx.path})` : "") + ":",
  );
  if (!name) return;
  if (!(await leaveEditor())) return;
  name = name.replace(/\.md$/i, "");
  const p = (ctx ? ctx.path + "/" : "") + name + ".md";
  try {
    await api("PUT", "/api/page", { path: p, content: "# " + name + "\n\n" });
    await refresh();
    await go(p);
    openEditor();
  } catch (e) {
    uiAlert(e.message);
  }
};
$("newFolder").onclick = async () => {
  const ctx = ctxFolder(),
    what = $("newFolder").textContent.replace("New ", "");
  const name = await uiPrompt(
    `Name of the new ${what}` + (ctx ? ` (in ${ctx.path})` : "") + ":",
  );
  if (!name) return;
  if (!(await leaveEditor())) return;
  const p = (ctx ? ctx.path + "/" : "") + name;
  try {
    await api("POST", "/api/folder", { path: p });
    await refresh();
    await go(p);
  } catch (e) {
    uiAlert(e.message);
  }
};
$("rename").onclick = async () => {
  const n = index.get(sel);
  if (!n) return;
  let to = await uiPrompt("New path (rename or move):", n.path);
  if (!to || to === n.path) return;
  if (!(await leaveEditor())) return;
  if (n.type === "page" && !/\.md$/i.test(to)) to += ".md";
  try {
    await api("POST", "/api/rename", { from: n.path, to });
    await refresh();
    await go(to);
  } catch (e) {
    uiAlert(e.message);
  }
};
$("delete").onclick = async () => {
  const n = index.get(sel);
  if (!n) return;
  if (
    !await uiConfirm(
      "Really delete: " +
        n.path +
        (n.type === "folder" ? " (including everything inside)" : "") +
        "?",
    )
  )
    return;
  if (!(await leaveEditor())) return;
  try {
    await api("DELETE", "/api/item?path=" + encodeURIComponent(n.path));
    await refresh();
    await go(n.parent);
  } catch (e) {
    uiAlert(e.message);
  }
};

// ---- Editor ----
function setMode(m) {
  store.set("editMode", m);
  for (const b of document.querySelectorAll("#modeSwitch button"))
    b.classList.toggle("on", b.dataset.mode === m);
  $("preview").hidden = m !== "split";
  if (m === "split") $("preview").innerHTML = md(editorValue());
}
for (const b of document.querySelectorAll("#modeSwitch button"))
  b.onclick = () => setMode(b.dataset.mode);

async function openEditor() {
  const n = index.get(sel);
  if (!n || n.type !== "page") return;
  editing = true;
  dirty = false;
  $("view").hidden = true;
  $("editorWrap").hidden = false;
  setEditorDisabled(false);
  setEditorValue(pageContent);
  $("save").disabled = false;
  $("current").textContent = n.path;
  setStatus("");

  // Try to initialize CM6 editor
  const cmActive = await initCmEditor(pageContent, (val) => {
    dirty = true;
    setStatus("Unsaved");
    scheduleAutosave();
    // pageContent must only change in save(), otherwise "Discard unsaved changes"
    // still shows the unsaved text. Keep dirty/status/preview updates only.
    if (!$("preview").hidden) {
      $("preview").innerHTML = md(val);
    }
  }, (name, view) => {
    if (name === "save") {
      save().catch((x) => uiAlert(x.message));
      return true;
    }
    // Handle Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link) for CM6
    if (name === "bold") {
      cmWrapSelection(view, "**", "**");
      return true;
    }
    if (name === "italic") {
      cmWrapSelection(view, "*", "*");
      return true;
    }
    if (name === "link") {
      cmInsertLink(view);
      return true;
    }
    return false;
  });

  if (!cmActive) {
    useTextareaFallback();
  }

  setMode(store.get("editMode") === "split" ? "split" : "md");
  updateAutosaveButton();
  if (autosaveEnabled) scheduleAutosave();
  renderActions();
  editorFocus();
}
$("edit").onclick = openEditor;
$("closeEdit").onclick = async () => {
  if (await leaveEditor()) {
    renderPageView();
    renderActions();
  }
};
$("autosaveToggle").onclick = () => toggleAutosave();
async function save(opts = {}) {
  if (!editing) return;
  const isAutosave = opts.autosave === true;
  if (isAutosave) {
    if (autosaveSaving || !dirty) return;
    autosaveSaving = true;
    setStatus("Saving...");
  }
  try {
    await api("PUT", "/api/page", { path: sel, content: editorValue() });
    pageContent = editorValue();
    dirty = false;
    if (isAutosave) {
      setStatus("Saved " + new Date().toLocaleTimeString());
    } else {
      setStatus("Saved " + new Date().toLocaleTimeString());
    }
    renderDetails();
  } catch (e) {
    if (isAutosave) {
      setStatus("Autosave failed");
      // page stays dirty, no retry loop
    } else {
      throw e;
    }
  } finally {
    if (isAutosave) {
      autosaveSaving = false;
    }
  }
}

// Autosave timer management
function scheduleAutosave() {
  if (!autosaveEnabled || !editing || !dirty || autosaveSaving) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    save({ autosave: true }).catch(() => {}); // errors handled in save()
  }, 3000);
}

function cancelAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
}

function updateAutosaveButton() {
  const btn = $("autosaveToggle");
  if (!btn) return;
  btn.textContent = autosaveEnabled ? "Autosave: on" : "Autosave: off";
  btn.classList.toggle("on", autosaveEnabled);
}

async function toggleAutosave() {
  autosaveEnabled = !autosaveEnabled;
  store.setJson("autosaveEnabled", autosaveEnabled);
  updateAutosaveButton();
  if (autosaveEnabled) {
    scheduleAutosave();
  } else {
    cancelAutosave();
  }
}
$("save").onclick = () => save().catch((x) => uiAlert(x.message));

// Textarea fallback: live preview + keyboard shortcuts (Ctrl+B/I/K)
let raf = 0;
$("editor").addEventListener("input", () => {
  dirty = true;
  setStatus("Unsaved");
  scheduleAutosave();
  if (!$("preview").hidden && !raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      $("preview").innerHTML = md(editorValue());
    });
});

// Textarea fallback: Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link)
$("editor").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.key === "b") {
      e.preventDefault();
      wrapSelection("**", "**");
    } else if (e.key === "i") {
      e.preventDefault();
      wrapSelection("*", "*");
    } else if (e.key === "k") {
      e.preventDefault();
      insertLink();
    }
  }
});

// Global Ctrl+S: guard with defaultPrevented so CM6's Mod-s doesn't save twice
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && editing) {
    e.preventDefault();
    save().catch((x) => uiAlert(x.message));
  }
});

// ---- Image upload (paste / drag-and-drop) ----

// Allowed file extensions (must match server.js)
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);

// Generate a filename for pasted screenshots (name is "image.png" or empty)
function generatePasteName(ext) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `pasted-${yyyy}${mm}${dd}-${hh}${mi}${ss}${ext}`;
}

// Upload a list of File objects; returns an array of markdown lines (one per successful upload)
async function uploadFiles(files) {
  const markdownLines = [];
  const previousStatus = $('status').textContent;

  for (const file of files) {
    // Determine the name to send to the server first (generates name for pasted files with no name/ext)
    let name = file.name;
    if (!name || name === 'image.png' || name === 'blob') {
      name = generatePasteName('.png'); // default to .png for pasted screenshots
    }
    // Now check the extension of the FINAL name (after generation)
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
    if (!ALLOWED_EXTS.has(ext)) {
      await uiAlert(`File type "${ext || 'unknown'}" not allowed. Allowed: png, jpg, jpeg, gif, webp, svg, pdf`);
      continue;
    }

    setStatus('Uploading...');
    try {
      const res = await fetch('/api/upload?name=' + encodeURIComponent(name), {
        method: 'POST',
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed with status ' + res.status);
      if (data.markdown) markdownLines.push(data.markdown);
    } catch (err) {
      await uiAlert(err.message);
    }
  }

  // Restore status (if no other operation has changed it in the meantime)
  if ($('status').textContent === 'Uploading...') {
    setStatus(previousStatus || (dirty ? 'Unsaved' : ''));
  }

  return markdownLines;
}

// Insert markdown at the current cursor position in the active editor (CM6 or textarea)
// Marks the page as dirty and updates the live preview.
function insertMarkdownAtCursor(markdown) {
  if (cmEditor) {
    const { view } = cmEditor;
    const { state } = view;
    const head = state.selection.main.head;
    view.dispatch({
      changes: { from: head, to: head, insert: markdown + '\n' },
      selection: { anchor: head + markdown.length + 1, head: head + markdown.length + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
    // onUpdate callback in initCmEditor will mark dirty and update preview
  } else {
    const ta = $('editor');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    ta.value = text.slice(0, start) + markdown + '\n' + text.slice(end);
    const newPos = start + markdown.length + 1;
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    // Trigger input event for live preview and dirty tracking
    ta.dispatchEvent(new Event('input'));
  }
}

// Handle paste event on the editor area
async function handleEditorPaste(e) {
  const files = e.clipboardData?.files;
  if (!files || !files.length) return; // normal text paste, let it through
  e.preventDefault();
  const lines = await uploadFiles(Array.from(files));
  for (const line of lines) insertMarkdownAtCursor(line);
}

// Handle drop event on the editor area
async function handleEditorDrop(e) {
  const files = e.dataTransfer?.files;
  if (!files || !files.length) return; // normal drop, let it through
  e.preventDefault();
  const lines = await uploadFiles(Array.from(files));
  for (const line of lines) insertMarkdownAtCursor(line);
}

// Handle dragover to allow dropping files
function handleEditorDragOver(e) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
  }
}

// Register paste/drop/dragover listeners ONCE on the editor containers
// These work for both CM6 (on #cmHost) and textarea fallback (on #editor)
function registerEditorFileEvents() {
  if (window.__editorFileEventsRegistered) return;
  window.__editorFileEventsRegistered = true;

  // #cmHost exists from the start (hidden), #editor exists from the start
  const cmHost = $('cmHost');
  const editor = $('editor');

  // Use capture phase to catch events before CM6 might handle them
  cmHost.addEventListener('paste', handleEditorPaste, true);
  cmHost.addEventListener('drop', handleEditorDrop, true);
  cmHost.addEventListener('dragover', handleEditorDragOver, true);

  editor.addEventListener('paste', handleEditorPaste, true);
  editor.addEventListener('drop', handleEditorDrop, true);
  editor.addEventListener('dragover', handleEditorDragOver, true);
}

// Helper: wrap selected text in textarea with prefix/suffix
function wrapSelection(prefix, suffix) {
  const ta = $("editor");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.slice(start, end);
  ta.value = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
  // Restore selection: if there was a selection, keep it selected (inner text);
  // if empty, put cursor between prefix and suffix
  if (selected) {
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd = start + prefix.length + selected.length;
  } else {
    ta.selectionStart = ta.selectionEnd = start + prefix.length;
  }
  ta.focus();
  // Trigger input event for live preview
  ta.dispatchEvent(new Event("input"));
}

// Helper: insert link markup [text](url) and select "url" in textarea
function insertLink() {
  const ta = $("editor");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.slice(start, end);
  let insert, newStart, newEnd;
  if (selected) {
    // Wrap selected text: [selected](url) and select "url"
    insert = "[" + selected + "](url)";
    // "url" starts after "[selected](" which is 2 + selected.length + 1 = selected.length + 3
    newStart = start + 2 + selected.length + 1;
    newEnd = newStart + 3; // "url" is 3 chars
  } else {
    // Empty selection: [](url) and select "url"
    insert = "[](url)";
    // "url" starts after "[]( " which is 3 chars
    newStart = start + 3;
    newEnd = newStart + 3; // "url" is 3 chars
  }
  ta.value = text.slice(0, start) + insert + text.slice(end);
  ta.selectionStart = newStart;
  ta.selectionEnd = newEnd;
  ta.focus();
  ta.dispatchEvent(new Event("input"));
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---- Search ----
let st;
$("search").addEventListener("input", () => {
  clearTimeout(st);
  st = setTimeout(async () => {
    const q = $("search").value.trim();
    if (editing) {
      setStatus("Close the editor to search");
      return;
    }
    if (!q) return go(sel);
    const res = await api(
      "GET",
      "/api/search?q=" + encodeURIComponent(q),
    ).catch(() => []);
    setView(
      title("page", "Search: " + q) +
        (res.length
          ? '<div class="cards">' +
            res
              .map((r) => {
                const n = index.get(r.path);
                return `<div class="card t-page" data-p="${esc(r.path)}"><h3>${ico("page")}<span>${esc(n ? n.name : r.path)}</span></h3><div class="muted">${esc(r.path.replace(/\//g, " › "))}</div><div class="hit">${esc(r.snippet || "")}</div></div>`;
              })
              .join("") +
            "</div>"
          : '<p class="muted">Nothing found</p>'),
    );
    sel = "";
    renderCrumbs("Search");
    renderNav();
    renderDetails();
    renderActions();
  }, 250);
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("search").value = "";
    go(sel);
  }
});

// ---- Start ----
async function init() {
  try {
    await refresh();
    await go(decodeURIComponent(location.hash.slice(1)));
  } catch (e) {
    /* login shown by api() on 401 */
  }
}
// Handle browser back/forward navigation
window.addEventListener("hashchange", () => {
  const path = decodeURIComponent(location.hash.slice(1));
  // Skip when the browser set the hash to the page we are already showing,
  // or when the hash matches what go()/chrome() just wrote via replaceState
  if (path === sel) return;
  if (location.hash === "#" + encodeURIComponent(sel)) return;
  go(path);
});
api("GET", "/api/session").then(showApp).catch(showLogin);

