"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { loadPage, waitFor } = require("../test-utils/dom");
const { makeChromeMock } = require("../test-utils/chrome-mock");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const HIDE = "-label%3Adependencies";
const PRS_URL = "https://github.com/acme/repo/pulls";
const REPO_URL = "https://github.com/acme/repo";

const loadBackground = async ({
  storage = {},
  activeTabUrl = PRS_URL,
  fetchImpl = () => ({ ok: true, json: async () => ({ total_count: 3 }) }),
} = {}) => {
  const mock = makeChromeMock({ manifest, storage });
  mock.chrome.tabs.query = async () => [
    { id: 1, url: activeTabUrl, active: true, currentWindow: true },
  ];
  const window = loadPage({
    html: "",
    url: "chrome-extension://abc/background.html",
    scripts: ["background.js"],
    beforeParse(w) {
      w.chrome = mock.chrome;
      w.fetch = fetchImpl;
    },
  });
  await new Promise((r) => setTimeout(r, 20));
  return { window, mock };
};

test("onInstalled creates the context menus and defaults autoPrune on", async () => {
  const { mock } = await loadBackground();
  await mock.fireAsync("runtime.onInstalled", { reason: "install" });

  const createdIds = mock.calls.contextMenusCreate.map((c) => c.id);
  assert.ok(createdIds.includes("auto-prune-toggle"));
  assert.ok(createdIds.includes("open-options"));
  assert.equal(mock.storage.autoPrune, true);
  assert.equal(mock.storage.version, `v${manifest.version}`);
});

test("onInstalled does not override a user's saved autoPrune setting", async () => {
  const { mock } = await loadBackground({ storage: { autoPrune: false } });
  await mock.fireAsync("runtime.onInstalled", { reason: "install" });
  assert.equal(mock.storage.autoPrune, false);
});

test("context menu toggles autoPrune and updates the menu title", async () => {
  const { mock } = await loadBackground({ storage: { autoPrune: true } });
  await mock.fireAsync("contextMenus.onClicked", { menuItemId: "auto-prune-toggle" });

  assert.equal(mock.storage.autoPrune, false);
  const update = mock.calls.contextMenusUpdate.at(-1);
  assert.equal(update.id, "auto-prune-toggle");
  assert.ok(!update.opts.title.includes("✓"));

  await mock.fireAsync("contextMenus.onClicked", { menuItemId: "auto-prune-toggle" });
  assert.equal(mock.storage.autoPrune, true);
  assert.ok(mock.calls.contextMenusUpdate.at(-1).opts.title.includes("✓"));
});

test("context menu opens the options page", async () => {
  const { mock } = await loadBackground();
  let optionsOpened = false;
  mock.chrome.runtime.openOptionsPage = async () => {
    optionsOpened = true;
  };
  await mock.fireAsync("contextMenus.onClicked", { menuItemId: "open-options" });
  assert.equal(optionsOpened, true);
});

test("a storage change re-syncs the menu title", async () => {
  const { mock } = await loadBackground({ storage: { autoPrune: true } });
  await mock.chrome.storage.sync.set({ autoPrune: false });
  await waitFor(() => mock.calls.contextMenusUpdate.length > 0);
  assert.ok(!mock.calls.contextMenusUpdate.at(-1).opts.title.includes("✓"));
});

test("clicking the toolbar icon on a PR list page toggles the filter and shows the badge", async () => {
  const { mock } = await loadBackground();
  await mock.fireAsync("action.onClicked", { id: 1, url: PRS_URL });

  const update = mock.calls.tabUpdates.at(-1);
  assert.ok(update.opts.url.includes(HIDE), "expected the dependency filter query to be added");

  assert.equal(mock.storage.state, true);
  assert.equal(mock.storage.hiddenPRCount, 3);
  assert.equal(mock.calls.badgeText, "3");
});

test("clicking the toolbar icon on a non-PR-list page does nothing", async () => {
  const { mock } = await loadBackground({ activeTabUrl: REPO_URL });
  await mock.fireAsync("action.onClicked", { id: 1, url: REPO_URL });

  assert.equal(mock.calls.tabUpdates.length, 0);
  assert.equal(mock.storage.state, undefined);
});

test("tabs.onUpdated keeps state and badge in sync with the active tab", async () => {
  const { mock } = await loadBackground({ activeTabUrl: PRS_URL + "?" + HIDE + "+" });
  mock.fire("tabs.onUpdated", 1, { status: "complete" }, { active: true });

  await waitFor(() => mock.storage.state === true);
  assert.equal(mock.storage.state, true);
});

test("more complex page that is not the PR list is ignored", async () => {
  const { mock } = await loadBackground({ activeTabUrl: "https://github.com/acme/repo/issues/1" });
  await mock.fireAsync("action.onClicked", { id: 1, url: "https://github.com/acme/repo/issues/1" });
  assert.equal(mock.calls.tabUpdates.length, 0);
});