/*
 * config.js — default settings, label sets, and chrome.storage helpers.
 * Loaded first; attaches everything to the shared window.FBRI namespace.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  FBRI.DEFAULT_SETTINGS = {
    // Active speed mode: "safe" | "fast" | "turbo".
    mode: "safe",

    // Try Facebook's own bulk "Invite all" button before looping (all modes).
    useNativeInviteAll: true,

    // Keep the run going when the tab/window is in the background by playing a
    // practically silent tone (defeats Chrome's background-tab timer throttling).
    keepAwake: true,

    // --- Safe mode: randomized human-like delay between invites (ms) ---
    minDelayMs: 1500,
    maxDelayMs: 4000,

    // --- Fast mode: short randomized delay + optional small batches ---
    fastMinDelayMs: 200,
    fastMaxDelayMs: 600,
    fastBatchSize: 1,

    // --- Turbo mode: burst-click everything loaded, tiny pause between passes ---
    turboInterClickMs: 0,
    turboBatchPauseMs: 150,

    // Safety cap: stop after this many invites in one run. 0 = unlimited.
    maxPerRun: 50,

    // Optional longer cool-down. Pause after every N invites. 0 = disabled.
    longPauseEvery: 0,
    longPauseMs: 30000,

    // Exact visible button labels (case-insensitive). Edit these if your
    // Facebook UI is not in English.
    inviteLabels: ["Invite"],
    invitedLabels: ["Invited"],
    // Button label meaning the reactor already likes/follows the Page (skipped).
    followingLabels: ["Following"],

    // Native bulk-invite button labels (matched exact or as a prefix).
    bulkInviteLabels: ["Invite all", "Invite all who reacted", "Invite all friends"],

    // Scroll behavior while loading the lazy reactor list.
    scrollStepPx: 900,
    scrollWaitMs: 700,
    maxScrollRounds: 500
  };

  FBRI.STORAGE_KEY = "fbri_settings";

  function hasStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    );
  }

  FBRI.loadSettings = function () {
    return new Promise((resolve) => {
      try {
        if (!hasStorage()) {
          resolve(Object.assign({}, FBRI.DEFAULT_SETTINGS));
          return;
        }
        chrome.storage.local.get(FBRI.STORAGE_KEY, (res) => {
          const saved = (res && res[FBRI.STORAGE_KEY]) || {};
          resolve(Object.assign({}, FBRI.DEFAULT_SETTINGS, saved));
        });
      } catch (e) {
        resolve(Object.assign({}, FBRI.DEFAULT_SETTINGS));
      }
    });
  };

  FBRI.saveSettings = function (settings) {
    return new Promise((resolve) => {
      try {
        if (!hasStorage()) {
          resolve(false);
          return;
        }
        const payload = {};
        payload[FBRI.STORAGE_KEY] = settings;
        chrome.storage.local.set(payload, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  };
})();
