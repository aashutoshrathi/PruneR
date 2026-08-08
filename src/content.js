/**
 * PruneR – Auto-mark test files as "Viewed" on GitHub PR file pages.
 *
 * When a PR file tree is loaded, any file whose path matches a test-file
 * pattern is automatically checked as "Viewed" so it stops being noise in
 * the review queue. The checkbox is toggled silently — no click events are
 * fired, just the underlying input state and React's data attributes.
 */

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
 * Wait for the file tree to be present and then mark test files as viewed.
 * Uses a MutationObserver so newly loaded files (e.g., when expanding diffs)
 * are also handled.
 */
const markTestFilesSeen = () => {
  const fileTree = document.querySelector('[data-file-tree]');
  if (!fileTree) return false;

  const fileRows = fileTree.querySelectorAll(
    '[data-file-tree-list] [data-testid="file-tree-list-item"]'
  );

  fileRows.forEach((row) => {
    // Get the file path from the anchor title or text content
    const link = row.querySelector('a[title], span[title]');
    const filePath = link?.getAttribute('title') || link?.textContent || '';
    if (!filePath || !isTestFile(filePath)) return;

    // Find the "Viewed" checkbox inside this row
    const checkbox = row.querySelector(
      'input[type="checkbox"][name="viewed"]'
    );
    if (!checkbox || checkbox.checked) return;

    // Check the checkbox
    checkbox.checked = true;

    // GitHub uses React, so we need to dispatch an input event to
    // let React know the checkbox state changed.
    checkbox.dispatchEvent(
      new Event('input', { bubbles: true, cancelable: true })
    );
    checkbox.dispatchEvent(
      new Event('change', { bubbles: true, cancelable: true })
    );
  });

  return true;
};

/**
 * Observe the PR files page and mark test files as viewed whenever the
 * file tree is updated (initial load, expanding files, navigating diffs).
 */
const setupObserver = () => {
  // Watch for the file tree to appear (SPA navigation)
  const observer = new MutationObserver(() => {
    if (markTestFilesSeen()) {
      // File tree found and processed — we can keep observing for dynamic updates
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also run once immediately in case the DOM is already ready
  markTestFilesSeen();
};

// Kick off as soon as the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupObserver);
} else {
  setupObserver();
}