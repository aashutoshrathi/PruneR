"use strict";

/**
 * A tiny in-memory `chrome` API mock for the node:test suite. Captures the
 * event handlers the extension registers so tests can fire them, and records
 * calls for assertions.
 */
function makeChromeMock({ manifest, storage: initialStorage = {} } = {}) {
  const storage = { ...initialStorage };
  const storageListeners = new Set();
  const listeners = new Map();
  const calls = { contextMenusCreate: [], contextMenusUpdate: [], tabUpdates: [] };

  const on = (name) => ({
    addListener(cb) {
      const set = listeners.get(name) || new Set();
      set.add(cb);
      listeners.set(name, set);
    },
    removeListener(cb) {
      listeners.get(name)?.delete(cb);
    },
    hasListener(cb) {
      return listeners.get(name)?.has(cb) || false;
    },
  });

  const runtime = {
    getManifest: () => manifest,
    openOptionsPage: async () => {},
    onInstalled: on("runtime.onInstalled"),
    onStartup: on("runtime.onStartup"),
  };

  const sync = {
    async get(keysOrNull) {
      if (keysOrNull == null) return { ...storage };
      const keys = Array.isArray(keysOrNull) ? keysOrNull : [keysOrNull];
      const out = {};
      for (const key of keys) {
        if (key in storage) out[key] = storage[key];
      }
      return out;
    },
    async set(values) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: storage[key], newValue: value };
        storage[key] = value;
      }
      for (const cb of storageListeners) cb(changes, "sync");
    },
    async remove(keysOrNull) {
      const keys = Array.isArray(keysOrNull) ? keysOrNull : [keysOrNull];
      for (const key of keys) {
        if (key in storage) {
          delete storage[key];
        }
      }
    },
  };

  const chrome = {
    storage: {
      sync,
      onChanged: { addListener: (cb) => storageListeners.add(cb) },
    },
    contextMenus: {
      removeAll: async () => {},
      create: (opts) => calls.contextMenusCreate.push(opts),
      update: (id, opts) => calls.contextMenusUpdate.push({ id, opts }),
      onClicked: on("contextMenus.onClicked"),
    },
    runtime,
    tabs: {
      query: async () => [],
      update: async (id, opts) => calls.tabUpdates.push({ id, opts }),
      onActivated: on("tabs.onActivated"),
      onUpdated: on("tabs.onUpdated"),
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async (opts) => {
        calls.badgeText = opts.text;
      },
      setIcon: async () => {},
      onClicked: on("action.onClicked"),
    },
  };

  return {
    chrome,
    storage,
    listeners,
    calls,
    fire(eventName, ...args) {
      for (const cb of listeners.get(eventName) || []) cb(...args);
    },
    async fireAsync(eventName, ...args) {
      for (const cb of listeners.get(eventName) || []) await cb(...args);
    },
  };
}

module.exports = { makeChromeMock };