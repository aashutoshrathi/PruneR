"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadPage, tick, waitFor, anchorIdFor } = require("../test-utils/dom");

const URL = "https://github.com/acme/repo/pull/42/files";

const htmlNewFile = (path, { viewed = false, includeExpand = true } = {}) => {
  const id = anchorIdFor(path);
  const expand = includeExpand
    ? `<button aria-label="Expand all lines: ${path}" data-file-path="${path}"></button>`
    : "";
  return `<div id="${id}" class="diffEntry-hash123">
    <div class="diffHeader-hash456" data-diff-header-wrapper="">
      ${expand}
      <a href="#${id}">${path}</a>
      <button aria-label="Viewed" aria-pressed="${viewed ? "true" : "false"}">Viewed</button>
    </div>
  </div>`;
};

const htmlClassicFile = (path) =>
  `<div class="file-header" data-tagsearch-path="${path}">
    <input type="checkbox" name="viewed" />
    <a href="#${anchorIdFor(path)}"></a>
  </div>`;

const htmlTreeItem = (path) =>
  `<a data-testid="file-tree-list-item" href="#${anchorIdFor(path)}" title="${path}">${path}</a>`;

const makeContentChrome = ({ autoPrune = true } = {}) => ({
  runtime: { id: "test-extension-id" },
  storage: {
    sync: {
      get: async (key) => ({ [key]: autoPrune }),
      set: async () => {},
    },
  },
});

const loadPageWith = ({ body, chrome }) =>
  loadPage({
    html: body,
    url: URL,
    scripts: ["prune.js", "content.js"],
    beforeParse(window) {
      window.chrome = chrome;
      window.__clicks = [];
      window.__changes = [];
      window.addEventListener("click", (e) => window.__clicks.push(e.target), true);
      window.addEventListener("change", (e) => window.__changes.push(e.target), true);
      // Simulate GitHub's async server response: React flips the button state
      // right after a successful "mark as viewed" request.
      window.document.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest && e.target.closest('button[aria-label="Viewed"]');
          if (btn) btn.setAttribute("aria-pressed", "true");
        },
        true
      );
    },
  });

const getButton = (doc, path) => {
  const id = anchorIdFor(path);
  const holder = doc.getElementById(id);
  return holder.querySelector('button[aria-label="Viewed"]');
};

test("marks a new-UI test file as viewed as soon as it is in the DOM", async () => {
  const window = loadPageWith({
    body: htmlNewFile("src/App.test.tsx"),
    chrome: makeContentChrome(),
  });

  const clicked = await waitFor(() =>
    window.__clicks.some((el) => el.getAttribute && el.getAttribute("aria-label") === "Viewed")
  );
  assert.ok(clicked, "expected the test file's Viewed button to be clicked");

  const button = getButton(window.document, "src/App.test.tsx");
  assert.equal(button.getAttribute("aria-pressed"), "true");
});

test("marks a classic-UI test file by checking its checkbox and firing change", async () => {
  const window = loadPageWith({
    body: htmlClassicFile("src/util.spec.ts"),
    chrome: makeContentChrome(),
  });

  const changed = await waitFor(() =>
    window.__changes.some((el) => el.name === "viewed")
  );
  assert.ok(changed, "expected a change event on the viewed checkbox");

  const checkbox = window.document.querySelector('input[name="viewed"]');
  assert.equal(checkbox.checked, true);
});

test("marks test files but leaves source files alone (new UI)", async () => {
  const window = loadPageWith({
    body:
      htmlNewFile("src/App.test.tsx") +
      htmlNewFile("src/components/Button.tsx") +
      htmlNewFile("src/hooks/useAuth.spec.ts"),
    chrome: makeContentChrome(),
  });

  await waitFor(() => window.__clicks.length >= 2);

  assert.equal(getButton(window.document, "src/App.test.tsx").getAttribute("aria-pressed"), "true");
  assert.equal(getButton(window.document, "src/hooks/useAuth.spec.ts").getAttribute("aria-pressed"), "true");
  assert.equal(getButton(window.document, "src/components/Button.tsx").getAttribute("aria-pressed"), "false");
});

test("marks a new-UI test file whose path only exists in the file tree", async () => {
  const window = loadPageWith({
    body:
      htmlNewFile("src/withoutExpand.test.ts", { includeExpand: false }) +
      htmlTreeItem("src/withoutExpand.test.ts"),
    chrome: makeContentChrome(),
  });

  const clicked = await waitFor(() =>
    window.__clicks.some(
      (el) => el.getAttribute && el.getAttribute("aria-label") === "Viewed"
    )
  );
  assert.ok(clicked, "expected the file to be marked via the file tree path");
});

test("does nothing for already-viewed test files", async () => {
  const window = loadPageWith({
    body: htmlNewFile("src/App.test.tsx", { viewed: true }),
    chrome: makeContentChrome(),
  });

  await tick(200);
  assert.equal(window.__clicks.length, 0);
});

test("marks late-mounted files as soon as they appear (lazy / virtualized rendering)", async () => {
  const window = loadPageWith({
    body: htmlNewFile("src/first.test.ts"),
    chrome: makeContentChrome(),
  });

  const first = await waitFor(() => window.__clicks.length >= 1);
  assert.ok(first);

  // Simulate GitHub mounting another diff row later (scroll / lazy load).
  const temp = window.document.createElement("div");
  temp.innerHTML = htmlNewFile("src/second.test.ts");
  const late = temp.firstElementChild;
  window.document.body.appendChild(late);

  const gotLate = await waitFor(() =>
    window.__clicks.some((el) => {
      const id = anchorIdFor("src/second.test.ts");
      return (
        el.closest &&
        el.closest(`#${id}`) &&
        el.setAttribute &&
        el.getAttribute("aria-label") === "Viewed"
      );
    })
  );
  assert.ok(gotLate, "expected the late-mounted test file to be marked");

  const btn = getButton(window.document, "src/second.test.ts");
  assert.equal(btn.getAttribute("aria-pressed"), "true");
});

test("does not re-toggle a marked file after a virtualized row is remounted", async () => {
  const window = loadPageWith({
    body: htmlNewFile("src/remount.test.ts"),
    chrome: makeContentChrome(),
  });

  await waitFor(() => window.__clicks.length >= 1);
  const clicksAfterFirst = window.__clicks.length;

  // React tears the row down and mounts a fresh one whose control initially
  // looks unviewed (aria-pressed=false) before it syncs with the server.
  const oldId = anchorIdFor("src/remount.test.ts");
  window.document.getElementById(oldId).remove();

  const temp = window.document.createElement("div");
  temp.innerHTML = htmlNewFile("src/remount.test.ts");
  window.document.body.appendChild(temp.firstElementChild);

  await tick(250);
  assert.equal(
    window.__clicks.length,
    clicksAfterFirst,
    "remount must not click the already-marked file again"
  );
});

test("does nothing when the extension context is already invalidated", async () => {
  const chrome = makeContentChrome();
  // A content script orphaned by an extension reload has no runtime.id.
  chrome.runtime.id = undefined;

  const window = loadPageWith({
    body: htmlNewFile("src/App.test.tsx"),
    chrome,
  });

  await tick(250);
  assert.equal(window.__clicks.length, 0);
});

test("stops scanning once the extension context is invalidated mid-session", async () => {
  const chrome = makeContentChrome();
  const window = loadPageWith({
    body: htmlNewFile("src/first.test.ts"),
    chrome,
  });

  await waitFor(() => window.__clicks.length >= 1);
  const clicksAfterFirst = window.__clicks.length;

  // The extension is reloaded out from under the page: runtime.id goes away
  // and every chrome.* call now throws.
  chrome.runtime.id = undefined;
  chrome.storage.sync.get = async () => {
    throw new Error("Extension context invalidated.");
  };

  // A new diff row mounts, which would normally trigger a scan.
  const temp = window.document.createElement("div");
  temp.innerHTML = htmlNewFile("src/second.test.ts");
  window.document.body.appendChild(temp.firstElementChild);

  await tick(250);
  assert.equal(
    window.__clicks.length,
    clicksAfterFirst,
    "an invalidated context must not keep scanning"
  );
});

test("respects the autoPrune off setting", async () => {
  const window = loadPageWith({
    body:
      htmlNewFile("src/App.test.tsx") +
      htmlClassicFile("src/util.spec.ts"),
    chrome: makeContentChrome({ autoPrune: false }),
  });

  await tick(250);
  assert.equal(window.__clicks.length, 0);
  assert.equal(window.document.querySelector('input[name="viewed"]').checked, false);
});