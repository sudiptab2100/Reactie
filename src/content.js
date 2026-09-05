/*
 * content.js — bootstrap. Mounts the floating panel and keeps it present
 * across Facebook's single-page-app navigation.
 */
(function () {
  const FBRI = window.FBRI;
  if (!FBRI || typeof FBRI.mountPanel !== "function") return;

  function ensurePanel() {
    if (!document.getElementById("fbri-panel")) {
      FBRI.mountPanel();
    }
  }

  function init() {
    ensurePanel();
    // Facebook is a SPA; re-mount if the panel ever gets removed.
    setInterval(ensurePanel, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
