"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SRC_DIR = path.join(__dirname, "..", "src");

const readSource = (name) => fs.readFileSync(path.join(SRC_DIR, name), "utf8");

/**
 * Build a jsdom window whose scripts come straight from src/ so the tests
 * exercise the real shipped code. `beforeParse` lets each test inject its own
 * `chrome` mock (and any other globals) before the page scripts run.
 *
 * Scripts are inlined in the document while readyState is "loading", which is
 * exactly how Chrome injects content scripts at `document_idle`.
 */
function loadPage({ html, scripts, url, beforeParse }) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: url || "https://github.com/acme/repo/pull/42/files",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      if (beforeParse) beforeParse(window);
    },
  });

  const window = dom.window;
  for (const name of scripts) {
    const doc = window.document;
    const script = doc.createElement("script");
    script.textContent = readSource(name);
    doc.body.appendChild(script);
  }
  return window;
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `predicate` is truthy or the timeout elapses. Lets tests assert on
 * things the async observer / debounce / storage reads settle in to.
 */
async function waitFor(predicate, { timeout = 1000, interval = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await tick(interval);
  }
  return false;
}

// ---- fixture builders (mirror the real GitHub DOM as of 2026) ----

const anchorIdFor = (path) =>
  "diff-" + Buffer.from(path).toString("hex").slice(0, 12);

/**
 * The new React PR review UI. The file container carries no path itself — the
 * path lives on a neighbouring "Expand all lines" button (`data-file-path`),
 * which younger diffs with no collapsed lines can lack entirely.
 */
function newUiFile(doc, path, { viewed = false, includeExpand = true } = {}) {
  const id = anchorIdFor(path);
  const container = doc.createElement("div");
  container.id = id;
  container.className = "diffEntry-hash123";

  const header = doc.createElement("div");
  header.className = "diffHeader-hash456";
  header.setAttribute("data-diff-header-wrapper", "");
  container.appendChild(header);

  if (includeExpand) {
    const expand = doc.createElement("button");
    expand.setAttribute("aria-label", `Expand all lines: ${path}`);
    expand.setAttribute("data-file-path", path);
    header.appendChild(expand);
  }

  const anchor = doc.createElement("a");
  anchor.href = `#${id}`;
  anchor.textContent = path;
  header.appendChild(anchor);

  const button = doc.createElement("button");
  button.setAttribute("aria-label", "Viewed");
  button.setAttribute("aria-pressed", viewed ? "true" : "false");
  header.appendChild(button);

  return { root: container, container, header, button, anchor, path };
}

/**
 * The classic /files UI: every file header carries `[data-tagsearch-path]`
 * and a native `input[name="viewed"]` checkbox.
 */
function classicFile(doc, path) {
  const header = doc.createElement("div");
  header.className = "file-header";
  header.setAttribute("data-tagsearch-path", path);

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "viewed";
  header.appendChild(checkbox);

  const anchor = doc.createElement("a");
  anchor.href = `#${anchorIdFor(path)}`;
  header.appendChild(anchor);

  return { header, checkbox, path };
}

/**
 * The file tree sidebar. Items link to the same `#diff-<id>` anchors as diff
 * containers and carry the full path in `title`.
 */
function fileTreeItem(doc, path) {
  const item = doc.createElement("a");
  item.setAttribute("data-testid", "file-tree-list-item");
  item.href = `#${anchorIdFor(path)}`;
  item.setAttribute("title", path);
  return item;
}

module.exports = {
  SRC_DIR,
  readSource,
  loadPage,
  tick,
  waitFor,
  anchorIdFor,
  newUiFile,
  classicFile,
  fileTreeItem,
};