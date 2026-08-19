"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadPage, newUiFile, classicFile, fileTreeItem } = require("../test-utils/dom");

const makeWindow = () =>
  loadPage({ scripts: ["prune.js"], url: "https://github.com/acme/repo/pull/42/files" });

test("isTestFile matches every documented pattern", () => {
  const window = makeWindow();
  const { isTestFile } = window.PruneR;
  const matches = [
    "src/button.test.ts",
    "src/button.test.tsx",
    "src/button.test.js",
    "src/button.test.jsx",
    "src/button.test.mjs",
    "src/button.test.cjs",
    "src/utils.spec.ts",
    "src/utils.spec.tsx",
    "src/utils.spec.mjs",
    "__tests__/foo.ts",
    "src/__tests__/foo.ts",
    "test/setup.ts",
    "tests/setup.ts",
    "__mocks__/fs.ts",
    "__fixtures__/data.json",
    "fixtures/data.json",
    "__snapshots__/button.test.tsx.snap",
    "button.test.tsx.snap",
    "src/components/stack.stories.tsx",
    "src/components/stack.stories.ts",
    "src/components/stack.stories.js",
    "src/components/stack.stories.jsx",
    "mocks/handlers.ts",
    "mock/handlers.ts",
    "testing/setup.ts",
    "src/storybook/decorators.tsx",
  ];
  for (const path of matches) assert.ok(isTestFile(path), path);
});

test("isTestFile rejects regular source files", () => {
  const window = makeWindow();
  const { isTestFile } = window.PruneR;
  const rejects = [
    "src/App.tsx",
    "src/useThing.ts",
    "src/components/button.tsx",
    "README.md",
    "src/test.ts",
    "src/controller.testing.ts",
    "src/mock-server.ts",
  ];
  for (const path of rejects) assert.ok(!isTestFile(path), path);
});

test("cleanPath strips zero-width and bidirectional control chars", () => {
  const window = makeWindow();
  assert.equal(
    window.PruneR.cleanPath("\u200bsrc\u2060/\u200bbutton.test.ts\u200b"),
    "src/button.test.ts"
  );
});

test("isViewed reads the classic checkbox state", () => {
  const window = makeWindow();
  const doc = window.document;
  const cb = doc.createElement("input");
  cb.type = "checkbox";
  assert.equal(window.PruneR.isViewed(cb), false);
  cb.checked = true;
  assert.equal(window.PruneR.isViewed(cb), true);
});

test("isViewed reads the new UI button aria-pressed state", () => {
  const window = makeWindow();
  const doc = window.document;
  const btn = doc.createElement("button");
  btn.setAttribute("aria-label", "Viewed");
  btn.setAttribute("aria-pressed", "false");
  assert.equal(window.PruneR.isViewed(btn), false);
  btn.setAttribute("aria-pressed", "true");
  assert.equal(window.PruneR.isViewed(btn), true);
});

test("isViewed falls back to the label when aria-pressed is absent", () => {
  const window = makeWindow();
  const doc = window.document;
  const notViewed = doc.createElement("button");
  notViewed.setAttribute("aria-label", "Not Viewed");
  assert.equal(window.PruneR.isViewed(notViewed), false);

  const viewed = doc.createElement("button");
  viewed.setAttribute("aria-label", "Viewed");
  assert.equal(window.PruneR.isViewed(viewed), true);
});

test("markControl clicks a button and checks+notifies a checkbox", () => {
  const window = makeWindow();
  const doc = window.document;

  const btn = doc.createElement("button");
  let clicks = 0;
  btn.addEventListener("click", () => clicks++);
  window.PruneR.markControl(btn);
  assert.equal(clicks, 1);

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "viewed";
  let changes = 0;
  checkbox.addEventListener("change", () => changes++);
  window.PruneR.markControl(checkbox);
  assert.equal(checkbox.checked, true);
  assert.equal(changes, 1);
});

test("resolveFile resolves the new UI file via its sibling Expand-all button", () => {
  const window = makeWindow();
  const doc = window.document;
  const { container, button } = newUiFile(doc, "src/features/notes/index.test.ts");
  doc.body.appendChild(container);

  const resolved = window.PruneR.resolveFile(button, doc, [button]);
  assert.equal(resolved.path, "src/features/notes/index.test.ts");
  assert.equal(resolved.container.className, "diffHeader-hash456");
});

test("resolveFile resolves a new UI file even when the path-bearing button is absent (via file tree)", () => {
  const window = makeWindow();
  const doc = window.document;
  const testFile = newUiFile(doc, "src/bar.test.ts", { includeExpand: false });
  doc.body.appendChild(testFile.container);
  doc.body.appendChild(fileTreeItem(doc, "src/bar.test.ts"));

  const resolved = window.PruneR.resolveFile(testFile.button, doc, [testFile.button]);
  assert.equal(resolved.path, "src/bar.test.ts");
});

test("resolveFile resolves the classic UI via data-tagsearch-path", () => {
  const window = makeWindow();
  const doc = window.document;
  const { header, checkbox } = classicFile(doc, "src/foo.spec.ts");
  doc.body.appendChild(header);

  const resolved = window.PruneR.resolveFile(checkbox, doc, [checkbox]);
  assert.equal(resolved.path, "src/foo.spec.ts");
  assert.equal(resolved.container, header);
});

test("resolveFile reads a path from an aria-label", () => {
  const window = makeWindow();
  const doc = window.document;

  // Classic UI: the checkbox's own aria-label is "Viewed: <path>".
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "viewed";
  checkbox.setAttribute("aria-label", "Viewed: src/mocks/handlers.ts");
  doc.body.appendChild(checkbox);

  const resolved = window.PruneR.resolveFile(checkbox, doc, [checkbox]);
  assert.equal(resolved.path, "src/mocks/handlers.ts");
});

test("resolveFile stops at the file boundary and does not steal a neighbour's path", () => {
  const window = makeWindow();
  const doc = window.document;

  // Two files sharing one wrapper. No well-known container attributes so the
  // walk-up path is exercised; it must not attribute App.tsx to the test file.
  const wrapper = doc.createElement("div");
  wrapper.appendChild(newUiFile(doc, "src/App.tsx").container);
  const testFile = newUiFile(doc, "src/App.test.tsx");
  wrapper.appendChild(testFile.container);
  doc.body.appendChild(wrapper);

  const srcButton = wrapper.querySelectorAll('button[aria-pressed="false"]')[0];
  const controls = [srcButton, testFile.button];
  const resolved = window.PruneR.resolveFile(testFile.button, doc, controls);
  assert.equal(resolved.path, "src/App.test.tsx");
});

test("resolveFile returns null when the path cannot be resolved", () => {
  const window = makeWindow();
  const doc = window.document;
  const orphan = doc.createElement("button");
  orphan.setAttribute("aria-label", "Viewed");
  orphan.setAttribute("aria-pressed", "false");
  doc.body.appendChild(orphan);

  const resolved = window.PruneR.resolveFile(orphan, doc, [orphan]);
  assert.equal(resolved, null);
});

test("collectMarks returns only unviewed test-file controls with a resolvable path", () => {
  const window = makeWindow();
  const doc = window.document;
  const testFile = newUiFile(doc, "src/App.test.tsx");
  const viewedTestFile = newUiFile(doc, "src/Util.spec.ts", { viewed: true });
  const srcFile = newUiFile(doc, "src/App.tsx");
  for (const file of [testFile, viewedTestFile, srcFile]) {
    doc.body.appendChild(file.container);
  }

  const actions = window.PruneR.collectMarks(doc, new Set());
  assert.equal(actions.length, 1);
  assert.equal(actions[0].path, "src/App.test.tsx");
  assert.equal(actions[0].el, testFile.button);
});

test("collectMarks skips paths already processed", () => {
  const window = makeWindow();
  const doc = window.document;
  const testFile = newUiFile(doc, "src/App.test.tsx");
  doc.body.appendChild(testFile.container);

  const actions = window.PruneR.collectMarks(doc, new Set(["src/App.test.tsx"]));
  assert.equal(actions.length, 0);
});

test("collectMarks skips controls nested under an already-marked container", () => {
  const window = makeWindow();
  const doc = window.document;
  const testFile = newUiFile(doc, "src/App.test.tsx");
  doc.body.appendChild(testFile.container);
  testFile.container.setAttribute(window.PruneR.PROCESSED_ATTR, "1");

  const actions = window.PruneR.collectMarks(doc, new Set());
  assert.equal(actions.length, 0);
});