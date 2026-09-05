/*
 * dom.js — resilient, text/aria/role-based helpers for locating the reactions
 * dialog, its scrollable list, the Invite buttons, and Facebook block dialogs.
 * Deliberately avoids Facebook's randomized CSS class names.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const BLOCK_SIGNALS = [
    "temporarily blocked",
    "you’re temporarily blocked",
    "you're temporarily blocked",
    "you can’t use this feature",
    "you can't use this feature",
    "this feature isn’t available",
    "this feature isn't available",
    "you're going too fast",
    "you’re going too fast",
    "please try again later"
  ];

  FBRI.isVisible = function (el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (!style) return true;
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      style.opacity === "0"
    ) {
      return false;
    }
    return true;
  };

  // The currently open, topmost visible dialog (Facebook stacks dialogs).
  FBRI.getActiveDialog = function () {
    const dialogs = Array.prototype.slice.call(
      document.querySelectorAll('[role="dialog"]')
    );
    const visible = dialogs.filter(FBRI.isVisible);
    return visible.length ? visible[visible.length - 1] : null;
  };

  // Find the scrollable list container inside a dialog so we can lazy-load rows.
  FBRI.getScrollableContainer = function (root) {
    if (!root) return null;
    const candidates = [];
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const style = window.getComputedStyle(el);
      if (!style) continue;
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll") {
        candidates.push(el);
      }
    }
    if (!candidates.length) return root;
    candidates.sort(
      (a, b) =>
        b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight)
    );
    return candidates[0];
  };

  // Prefer the visible text of a button; fall back to its aria-label.
  FBRI.getButtonLabel = function (el) {
    let t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) {
      t = (el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    }
    return t;
  };

  function labelMatches(label, list) {
    const lower = label.toLowerCase();
    for (let i = 0; i < list.length; i++) {
      if (list[i].trim().toLowerCase() === lower) return true;
    }
    return false;
  }

  // All clickable "Invite" buttons within root, excluding "Invited"/other states.
  FBRI.findInviteButtons = function (root, settings) {
    if (!root) return [];
    const inviteLabels = settings.inviteLabels || ["Invite"];
    const invitedLabels = settings.invitedLabels || ["Invited"];
    const nodes = root.querySelectorAll('[role="button"], button');
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!FBRI.isVisible(el)) continue;
      if (el.getAttribute("aria-disabled") === "true" || el.disabled) continue;
      const label = FBRI.getButtonLabel(el);
      if (!label) continue;
      if (labelMatches(label, invitedLabels)) continue; // already invited
      if (labelMatches(label, inviteLabels)) out.push(el);
    }
    return out;
  };

  // Facebook's own bulk "Invite all" button, if present in the dialog. Matched
  // exactly or as a prefix (so "Invite all who reacted" matches "Invite all").
  FBRI.findBulkInviteButton = function (root, settings) {
    if (!root) return null;
    const labels = (settings.bulkInviteLabels || [])
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (!labels.length) return null;
    const nodes = root.querySelectorAll('[role="button"], button');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!FBRI.isVisible(el)) continue;
      if (el.getAttribute("aria-disabled") === "true" || el.disabled) continue;
      const label = FBRI.getButtonLabel(el).toLowerCase();
      if (!label) continue;
      for (let j = 0; j < labels.length; j++) {
        if (label === labels[j] || label.indexOf(labels[j]) === 0) return el;
      }
    }
    return null;
  };

  // All visible buttons within root whose exact label is in `labels`. Used to
  // count already-invited / already-following reactors.
  FBRI.findButtonsByLabels = function (root, labels) {
    if (!root || !labels || !labels.length) return [];
    const lc = labels
      .map((l) => String(l).trim().toLowerCase())
      .filter(Boolean);
    const nodes = root.querySelectorAll('[role="button"], button');
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!FBRI.isVisible(el)) continue;
      const label = FBRI.getButtonLabel(el).toLowerCase();
      if (!label) continue;
      for (let j = 0; j < lc.length; j++) {
        if (label === lc[j]) {
          out.push(el);
          break;
        }
      }
    }
    return out;
  };

  // Detect Facebook rate-limit / temporary-block dialogs so we can stop safely.
  FBRI.detectBlock = function () {
    const nodes = document.querySelectorAll('[role="dialog"], [role="alert"]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!FBRI.isVisible(el)) continue;
      const t = (el.innerText || "").toLowerCase();
      for (let j = 0; j < BLOCK_SIGNALS.length; j++) {
        if (t.indexOf(BLOCK_SIGNALS[j]) !== -1) return true;
      }
    }
    return false;
  };
})();
