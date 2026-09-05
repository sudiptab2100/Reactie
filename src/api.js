/*
 * api.js — the experimental Direct API (GraphQL) runner. It receives captures
 * from the MAIN-world hook (api-hook.js) via window.postMessage, then replays
 * Facebook's own invite mutation for all invitable reactors with a bounded
 * concurrency. Experimental: if capture is unavailable it returns false so the
 * engine falls back to Turbo.
 *
 * apiBuildRequest() and apiRunPool() are pure and unit-tested offline.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const captured = {
    template: null, // { url, method, body, dtsg, inviteeId }
    reactors: [] // [{ id, name, canInvite }]
  };
  FBRI.getApiCaptures = () => captured;
  FBRI.resetApiCaptures = function () {
    captured.template = null;
    captured.reactors = [];
  };

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__fbri !== true) return;
    if (d.type === "invite-template" && d.template) {
      captured.template = d.template;
    } else if (d.type === "reactors" && Array.isArray(d.reactors)) {
      const seen = new Set(captured.reactors.map((r) => r.id));
      d.reactors.forEach((r) => {
        if (r && r.id && !seen.has(r.id)) {
          captured.reactors.push(r);
          seen.add(r.id);
        }
      });
    }
  });

  function armHook() {
    try {
      window.postMessage({ __fbri: true, type: "arm-capture" }, "*");
    } catch (e) {
      /* ignore */
    }
  }

  // Build a replay request by substituting the captured invitee id with a target
  // id everywhere it appears in the template body. Pure + testable.
  FBRI.apiBuildRequest = function (template, targetId) {
    let body = template && template.body ? String(template.body) : "";
    if (template && template.inviteeId && targetId) {
      body = body.split(String(template.inviteeId)).join(String(targetId));
    }
    return {
      url: template ? template.url : "",
      method: (template && template.method) || "POST",
      body: body,
      headers: { "content-type": "application/x-www-form-urlencoded" }
    };
  };

  function looksSuccessful(status, text) {
    if (!(status >= 200 && status < 300)) return false;
    const t = (text || "").toLowerCase();
    if (t.indexOf('"errors"') !== -1) return false;
    if (t.indexOf('"error":') !== -1) return false;
    return true;
  }

  // Fire invites for `targets` with bounded concurrency. Pure w.r.t. injected
  // fetchImpl / callbacks, so it is unit-tested offline. Returns {invited, failed}.
  FBRI.apiRunPool = async function (targets, template, opts) {
    opts = opts || {};
    const concurrency = Math.max(1, opts.concurrency || 6);
    const fetchImpl =
      opts.fetchImpl ||
      (typeof window !== "undefined" && window.fetch
        ? window.fetch.bind(window)
        : null);
    const shouldStop = opts.shouldStop || (() => false);
    const onProgress = opts.onProgress || (() => {});
    const dryRun = !!opts.dryRun;

    let invited = 0;
    let failed = 0;
    let idx = 0;

    async function worker() {
      while (idx < targets.length) {
        if (shouldStop()) return;
        const t = targets[idx++];
        if (dryRun) {
          invited++;
          onProgress({ invited: invited, failed: failed });
          continue;
        }
        try {
          const req = FBRI.apiBuildRequest(template, t.id);
          const res = await fetchImpl(req.url, {
            method: req.method,
            body: req.body,
            headers: req.headers,
            credentials: "include"
          });
          let text = "";
          try {
            text = await res.text();
          } catch (e) {
            /* ignore */
          }
          if (looksSuccessful(res.status, text)) invited++;
          else failed++;
        } catch (e) {
          failed++;
        }
        onProgress({ invited: invited, failed: failed });
        if (opts.perRequestDelayMs) {
          await new Promise((r) => setTimeout(r, opts.perRequestDelayMs));
        }
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    return { invited: invited, failed: failed };
  };

  // Orchestrates the experimental API run. Returns true if it handled the run,
  // false to fall back to a DOM mode (Turbo).
  FBRI.runApi = async function (settings, say) {
    const state = FBRI.getState();
    armHook();

    const dialog = FBRI.getActiveDialog();
    const scroller = dialog ? FBRI.getScrollableContainer(dialog) : null;

    // Scroll to load the list so the reactions response (with ids) is captured.
    say({ phase: "running", message: "API mode: loading reactors to capture ids…" });
    let rounds = 0;
    while (scroller && rounds < 40 && !state.stopRequested) {
      const before = scroller.scrollHeight;
      scroller.scrollTop = scroller.scrollHeight;
      await FBRI.sleep(settings.scrollWaitMs || 500);
      rounds++;
      if (scroller.scrollHeight === before) break;
    }

    // Bootstrap the invite template by performing one real invite via a DOM
    // click (the hook captures the resulting request).
    const base0 = state.invited;
    if (!captured.template || !captured.template.inviteeId) {
      const buttons = dialog ? FBRI.findInviteButtons(dialog, settings) : [];
      if (buttons.length && !settings.dryRun) {
        say({ phase: "running", message: "API mode: capturing invite request…" });
        FBRI.safeClick(buttons[0]);
        state.invited++;
        for (
          let i = 0;
          i < 24 && (!captured.template || !captured.template.inviteeId);
          i++
        ) {
          await FBRI.sleep(150);
        }
      }
    }

    let targets = (captured.reactors || []).filter((r) => r && r.id && r.canInvite);

    if (settings.dryRun) {
      const n =
        targets.length ||
        (dialog ? FBRI.findInviteButtons(dialog, settings).length : 0);
      say({
        phase: "done",
        message: "Dry run (API): " + n + " reactor(s) would be invited."
      });
      return true;
    }

    if (!captured.template || !captured.template.inviteeId || !targets.length) {
      return false; // capture unavailable → fall back to Turbo
    }

    // Respect the per-run cap (account for the bootstrap invite already sent).
    if (settings.maxPerRun) {
      const room = Math.max(0, settings.maxPerRun - state.invited);
      targets = targets.slice(0, room);
    }

    const base = state.invited;
    say({
      phase: "running",
      message:
        "API mode: sending " +
        targets.length +
        " invites (concurrency " +
        (settings.apiConcurrency || 6) +
        ")…"
    });

    const result = await FBRI.apiRunPool(targets, captured.template, {
      concurrency: settings.apiConcurrency || 6,
      shouldStop: () => FBRI.getState().stopRequested || FBRI.detectBlock(),
      onProgress: function (p) {
        state.invited = base + p.invited;
        say({
          phase: "running",
          invited: state.invited,
          message: "API: " + state.invited + " sent…"
        });
      }
    });

    state.invited = base + result.invited;
    say({
      phase: "done",
      invited: state.invited,
      message:
        "API mode finished. Invited ~" +
        state.invited +
        (result.failed ? " (" + result.failed + " failed)" : "") +
        "."
    });
    return true;
  };
})();
