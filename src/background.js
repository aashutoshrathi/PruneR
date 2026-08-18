const MANIFEST = chrome.runtime.getManifest();

const BASE_QUERY = "?q=is%3Apr+is%3Aopen+";
const HIDE_DEPENDABOT_QUERY = "-label%3Adependencies+";
const SEARCH_API_URL = "https://api.github.com/search/issues";

const syncContextMenu = async () => {
  const { autoPrune } = await chrome.storage.sync.get("autoPrune");
  chrome.contextMenus.update("auto-prune-toggle", {
    title: autoPrune
      ? "✓ Auto-mark test files as viewed"
      : "Auto-mark test files as viewed",
  });
};

const onInstalled = async () => {
  chrome.storage.sync.set({ version: `v${MANIFEST.version}` });

  // Create the context menu for auto-prune toggle and options
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "auto-prune-toggle",
    title: "Auto-mark test files as viewed",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "open-options",
    title: "PruneR Options",
    contexts: ["action"],
  });

  // Set default if not already set
  const { autoPrune } = await chrome.storage.sync.get("autoPrune");
  if (autoPrune === undefined) {
    await chrome.storage.sync.set({ autoPrune: true });
  }

  await syncContextMenu();
};

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "auto-prune-toggle") {
    const { autoPrune } = await chrome.storage.sync.get("autoPrune");
    const newVal = !autoPrune;
    await chrome.storage.sync.set({ autoPrune: newVal });
    await syncContextMenu();
  } else if (info.menuItemId === "open-options") {
    chrome.runtime.openOptionsPage();
  }
});

// Keep the context menu title in sync when the option is changed on the
// options page instead of the context menu.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "autoPrune" in changes) {
    syncContextMenu();
  }
});

const getStateString = (state) => {
  return state ? "on" : "off";
};

const shouldExecuteOnTab = (host, pathname) => {
  return host === "github.com" && pathname.endsWith("/pulls");
};

const getAdditionQuery = (search) => {
  if (!search) {
    return BASE_QUERY + HIDE_DEPENDABOT_QUERY;
  }
  return HIDE_DEPENDABOT_QUERY;
};

/*
  Returns the state of the current tab
*/
const getActiveTabState = async () => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.url) {
    return false;
  }

  const { search, host, pathname } = new URL(activeTab.url);
  if (shouldExecuteOnTab(host, pathname)) {
    return search.includes(HIDE_DEPENDABOT_QUERY);
  }
  return false;
};

/*
  Extracts the "owner/repo" pair out of a github.com URL.
*/
const getRepoFromUrl = (url) => {
  const { host, pathname } = new URL(url);
  if (host !== "github.com") {
    return null;
  }
  const match = pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
  return match ? `${match[1]}/${match[2]}` : null;
};

/*
  Asks the GitHub Search API how many open PRs carry the `dependencies`
  label (the ones PruneR hides). Falls back to null when the request fails,
  e.g. on private repositories or transient network errors.
*/
const getHiddenPRCount = async (repo) => {
  try {
    const query = `repo:${repo}%20is:pr%20is:open%20label:dependencies`;
    const res = await fetch(`${SEARCH_API_URL}?q=${query}&per_page=1`);
    if (!res.ok) {
      return null;
    }
    const { total_count } = await res.json();
    return typeof total_count === "number" ? total_count : null;
  } catch {
    return null;
  }
};

/*
  Shows the number of hidden dependabot PRs as a badge on the toolbar icon
  whenever the dependabot filter is active on the current tab.
*/
const syncBadge = async () => {
  const { state, hiddenPRCount } = await chrome.storage.sync.get([
    "state",
    "hiddenPRCount",
  ]);
  const show = state && hiddenPRCount !== undefined && hiddenPRCount !== null;
  chrome.action.setBadgeBackgroundColor({ color: "#6e7781" });
  chrome.action.setBadgeText({ text: show ? String(hiddenPRCount) : "" });
};

/*
  Updates the state of current tab in storage and icon
*/
const syncState = async (newState, hiddenPRCount = null) => {
  chrome.storage.sync.set({ state: newState });
  if (hiddenPRCount !== null) {
    chrome.storage.sync.set({ hiddenPRCount });
  }
  const iconPath = `../icons/${getStateString(newState)}-icon.png`;
  chrome.action.setIcon({
    path: iconPath,
  });
  await syncBadge();
};

/*
  Applies or removes the query on the current tab
*/
const prunePullRequests = async (tab, shouldPrune = false) => {
  const { id, url } = tab;
  const { search } = new URL(url);

  if (shouldPrune) {
    chrome.tabs.update(id, { url: url.replace(HIDE_DEPENDABOT_QUERY, "") });
  } else {
    chrome.tabs.update(id, { url: url + getAdditionQuery(search) });
  }
};

// CHROME LISTENERS
chrome.action.onClicked.addListener(async (tab) => {
  // Only ever touch the URL of the PR list page; leave every other page alone.
  const { host, pathname } = new URL(tab.url);
  if (!shouldExecuteOnTab(host, pathname)) {
    return;
  }

  const state = await getActiveTabState();
  prunePullRequests(tab, state);
  const newState = !state;

  let hiddenPRCount = null;
  if (newState) {
    const repo = getRepoFromUrl(tab.url);
    if (repo) {
      hiddenPRCount = await getHiddenPRCount(repo);
    }
  }
  syncState(newState, hiddenPRCount);
});

chrome.tabs.onActivated.addListener(async () => {
  const state = await getActiveTabState();
  syncState(state);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.active) {
    const state = await getActiveTabState();
    syncState(state);
  }
});

chrome.runtime.onInstalled.addListener(onInstalled);

// Sync the context menu title when the service worker starts
chrome.runtime.onStartup.addListener(syncContextMenu);