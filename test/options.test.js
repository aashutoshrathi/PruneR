"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { loadPage, waitFor } = require("../test-utils/dom");
const { makeChromeMock } = require("../test-utils/chrome-mock");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const optionsHtml = `
  <p id="version">v0.0.0</p>
  <input type="checkbox" id="autoPrune" />
`;

const loadOptions = async (storage) => {
  const mock = makeChromeMock({ manifest, storage });
  const window = loadPage({
    html: optionsHtml,
    url: "chrome-extension://abc/options.html",
    scripts: ["options.js"],
    beforeParse(w) {
      w.chrome = mock.chrome;
    },
  });
  const expected = storage.autoPrune !== false;
  await waitFor(
    () =>
      window.document.getElementById("version").textContent !== "v0.0.0" &&
      window.document.getElementById("autoPrune").checked === expected
  );
  return { window, mock };
};

test("init shows the manifest version", async () => {
  const { window } = await loadOptions({ autoPrune: true });
  assert.equal(
    window.document.getElementById("version").textContent,
    `v${manifest.version}`
  );
});

test("init checks the toggle when autoPrune is enabled", async () => {
  const { window } = await loadOptions({ autoPrune: true });
  assert.equal(window.document.getElementById("autoPrune").checked, true);
});

test("init leaves the toggle unchecked when autoPrune is disabled", async () => {
  const { window } = await loadOptions({ autoPrune: false });
  assert.equal(window.document.getElementById("autoPrune").checked, false);
});

test("toggling the checkbox persists autoPrune to storage", async () => {
  const { window, mock } = await loadOptions({ autoPrune: true });

  const checkbox = window.document.getElementById("autoPrune");
  checkbox.checked = false;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  await waitFor(() => mock.storage.autoPrune === false);
  assert.equal(mock.storage.autoPrune, false);
});

test("an external autoPrune change stays in sync with the toggle", async () => {
  const { window, mock } = await loadOptions({ autoPrune: true });

  await mock.chrome.storage.sync.set({ autoPrune: false });

  await waitFor(
    () => window.document.getElementById("autoPrune").checked === false
  );
  assert.equal(window.document.getElementById("autoPrune").checked, false);
});