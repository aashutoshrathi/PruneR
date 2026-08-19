/**
 * PruneR – Auto-mark test files as "Viewed" on GitHub PR diff pages.
 *
 * When a PR's diff is loaded, any file whose path matches a test-file pattern
 * gets its "Viewed" control automatically toggled on so it stops being noise
 * in your review queue.
 *
 * GitHub renders diffs lazily and (for large PRs) virtualizes them, so files
 * stream into the DOM as you scroll. Instead of scanning the page once and
 * hoping, a MutationObserver re-runs a scan every time the DOM changes and
 * marks a control the moment its file is in the DOM, whether it mounted with
 * the page or appeared a second ago. Once a path has been handled it is kept
 * in a session set, so a virtualized row that gets unmounted and remounted
 * (losing its DOM state) can never be clicked a second time and toggled back.
 *
 * The heavy lifting (pattern matching, path resolution, state detection) lives
 * in prune.js so it can be unit-tested; this file only wires it to the page.
 */
"use strict";

const STORAGE_KEY = "autoPrune";

// Paths already marked this session — survives virtualized rows being torn
// down and remounted, which would otherwise reset our attribute guard.
const processedPaths = new Set();

let scanTimer = null;

/**
 * Mark all currently-in-the-DOM test files as "Viewed". Returns true if any
 * file was marked.
 */
const scan = async () => {
  const { autoPrune } = await chrome.storage.sync.get(STORAGE_KEY);
  if (autoPrune === false) return false;

  let marked = 0;
  for (const action of window.PruneR.collectMarks(
    document,
    processedPaths
  )) {
    if (processedPaths.has(action.path)) continue;
    if (action.container) {
      action.container.setAttribute(window.PruneR.PROCESSED_ATTR, "1");
    }
    processedPaths.add(action.path);
    action.mark();
    marked++;
  }
  return marked > 0;
};

/**
 * Debounce scans: GitHub adds large DOM subtrees in single mutation batches
 * and we don't want to rebuild the control list for every node of every batch.
 */
const scheduleScan = () => {
  if (scanTimer !== null) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scan().catch((err) => console.error("[PruneR]", err));
  }, 150);
};

/**
 * Kick off an immediate scan, then watch for new controls streaming in (tabs
 * navigate client-side and diff rows mount lazily / as you scroll).
 */
const setup = () => {
  scan().catch((err) => console.error("[PruneR]", err));

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}