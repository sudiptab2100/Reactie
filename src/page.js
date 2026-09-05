/*
 * page.js — best-effort detection of *which Facebook Page* the current post
 * belongs to, so per-Page invite totals can be recorded. Facebook doesn't
 * cleanly expose this, so we read the post author (Page name + logo) from the
 * post header, with URL / document.title fallbacks. Text/role-based; never
 * throws. The panel shows the result in an editable field so the user can
 * correct it when auto-detection is imperfect.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function normalizeId(name) {
    return (
      clean(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "unknown"
    );
  }

  function imgUrl(node) {
    if (!node) return "";
    return (
      node.getAttribute("xlink:href") ||
      node.getAttribute("href") ||
      node.getAttribute("src") ||
      ""
    );
  }

  function idFromHref(href) {
    if (!href) return "";
    const m = href.match(/(?:profile\.php\?id=|\/pages\/[^/]+\/|\/)(\d{6,})/);
    return m ? m[1] : "";
  }

  // Detect { id, name, logoUrl } for the Page that authored the visible post.
  FBRI.detectPageInfo = function (root) {
    root = root || document;
    const info = { id: "", name: "", logoUrl: "" };

    try {
      const scopes = [];
      const articles = root.querySelectorAll
        ? root.querySelectorAll('[role="article"]')
        : [];
      for (let i = 0; i < articles.length; i++) scopes.push(articles[i]);
      if (root.querySelectorAll) scopes.push(root);

      for (let s = 0; s < scopes.length && !info.name; s++) {
        const scope = scopes[s];
        if (!scope || !scope.querySelector) continue;

        let link =
          scope.querySelector(
            'h1 a[href], h2 a[href], h3 a[href], h4 a[href], strong a[href]'
          ) || scope.querySelector('a[role="link"][href]');

        if (link) {
          const name = clean(
            link.getAttribute("aria-label") || link.textContent
          );
          if (name && name.length <= 80) info.name = name;
          const id = idFromHref(link.getAttribute("href") || "");
          if (id) info.id = id;
        }

        const img = scope.querySelector("image, img");
        if (img) {
          const u = imgUrl(img);
          if (u) info.logoUrl = u;
        }
      }
    } catch (e) {
      /* ignore */
    }

    // document.title fallback, e.g. "(3) My Page | Facebook".
    if (!info.name) {
      try {
        let t = (document.title || "")
          .replace(/\s*\|\s*Facebook.*$/i, "")
          .replace(/^\(\d+\+?\)\s*/, "");
        t = clean(t);
        if (t && t.toLowerCase() !== "facebook") info.name = t;
      } catch (e) {
        /* ignore */
      }
    }

    // URL path fallback.
    if (!info.name) {
      try {
        const seg = (location.pathname || "")
          .split("/")
          .filter(Boolean)[0];
        if (seg && seg !== "profile.php" && seg !== "permalink.php") {
          info.name = decodeURIComponent(seg);
        }
      } catch (e) {
        /* ignore */
      }
    }

    if (!info.name) info.name = "Unknown Page";
    if (!info.id) info.id = normalizeId(info.name);
    return info;
  };
})();
