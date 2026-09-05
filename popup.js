/*
 * popup.js — the toolbar popup. Shows cumulative invited totals per Facebook
 * Page (logo + name + count), a grand total, and a Reset control. Reads the
 * `fbri_pages` map written by the content script and live-updates on change.
 *
 * renderPagesHTML() is pure and unit-tested offline (exposed on window.FBRIPopup).
 */
(function () {
  const KEY = "fbri_pages";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }

  function initials(name) {
    const parts = String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2);
    return (
      parts
        .map((p) => (p[0] ? p[0].toUpperCase() : ""))
        .join("") || "?"
    );
  }

  function timeAgo(ts) {
    if (!ts) return "";
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    return d + "d ago";
  }

  // Pure: build the popup body HTML from a `pages` map. Exposed for tests.
  function renderPagesHTML(pages) {
    const list = Object.keys(pages || {})
      .map((k) => pages[k])
      .filter(Boolean);

    if (!list.length) {
      return (
        '<div class="empty">No invites recorded yet.<br>' +
        "Open a Page post, invite reactors, and each Page’s total will appear here.</div>"
      );
    }

    list.sort((a, b) => (b.lastRunAt || 0) - (a.lastRunAt || 0));
    const total = list.reduce((n, p) => n + (p.invited || 0), 0);

    let html =
      '<div class="total">Total invited: <strong>' +
      total +
      "</strong> across " +
      list.length +
      " page" +
      (list.length > 1 ? "s" : "") +
      "</div>";

    html += '<ul class="pages">';
    list.forEach(function (p) {
      const logo = p.logoUrl
        ? '<img class="logo" src="' + esc(p.logoUrl) + '" alt="">'
        : '<span class="logo logo-fallback">' + esc(initials(p.name)) + "</span>";
      html +=
        '<li class="page" data-key="' +
        esc(p.id || "") +
        '">' +
        logo +
        '<span class="meta"><span class="name">' +
        esc(p.name || "Unknown Page") +
        "</span>" +
        '<span class="sub">' +
        timeAgo(p.lastRunAt) +
        "</span></span>" +
        '<span class="num">' +
        (p.invited || 0) +
        "</span>" +
        "</li>";
    });
    html += "</ul>";
    return html;
  }

  window.FBRIPopup = { renderPagesHTML: renderPagesHTML, initials: initials };

  function hasStorage() {
    return (
      typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
    );
  }

  function read() {
    return new Promise(function (resolve) {
      if (!hasStorage()) {
        resolve({});
        return;
      }
      chrome.storage.local.get(KEY, function (res) {
        resolve((res && res[KEY]) || {});
      });
    });
  }

  function clearAll() {
    return new Promise(function (resolve) {
      if (!hasStorage()) {
        resolve();
        return;
      }
      const payload = {};
      payload[KEY] = {};
      chrome.storage.local.set(payload, function () {
        resolve();
      });
    });
  }

  async function render() {
    const body = document.getElementById("body");
    if (!body) return;
    const pages = await read();
    body.innerHTML = renderPagesHTML(pages);
  }

  document.addEventListener("DOMContentLoaded", function () {
    render();
    const resetBtn = document.getElementById("reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", async function () {
        await clearAll();
        render();
      });
    }
    if (hasStorage() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === "local" && changes[KEY]) render();
      });
    }
  });
})();
