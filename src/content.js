/**
 * PruneR – Auto-mark test files as "Viewed" on GitHub PR file pages.
 *
 * When a PR's "Files changed" tab is loaded, any file whose path matches a
 * test-file pattern gets its "Viewed" checkbox automatically checked so it
 * stops being noise in your review queue.
 *
 * Supports both the newer file-tree sidebar and the classic diff file headers.
 * Checks the `autoPrune` storage flag so users can toggle the feature on/off
 * via the extension's context menu (right-click the toolbar icon).
 */

const STORAGE_KEY = "autoPrune";

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

/**
 * Try to extract a file path from a DOM element that contains a "Viewed"
 * checkbox. Returns null if no path can be found.
 *
 * Strategies (from most to least specific):
 * 1. data-path or data-file-header-path on the parent file-header element
 * 2. title attribute on the closest anchor or span
 * 3. text content of the file-info / file-info-text element nearby
 * 4. aria-label on the checkbox itself
 * 5. text content of the closest anchor or span
 */
const getFilePath = (checkbox) => {
  // Walk up to find the containing file-header or file-tree-list-item
  const container =
    checkbox.closest(
      '[data-file-header-path], [data-path], [data-testid="file-tree-list-item"], .file-header'
    ) || checkbox.parentElement;

  // Strategy 1: data attributes on the header
  if (container) {
    const dataPath =
      container.getAttribute("data-file-header-path") ||
      container.getAttribute("data-path");
    if (dataPath) return dataPath;
  }

  // Strategy 2: title attribute on an anchor or span inside the container
  if (container) {
    const titledEl = container.querySelector("a[title], span[title]");
    if (titledEl?.getAttribute("title")) {
      return titledEl.getAttribute("title");
    }
  }

  // Strategy 3: file-info-text content
  if (container) {
    const infoEl = container.querySelector(
      ".file-info-text, [data-file-info-text]"
    );
    if (infoEl?.textContent?.trim()) return infoEl.textContent.trim();
  }

  // Strategy 4: aria-label on the checkbox
  const ariaLabel = checkbox.getAttribute("aria-label");
  if (ariaLabel) {
    // Often in the form "Viewed: path/to/file.ts"
    const match = ariaLabel.match(/Viewed:\s*(.+)/i);
    if (match) return match[1].trim();
  }

  // Strategy 5: text content of the closest link or titled element
  if (container) {
    const link = container.querySelector("a");
    if (link?.textContent?.trim()) return link.textContent.trim();
  }

  return null;
};

/**
 * Mark all test files as "Viewed" on the current page.
 * Returns true if any checkboxes were found (even if none were test files).
 */
const markTestFilesSeen = async () => {
  // Check the auto-prune flag
  const { autoPrune } = await chrome.storage.sync.get(STORAGE_KEY);
  if (autoPrune === false) return false;

  // Get ALL "Viewed" checkboxes on the page — covers both the file tree
  // sidebar and the classic diff file headers.
  const checkboxes = document.querySelectorAll(
    'input[type="checkbox"][name="viewed"]:not(:checked)'
  );
  if (!checkboxes.length) return false;

  let marked = false;
  checkboxes.forEach((checkbox) => {
    const filePath = getFilePath(checkbox);
    if (!filePath || !isTestFile(filePath)) return;

    // Check the checkbox
    checkbox.checked = true;

    // GitHub uses React, so we need to dispatch native events to let
    // React know the state changed.
    checkbox.dispatchEvent(
      new Event("input", { bubbles: true, cancelable: true })
    );
    checkbox.dispatchEvent(
      new Event("change", { bubbles: true, cancelable: true })
    );

    marked = true;
  });

  return marked;
};

/**
 * Set up a MutationObserver that watches for new "Viewed" checkboxes
 * being added to the page (e.g. when expanding diffs or navigating).
 */
const setupObserver = () => {
  const observer = new MutationObserver(() => {
    markTestFilesSeen();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also run once immediately in case the DOM is already ready
  markTestFilesSeen();
};

// Kick off as soon as the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupObserver);
} else {
  setupObserver();
}