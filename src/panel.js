/*
 * panel.js — the floating control panel injected onto Facebook. Provides
 * Start / Stop, a speed-mode selector, native "Invite all" toggle, a Dry-run
 * toggle, a "keep running in background" toggle, an editable detected-Page
 * field (with logo), live progress including the already-invited / following
 * counts, per-mode settings, and safety warnings.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const PANEL_ID = "fbri-panel";

  const WARNINGS = {
    safe: "",
    fast: "Fast: short delays — moderate risk of a temporary Facebook block.",
    turbo:
      "⚠ Turbo sends very fast — higher risk of a temporary Facebook block.",
    api:
      "⚠ Experimental API mode — fragile; captures Facebook’s own request and replays it. Falls back to Turbo if capture fails. Higher block/ToS risk."
  };

  const TEMPLATE = [
    '<div class="fbri-header">',
    '  <span class="fbri-title">Reactor Inviter</span>',
    '  <button class="fbri-min" title="Minimize">–</button>',
    "</div>",
    '<div class="fbri-body">',
    '  <div class="fbri-field fbri-page-row"><span>Page</span>',
    '    <span class="fbri-page-wrap">',
    '      <img class="fbri-page-logo" alt="">',
    '      <input type="text" class="fbri-page" placeholder="Auto-detected…">',
    "    </span>",
    "  </div>",
    '  <div class="fbri-row">',
    '    <button class="fbri-start">Invite reactors</button>',
    '    <button class="fbri-stop" disabled>Stop</button>',
    "  </div>",
    '  <div class="fbri-field"><span>Speed mode</span>',
    '    <select class="fbri-mode">',
    '      <option value="safe">Safe (1.5–4s, lowest risk)</option>',
    '      <option value="fast">Fast (short delays)</option>',
    '      <option value="turbo">Turbo (all at once)</option>',
    '      <option value="api">Experimental API (GraphQL)</option>',
    "    </select>",
    "  </div>",
    '  <label class="fbri-check"><input type="checkbox" class="fbri-native"> Use native “Invite all” if available</label>',
    '  <label class="fbri-check"><input type="checkbox" class="fbri-keep"> Keep running in background</label>',
    '  <label class="fbri-check"><input type="checkbox" class="fbri-dry"> Dry run (preview, no clicks)</label>',
    '  <div class="fbri-warn"></div>',
    '  <div class="fbri-status">Open a post, click its reactions count, then press “Invite reactors”.</div>',
    '  <div class="fbri-stats"><span class="fbri-count">0</span> invited this run</div>',
    '  <div class="fbri-stats2">Already invited: <span class="fbri-already">0</span> · Following: <span class="fbri-following">0</span></div>',
    '  <details class="fbri-settings">',
    "    <summary>Settings</summary>",
    '    <div class="fbri-field"><span>Safe delay min (ms)</span><input type="number" min="0" class="fbri-min-delay"></div>',
    '    <div class="fbri-field"><span>Safe delay max (ms)</span><input type="number" min="0" class="fbri-max-delay"></div>',
    '    <div class="fbri-field"><span>Fast delay min (ms)</span><input type="number" min="0" class="fbri-fast-min"></div>',
    '    <div class="fbri-field"><span>Fast delay max (ms)</span><input type="number" min="0" class="fbri-fast-max"></div>',
    '    <div class="fbri-field"><span>Turbo pause (ms)</span><input type="number" min="0" class="fbri-turbo-pause"></div>',
    '    <div class="fbri-field"><span>API concurrency</span><input type="number" min="1" class="fbri-api-conc"></div>',
    '    <div class="fbri-field"><span>Max per run (0=∞)</span><input type="number" min="0" class="fbri-max-run"></div>',
    '    <div class="fbri-field"><span>Long pause every</span><input type="number" min="0" class="fbri-pause-every"></div>',
    '    <div class="fbri-field"><span>Long pause (ms)</span><input type="number" min="0" class="fbri-pause-ms"></div>',
    '    <div class="fbri-field"><span>Invite labels</span><input type="text" class="fbri-invite-labels"></div>',
    '    <div class="fbri-field"><span>Invited labels</span><input type="text" class="fbri-invited-labels"></div>',
    '    <div class="fbri-field"><span>Following labels</span><input type="text" class="fbri-following-labels"></div>',
    '    <div class="fbri-field"><span>Invite-all labels</span><input type="text" class="fbri-bulk-labels"></div>',
    '    <button class="fbri-save">Save settings</button>',
    "  </details>",
    "</div>"
  ].join("");

  function el(root, sel) {
    return root.querySelector(sel);
  }

  function setLogo(root, url) {
    const img = el(root, ".fbri-page-logo");
    if (!img) return;
    if (url) {
      img.src = url;
      img.style.display = "inline-block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
    }
  }

  function detectAndFillPage(root) {
    try {
      const info =
        typeof FBRI.detectPageInfo === "function"
          ? FBRI.detectPageInfo(document)
          : null;
      if (!info) return;
      const inp = el(root, ".fbri-page");
      if (!inp) return;
      if (!inp.dataset.edited && info.name && info.name !== "Unknown Page") {
        inp.value = info.name;
      }
      if (info.logoUrl) {
        inp.dataset.logo = info.logoUrl;
        setLogo(root, info.logoUrl);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function fillForm(root, s) {
    el(root, ".fbri-mode").value = s.mode || "safe";
    el(root, ".fbri-native").checked = s.useNativeInviteAll !== false;
    el(root, ".fbri-keep").checked = s.keepAwake !== false;
    el(root, ".fbri-min-delay").value = s.minDelayMs;
    el(root, ".fbri-max-delay").value = s.maxDelayMs;
    el(root, ".fbri-fast-min").value = s.fastMinDelayMs;
    el(root, ".fbri-fast-max").value = s.fastMaxDelayMs;
    el(root, ".fbri-turbo-pause").value = s.turboBatchPauseMs;
    el(root, ".fbri-api-conc").value = s.apiConcurrency;
    el(root, ".fbri-max-run").value = s.maxPerRun;
    el(root, ".fbri-pause-every").value = s.longPauseEvery;
    el(root, ".fbri-pause-ms").value = s.longPauseMs;
    el(root, ".fbri-invite-labels").value = (s.inviteLabels || []).join(", ");
    el(root, ".fbri-invited-labels").value = (s.invitedLabels || []).join(", ");
    el(root, ".fbri-following-labels").value = (s.followingLabels || []).join(
      ", "
    );
    el(root, ".fbri-bulk-labels").value = (s.bulkInviteLabels || []).join(", ");
  }

  function intOr(v, fallback) {
    const n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  function splitLabels(v, fallback) {
    const parts = String(v || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.length ? parts : fallback;
  }

  function readForm(root, base) {
    let minD = intOr(el(root, ".fbri-min-delay").value, base.minDelayMs);
    let maxD = intOr(el(root, ".fbri-max-delay").value, base.maxDelayMs);
    if (maxD < minD) maxD = minD;
    let fmin = intOr(el(root, ".fbri-fast-min").value, base.fastMinDelayMs);
    let fmax = intOr(el(root, ".fbri-fast-max").value, base.fastMaxDelayMs);
    if (fmax < fmin) fmax = fmin;
    return Object.assign({}, base, {
      mode: el(root, ".fbri-mode").value || "safe",
      useNativeInviteAll: el(root, ".fbri-native").checked,
      keepAwake: el(root, ".fbri-keep").checked,
      minDelayMs: minD,
      maxDelayMs: maxD,
      fastMinDelayMs: fmin,
      fastMaxDelayMs: fmax,
      turboBatchPauseMs: intOr(
        el(root, ".fbri-turbo-pause").value,
        base.turboBatchPauseMs
      ),
      apiConcurrency: Math.max(
        1,
        intOr(el(root, ".fbri-api-conc").value, base.apiConcurrency)
      ),
      maxPerRun: intOr(el(root, ".fbri-max-run").value, base.maxPerRun),
      longPauseEvery: intOr(
        el(root, ".fbri-pause-every").value,
        base.longPauseEvery
      ),
      longPauseMs: intOr(el(root, ".fbri-pause-ms").value, base.longPauseMs),
      inviteLabels: splitLabels(
        el(root, ".fbri-invite-labels").value,
        base.inviteLabels
      ),
      invitedLabels: splitLabels(
        el(root, ".fbri-invited-labels").value,
        base.invitedLabels
      ),
      followingLabels: splitLabels(
        el(root, ".fbri-following-labels").value,
        base.followingLabels
      ),
      bulkInviteLabels: splitLabels(
        el(root, ".fbri-bulk-labels").value,
        base.bulkInviteLabels
      )
    });
  }

  function setRunningUI(root, running) {
    el(root, ".fbri-start").disabled = running;
    el(root, ".fbri-stop").disabled = !running;
  }

  function updateWarning(root) {
    const mode = el(root, ".fbri-mode").value || "safe";
    const warnEl = el(root, ".fbri-warn");
    const text = WARNINGS[mode] || "";
    warnEl.textContent = text;
    warnEl.style.display = text ? "block" : "none";
  }

  function makeDraggable(root, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = root.getBoundingClientRect();
      ox = rect.left;
      oy = rect.top;
      sx = e.clientX;
      sy = e.clientY;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      root.style.left = ox + (e.clientX - sx) + "px";
      root.style.top = oy + (e.clientY - sy) + "px";
      root.style.right = "auto";
      root.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  FBRI.mountPanel = async function () {
    if (document.getElementById(PANEL_ID)) return;
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.innerHTML = TEMPLATE;
    (document.body || document.documentElement).appendChild(root);

    const settings = await FBRI.loadSettings();
    fillForm(root, settings);
    updateWarning(root);
    detectAndFillPage(root);

    const statusEl = el(root, ".fbri-status");
    const countEl = el(root, ".fbri-count");
    const alreadyEl = el(root, ".fbri-already");
    const followingEl = el(root, ".fbri-following");
    const pageInput = el(root, ".fbri-page");

    const report = (o) => {
      if (o.message) statusEl.textContent = o.message;
      if (typeof o.invited === "number") countEl.textContent = o.invited;
      if (typeof o.alreadyInvited === "number")
        alreadyEl.textContent = o.alreadyInvited;
      if (typeof o.alreadyFollowing === "number")
        followingEl.textContent = o.alreadyFollowing;
      if (o.page) {
        if (
          pageInput &&
          !pageInput.dataset.edited &&
          o.page.name &&
          o.page.name !== "Unknown Page"
        ) {
          pageInput.value = o.page.name;
        }
        if (o.page.logoUrl) {
          if (pageInput) pageInput.dataset.logo = o.page.logoUrl;
          setLogo(root, o.page.logoUrl);
        }
      }
      if (o.phase === "running" || o.phase === "pausing") {
        setRunningUI(root, true);
      } else if (
        o.phase === "done" ||
        o.phase === "stopped" ||
        o.phase === "error" ||
        o.phase === "blocked"
      ) {
        setRunningUI(root, false);
      }
    };

    pageInput.addEventListener("input", () => {
      pageInput.dataset.edited = "1";
    });

    el(root, ".fbri-mode").addEventListener("change", () => updateWarning(root));

    el(root, ".fbri-start").addEventListener("click", async () => {
      const base = await FBRI.loadSettings();
      const merged = readForm(root, base);

      // Persist only stable settings — not the per-Page/transient fields.
      const toSave = Object.assign({}, merged);
      delete toSave.dryRun;
      await FBRI.saveSettings(toSave);

      merged.dryRun = el(root, ".fbri-dry").checked;
      // Treat the Page field as an override only when the user actually edited
      // it; otherwise let the engine auto-detect at run time.
      if (pageInput.dataset.edited && pageInput.value.trim()) {
        merged.pageName = pageInput.value.trim();
        merged.pageLogo = pageInput.dataset.logo || "";
      } else {
        merged.pageName = "";
        merged.pageLogo = "";
      }

      countEl.textContent = "0";
      alreadyEl.textContent = "0";
      followingEl.textContent = "0";
      setRunningUI(root, true);
      FBRI.start(merged, report);
    });

    el(root, ".fbri-stop").addEventListener("click", () => {
      FBRI.stop();
    });

    el(root, ".fbri-save").addEventListener("click", async () => {
      const base = await FBRI.loadSettings();
      const merged = readForm(root, base);
      const ok = await FBRI.saveSettings(merged);
      statusEl.textContent = ok
        ? "Settings saved."
        : "Settings apply for this run.";
    });

    el(root, ".fbri-min").addEventListener("click", () => {
      root.classList.toggle("fbri-collapsed");
    });

    makeDraggable(root, el(root, ".fbri-header"));
  };
})();
