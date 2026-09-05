/*
 * stats.js — cumulative, per-Page invite totals persisted in chrome.storage.
 * Shape stored under FBRI.PAGES_KEY:
 *   { [key]: { id, name, logoUrl, invited, lastRunAt } }
 * key = numeric Page id when known, else the normalized Page name.
 *
 * The storage backend is injectable (FBRI._statsStore) so the read/modify/write
 * logic can be unit-tested offline with an in-memory stub.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const KEY = "fbri_pages";
  FBRI.PAGES_KEY = KEY;

  function hasChromeStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    );
  }

  // Default backend: chrome.storage.local. Overridable for tests.
  function backend() {
    if (FBRI._statsStore) return FBRI._statsStore;
    return {
      get: function () {
        return new Promise(function (resolve) {
          try {
            if (!hasChromeStorage()) {
              resolve({});
              return;
            }
            chrome.storage.local.get(KEY, function (res) {
              resolve((res && res[KEY]) || {});
            });
          } catch (e) {
            resolve({});
          }
        });
      },
      set: function (pages) {
        return new Promise(function (resolve) {
          try {
            if (!hasChromeStorage()) {
              resolve(false);
              return;
            }
            const payload = {};
            payload[KEY] = pages;
            chrome.storage.local.set(payload, function () {
              resolve(true);
            });
          } catch (e) {
            resolve(false);
          }
        });
      }
    };
  }

  FBRI.pageKey = function (info) {
    if (info && info.id) return String(info.id);
    if (info && info.name) {
      return (
        String(info.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "unknown"
      );
    }
    return "unknown";
  };

  FBRI.statsRead = function () {
    return backend().get();
  };

  // Add `delta` invites to a Page's cumulative total and refresh its metadata.
  FBRI.statsAdd = async function (info, delta) {
    delta = delta || 0;
    if (delta <= 0) return null;
    const store = backend();
    const pages = (await store.get()) || {};
    const key = FBRI.pageKey(info);
    const cur =
      pages[key] || { id: key, name: "", logoUrl: "", invited: 0, lastRunAt: 0 };
    cur.id = key;
    cur.invited = (cur.invited || 0) + delta;
    if (info && info.name) cur.name = info.name;
    if (info && info.logoUrl) cur.logoUrl = info.logoUrl;
    cur.lastRunAt = Date.now();
    pages[key] = cur;
    await store.set(pages);
    return cur;
  };

  // Clear one Page (by key) or all Pages when no key is given.
  FBRI.statsReset = async function (key) {
    const store = backend();
    const pages = (await store.get()) || {};
    if (key) {
      delete pages[key];
    } else {
      for (const k in pages) if (pages.hasOwnProperty(k)) delete pages[k];
    }
    await store.set(pages);
    return pages;
  };
})();
