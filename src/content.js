/**
 * PruneR – Auto-mark test files as "Viewed" on GitHub PR diff pages.
 *
 * When a PR's diff is loaded, any file whose path matches a test-file pattern
 * gets its "Viewed" control automatically toggled on so it stops being noise
 * in your review queue.
 *
 * GitHub ships two diff experiences and PruneR supports both:
 *   • New React UI ("/pull/N/changes"): a <button aria-label="Not Viewed">.
 *   • Classic UI  ("/pull/N/files"):    an <input type="checkbox" name="viewed">.
 *
 * The content script loads on every "/pull/*" page (the pages navigate
 * client-side, so we can't scope tightly to the diff URL) and a
 * MutationObserver re-runs as diffs stream in or the user switches tabs.
 * Checks the `autoPrune` storage flag so users can toggle the feature on/off
 * via the extension's context menu (right-click the toolbar icon).
 */

const STORAGE_KEY = "autoPrune";

// Marks a control we've already handled so the MutationObserver doesn't
// re-toggle it (clicking the new button is a toggle, not a set).
const PROCESSED_ATTR = "data-pruner-marked";

const TEST_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\/__mocks__\//,
  /\/__fixtures__\//,
  /\/__snapshots__\//,
  /\.snap$/,
  /\/storybook\//i,
  /\.stories\.(ts|tsx|js|jsx)$/,
  /\/mocks?\//i,
  /\/fixtures?\//i,
  /\/testing\//i,
];

const isTestFile = (filePath) =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));

// GitHub pads file-path links with bidirectional/zero-width control chars so
// the truncated middle renders nicely. Strip them before pattern matching.
const cleanPath = (text) =>
  (text || "").replace(/[‎‏‪-‮⁦-⁩]/g, "").trim();

/**
 * Try to extract a file path from a DOM element that contains a "Viewed"
 * control (either the new button or the classic checkbox). Returns null if
 * no path can be found.
 */
const getFilePath = (control) => {
  // New React UI: the diff header wraps the control and a link to the file
  // anchor whose text is the full path.
  const headerWrapper = control.closest("[data-diff-header-wrapper]");
  if (headerWrapper) {
    const anchor = headerWrapper.querySelector('a[href^="#diff-"]');
    const path = cleanPath(anchor?.textContent);
    if (path) return path;
  }

  // Classic UI: walk up to the file header / file-tree item.
  const container =
    control.closest(
      '[data-file-header-path], [data-path], [data-testid="file-tree-list-item"], .file-header'
    ) || control.parentElement;

  if (container) {
    const dataPath =
      container.getAttribute("data-file-header-path") ||
      container.getAttribute("data-path");
    if (dataPath) return dataPath;

    const titledEl = container.querySelector("a[title], span[title]");
    if (titledEl?.getAttribute("title")) return titledEl.getAttribute("title");

    const infoEl = container.querySelector(
      ".file-info-text, [data-file-info-text]"
    );
    if (infoEl?.textContent?.trim()) return infoEl.textContent.trim();
  }

  // aria-label on the checkbox is often "Viewed: path/to/file.ts".
  const ariaLabel = control.getAttribute("aria-label");
  const match = ariaLabel?.match(/Viewed:\s*(.+)/i);
  if (match) return match[1].trim();

  if (container) {
    const link = container.querySelector("a");
    if (link?.textContent?.trim()) return link.textContent.trim();
  }

  return null;
};

/**
 * Collect the unmarked "Viewed" controls on the page from both UIs, each
 * paired with the action that marks it seen.
 */
const getViewedControls = () => {
  const controls = [];

  // New UI: button that is currently "Not Viewed" (aria-pressed=false).
  document
    .querySelectorAll(
      'button[aria-pressed="false"][aria-label="Not Viewed"]:not([' +
        PROCESSED_ATTR +
        "])"
    )
    .forEach((button) => controls.push({ el: button, mark: () => button.click() }));

  // Classic UI: unchecked checkbox — set it and let React know via events.
  document
    .querySelectorAll(
      'input[type="checkbox"][name="viewed"]:not(:checked):not([' +
        PROCESSED_ATTR +
        "])"
    )
    .forEach((checkbox) =>
      controls.push({
        el: checkbox,
        mark: () => {
          checkbox.checked = true;
          checkbox.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true })
          );
          checkbox.dispatchEvent(
            new Event("change", { bubbles: true, cancelable: true })
          );
        },
      })
    );

  return controls;
};

/**
 * Mark all test files as "Viewed" on the current page.
 * Returns true if any file was marked.
 */
const markTestFilesSeen = async () => {
  const { autoPrune } = await chrome.storage.sync.get(STORAGE_KEY);
  if (autoPrune === false) return false;

  let marked = false;
  for (const { el, mark } of getViewedControls()) {
    const filePath = getFilePath(el);
    if (!filePath || !isTestFile(filePath)) continue;

    // Guard against the observer re-toggling before GitHub updates the
    // control's state asynchronously.
    el.setAttribute(PROCESSED_ATTR, "1");
    mark();
    marked = true;
  }

  return marked;
};

/**
 * Set up a MutationObserver that watches for new "Viewed" controls being
 * added to the page (diffs stream in lazily and tabs navigate client-side).
 */
const setupObserver = () => {
  const observer = new MutationObserver(() => {
    markTestFilesSeen();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also run once immediately in case the DOM is already ready.
  markTestFilesSeen();
};

// Kick off as soon as the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupObserver);
} else {
  setupObserver();
}
