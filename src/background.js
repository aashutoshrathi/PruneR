const MANIFEST = chrome.runtime.getManifest();

const BASE_QUERY = "?q=is%3Apr+is%3Aopen+";
const HIDE_DEPENDABOT_QUERY = "-label%3Adependencies+";

const onInstalled = async () => {
  // TODO: Use this on options page
  chrome.storage.sync.set({ version: `v${MANIFEST.version}` });
};

const getStateString = (state) => {
  return state ? "on" : "off";
};

const setState = (newState) => {
  chrome.storage.sync.set({ state: newState });
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
  Updates the state of current tab in storage and icon
*/
const syncState = async (newState) => {
  setState(newState);
  const iconPath = `../icons/${getStateString(newState)}-icon.png`;
  chrome.action.setIcon({
    path: iconPath,
  });
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
  const state = await getActiveTabState();
  prunePullRequests(tab, state);
  const newState = !state;
  syncState(newState);
});

chrome.tabs.onActivated.addListener(async () => {
  const state = await getActiveTabState();
  syncState(state);
});

chrome.runtime.onInstalled.addListener(onInstalled);
