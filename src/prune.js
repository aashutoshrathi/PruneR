/**
 * PruneR – pure logic for spotting test files on GitHub PR diff pages.
 *
 * Kept free of DOM wiring (no storage, no observer, no listener setup) so the
 * rules here can be unit-tested in isolation. `content.js` drives all of this
 * against the live page.
 *
 * GitHub ships two diff experiences and the markup keeps changing, so path
 * resolution leans on a multi-stage fallback instead of a single selector:
 *   • New React UI ("/pull/N/changes"): `button[aria-label="Viewed"]` whose
 *     state is `aria-pressed`. The full path usually lives on a neighbouring
 *     "Expand all lines" button (`data-file-path`) or must be looked up in the
 *     file tree via the shared `#diff-<id>` anchor.
 *   • Classic UI ("/pull/N/files"): `input[type="checkbox"][name="viewed"]`.
 */
"use strict";

const PROCESSED_ATTR = "data-pruner-marked";

const TEST_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)__tests__\//,
  /(^|\/)test\//,
  /(^|\/)tests\//,
  /(^|\/)__mocks__\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)storybook\//i,
  /\.stories\.(ts|tsx|js|jsx)$/,
  /(^|\/)mocks?\//i,
  /(^|\/)fixtures?\//i,
  /(^|\/)testing\//i,
];

// Attributes that carry a full file path on GitHub's containers/buttons.
const PATH_ATTRS = [
  "data-tagsearch-path",
  "data-file-path",
  "data-path",
  "data-clipboard-text",
];

const PATH_ATTR_SELECTOR = PATH_ATTRS.map((a) => `[${a}]`).join(", ");

// Controls that toggle the "Viewed" state in either UI. State (not presence)
// decides whether a control still needs marking, so we look at all of them.
const CONTROL_SELECTOR = [
  'button[aria-label="Viewed"]',
  'button[aria-label="Not Viewed"]',
  'input[type="checkbox"][name="viewed"]',
  ".js-reviewed-checkbox",
].join(", ");

// GitHub pads file-path links with zero-width spaces, word joiners, and
// bidirectional control chars so the truncated middle renders nicely.
// Strip them all before pattern matching.
const cleanPath = (text) =>
  (text || "").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "").trim();

const isTestFile = (filePath) =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));

/**
 * Read the "Viewed" state from a control, handling both the classic checkbox
 * and the new React button (aria-pressed / aria-checked — and the odd case
 * where the button's label carries the state but no ARIA state attribute).
 */
const isViewed = (el) => {
  if (!el) return false;
  if (el.tagName === "INPUT") return Boolean(el.checked);
  const pressed = el.getAttribute("aria-pressed");
  if (pressed !== null) return pressed === "true";
  const checked = el.getAttribute("aria-checked");
  if (checked !== null) return checked === "true";
  return (el.getAttribute("aria-label") || "").trim().toLowerCase() === "viewed";
};

/**
 * Click a button or check a checkbox the way GitHub expects. Inputs get the
 * event pair React listens for (input + change); buttons just get clicked.
 */
const markControl = (el) => {
  if (el.tagName === "INPUT") {
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  } else {
    el.click();
  }
};

/**
 * Try to read a file path off a single element:
 *   1. known path data-attributes
 *   2. title containing a "/" (bare filenames are ambiguous — skip them)
 *   3. aria-label of the shape "...: <path>"
 */
const pathFromElement = (el) => {
  if (!el) return null;
  const attr = el.getAttribute;
  if (typeof attr !== "function") return null;

  for (const name of PATH_ATTRS) {
    const value = attr.call(el, name);
    if (value && value.trim()) return cleanPath(value);
  }

  const title = attr.call(el, "title");
  if (title && title.includes("/")) return cleanPath(title);

  const aria = attr.call(el, "aria-label");
  if (aria) {
    const match = aria.match(/\:\s*([^:]+)$/);
    if (match && match[1].trim()) return cleanPath(match[1]);
  }

  return null;
};

/**
 * Resolve a diff anchor (`<a href="#diff-…">`) to a real path via the file
 * tree, whose items share the anchor id and carry the full path in `title`.
 */
const treePathForAnchor = (doc, container) => {
  const anchor = container.querySelector('a[href^="#diff-"]');
  if (!anchor) return null;
  const id = anchor.getAttribute("href").slice(1);
  const selector = `a[data-testid="file-tree-list-item"][href="#${id}"]`;
  const item = doc.querySelector(selector);
  if (item) {
    const path = cleanPath(item.getAttribute("title") || item.textContent);
    if (path) return path;
  }
  return null;
};

/**
 * Find the file a control belongs to. Returns { path, container } or null.
 *
 * First tries well-known single-file containers, then walks up from the
 * control looking for a path-bearing element (the new UI keeps it on a
 * neighbouring button). The walk stops the moment an ancestor also contains
 * another unviewed control — past that point we'd be attributing a neighbour's
 * file to this control.
 */
const resolveFile = (control, doc, controls) => {
  const known = control.closest(
    '[data-diff-header-wrapper], [data-tagsearch-path], [data-file-path], ' +
      '[data-testid="file-tree-list-item"], [data-path], .file-header'
  );
  if (known) {
    const path =
      pathFromElement(known) ||
      pathFromElement(known.querySelector(PATH_ATTR_SELECTOR)) ||
      treePathForAnchor(doc, known);
    if (path) return { path, container: known };
  }

  let el = control;
  for (let depth = 0; el && depth < 30; depth++) {
    // Stop the moment an ancestor also contains another unviewed control —
    // past that point we'd be attributing a neighbour's file to this control.
    if (controls.some((o) => o !== control && el.contains(o))) return null;

    const direct = pathFromElement(el);
    if (direct) return { path: direct, container: el };

    const nested = el.querySelector ? el.querySelector(PATH_ATTR_SELECTOR) : null;
    const nestedPath = nested ? pathFromElement(nested) : null;
    if (nestedPath) return { path: nestedPath, container: el };

    el = el.parentElement;
  }
  return null;
};

/**
 * Collect every unviewed test-file control on the page that still needs
 * marking, paired with the DOM container it was resolved through (used to
 * stamp PROCESSED_ATTR) and the action that marks it seen.
 */
const collectMarks = (doc, processedPaths) => {
  const controls = Array.from(doc.querySelectorAll(CONTROL_SELECTOR)).filter(
    (el) => !isViewed(el)
  );

  const actions = [];
  for (const control of controls) {
    if (control.closest(`[${PROCESSED_ATTR}]`)) continue;

    const resolved = resolveFile(control, doc, controls);
    if (!resolved || processedPaths.has(resolved.path)) continue;
    if (!isTestFile(resolved.path)) continue;

    actions.push({
      el: control,
      container: resolved.container,
      path: resolved.path,
      mark: () => markControl(control),
    });
  }
  return actions;
};

const PruneR = {
  PROCESSED_ATTR,
  TEST_FILE_PATTERNS,
  cleanPath,
  isTestFile,
  isViewed,
  markControl,
  resolveFile,
  collectMarks,
};

if (typeof window !== "undefined") {
  window.PruneR = PruneR;
}