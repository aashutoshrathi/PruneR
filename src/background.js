const MANIFEST = chrome.runtime.getManifest();
const onInstalled = async () => {
  // TODO: Use this on options page
  chrome.storage.sync.set({ version: `v${MANIFEST.version}` });
};

const toggleState = () => {
  chrome.storage.sync.get(["state"], (result) => {
    const state = result.state || "off";
    chrome.storage.sync.set({ state: state === "on" ? "off" : "on" });
  });
};

const BASE_QUERY = "?q=is%3Apr+is%3Aopen+";
const HIDE_DEPENDABOT_QUERY = "-label%3Adependencies+";

const shouldExecuteOnTab = (host, pathname) => {
  return host === "github.com" && pathname.endsWith("/pulls");
};

const getAdditionQuery = (search) => {
  if (!search) {
    return BASE_QUERY + HIDE_DEPENDABOT_QUERY;
  }
  return HIDE_DEPENDABOT_QUERY;
};

chrome.action.onClicked.addListener(async (tab) => {
  const { id, url } = tab;
  const { search, host, pathname } = new URL(tab.url);
  if (shouldExecuteOnTab(host, pathname)) {
    console.log("Running undependabot");

    const { state } = await chrome.storage.sync.get(["state"]);
    console.log(state);

    if (search.includes(HIDE_DEPENDABOT_QUERY)) {
      chrome.tabs.update(id, { url: url.replace(HIDE_DEPENDABOT_QUERY, "") });
    } else {
      chrome.tabs.update(tab.id, { url: tab.url + getAdditionQuery(search) });
    }
    toggleState();
    // chrome.action.setIcon({ path: `../icons/${state}-icon.png` });
  }
});

chrome.runtime.onInstalled.addListener(onInstalled);
