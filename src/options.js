const STORAGE_KEY = "autoPrune";

const elements = {
  autoPrune: document.getElementById("autoPrune"),
  version: document.getElementById("version"),
};

const init = async () => {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = `v${manifest.version}`;

  const { autoPrune } = await chrome.storage.sync.get(STORAGE_KEY);
  elements.autoPrune.checked = autoPrune !== false;
};

elements.autoPrune.addEventListener("change", async () => {
  const autoPrune = elements.autoPrune.checked;
  await chrome.storage.sync.set({ [STORAGE_KEY]: autoPrune });
});

// Keep the toggle in sync when autoPrune is changed elsewhere, e.g. via the
// toolbar context menu while the options page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && STORAGE_KEY in changes) {
    elements.autoPrune.checked = changes[STORAGE_KEY].newValue !== false;
  }
});

init();