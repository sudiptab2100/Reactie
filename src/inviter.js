/*
 * inviter.js — the run engine. Reveals reactors by scrolling and invites the
 * uninvited ones according to the chosen speed mode:
 *   safe  — sequential, 1.5–4s randomized delays (lowest block risk)
 *   fast  — short randomized delays / small batches
 *   turbo — burst: click every loaded Invite button per pass (near-instant)
 *   api   — delegates to FBRI.runApi (experimental GraphQL replay)
 *
 * v3 additions:
 *   - Background keep-alive (FBRI.keepAlive) so the run doesn't stall when the
 *     tab/window is unfocused.
 *   - Robust, bottom-gated termination so runs don't end early on Facebook's
 *     virtualized (row-recycling) list; per-row try/catch so one bad node can't
 *     abort the run.
 *   - Counts already-invited / already-following reactors and reports them.
 *   - Detects the Page (name + logo) and records cumulative per-Page totals.
 *
 * Also runs Facebook's native "Invite all" first when available. Honors the
 * per-run cap, supports dry-run, and stops on request or a Facebook block dialog.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const state = {
    running: false,
    stopRequested: false,
    invited: 0,
    alreadyInvited: 0,
    alreadyFollowing: 0
  };

  let processed = new WeakSet();
  let countedInvited = new WeakSet();
  let countedFollowing = new WeakSet();
  let highlighted = [];

  FBRI.getState = () => state;

  FBRI.stop = function () {
    state.stopRequested = true;
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function rand(min, max) {
    if (max <= min) return min;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function safeClick(el) {
    try {
      el.click();
    } catch (e) {
      const ev = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(ev);
    }
  }

  // Shared with the experimental API runner.
  FBRI.sleep = sleep;
  FBRI.safeClick = safeClick;

  function highlight(el) {
    try {
      el.style.outline = "2px solid #1877f2";
      el.style.outlineOffset = "1px";
      highlighted.push(el);
    } catch (e) {
      /* ignore */
    }
  }

  function clearHighlights() {
    for (let i = 0; i < highlighted.length; i++) {
      try {
        highlighted[i].style.outline = "";
        highlighted[i].style.outlineOffset = "";
      } catch (e) {
        /* ignore */
      }
    }
    highlighted = [];
  }

  // Scroll one step to reveal / lazy-load more rows. Returns true if we either
  // loaded more content or moved further down the list.
  async function scrollMore(scroller, settings) {
    if (!scroller) return false;
    const beforeHeight = scroller.scrollHeight;
    const beforeTop = scroller.scrollTop;
    scroller.scrollTop = Math.min(
      scroller.scrollHeight,
      scroller.scrollTop + settings.scrollStepPx
    );
    await sleep(settings.scrollWaitMs);
    return (
      scroller.scrollHeight > beforeHeight || scroller.scrollTop > beforeTop
    );
  }

  function pickButtons(dialog, settings) {
    const all = FBRI.findInviteButtons(dialog, settings);
    const fresh = [];
    for (let i = 0; i < all.length; i++) {
      if (!processed.has(all[i])) fresh.push(all[i]);
    }
    return fresh;
  }

  // Count distinct already-invited / already-following rows as they scroll into
  // view. Buttons we clicked this run (processed) are excluded so our own
  // Invite→Invited flips don't inflate the "already invited" figure.
  function countAlready(dialog, settings) {
    try {
      const invited = FBRI.findButtonsByLabels(
        dialog,
        settings.invitedLabels || ["Invited"]
      );
      for (let i = 0; i < invited.length; i++) {
        const b = invited[i];
        if (!countedInvited.has(b) && !processed.has(b)) {
          countedInvited.add(b);
          state.alreadyInvited++;
        }
      }
      const following = FBRI.findButtonsByLabels(
        dialog,
        settings.followingLabels || ["Following"]
      );
      for (let i = 0; i < following.length; i++) {
        const b = following[i];
        if (!countedFollowing.has(b)) {
          countedFollowing.add(b);
          state.alreadyFollowing++;
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Per-mode timing/batching profile.
  function getProfile(settings) {
    const mode = settings.mode || "safe";
    if (mode === "turbo") {
      return {
        mode: "turbo",
        label: "Turbo",
        batchSize: Infinity,
        interClickMs: Math.max(0, settings.turboInterClickMs || 0),
        betweenMin: Math.max(0, settings.turboBatchPauseMs || 0),
        betweenMax: Math.max(0, settings.turboBatchPauseMs || 0),
        scrollIntoView: false
      };
    }
    if (mode === "fast") {
      const fmin = Math.max(0, settings.fastMinDelayMs || 200);
      const fmax = Math.max(fmin, settings.fastMaxDelayMs || 600);
      return {
        mode: "fast",
        label: "Fast",
        batchSize: Math.max(1, settings.fastBatchSize || 1),
        interClickMs: 0,
        betweenMin: fmin,
        betweenMax: fmax,
        scrollIntoView: true
      };
    }
    const smin = Math.max(0, settings.minDelayMs || 1500);
    const smax = Math.max(smin, settings.maxDelayMs || 4000);
    return {
      mode: "safe",
      label: "Safe",
      batchSize: 1,
      interClickMs: 0,
      betweenMin: smin,
      betweenMax: smax,
      scrollIntoView: true
    };
  }

  // Resolve which Page this run counts toward: auto-detected, with an optional
  // user override (edited name / logo from the panel).
  function resolvePageInfo(settings) {
    let info = { id: "", name: "", logoUrl: "" };
    try {
      if (typeof FBRI.detectPageInfo === "function") {
        info = FBRI.detectPageInfo(document) || info;
      }
    } catch (e) {
      /* ignore */
    }
    if (settings.pageName) {
      info = {
        id: "",
        name: settings.pageName,
        logoUrl: settings.pageLogo || info.logoUrl || ""
      };
    }
    info.id =
      typeof FBRI.pageKey === "function"
        ? FBRI.pageKey(info)
        : info.id || info.name;
    return info;
  }

  FBRI.start = async function (settings, report) {
    if (state.running) return;
    state.running = true;
    state.stopRequested = false;
    state.invited = 0;
    state.alreadyInvited = 0;
    state.alreadyFollowing = 0;
    processed = new WeakSet();
    countedInvited = new WeakSet();
    countedFollowing = new WeakSet();
    clearHighlights();

    const pageInfo = resolvePageInfo(settings);
    const pagePublic = { name: pageInfo.name, logoUrl: pageInfo.logoUrl };

    // Cumulative per-Page stats are flushed in batches; track what's persisted.
    let savedInvited = 0;
    async function flushStats(force) {
      if (settings.dryRun) return;
      const delta = state.invited - savedInvited;
      if (delta <= 0) return;
      if (!force && delta < 5) return;
      savedInvited = state.invited;
      try {
        if (typeof FBRI.statsAdd === "function") {
          await FBRI.statsAdd(pageInfo, delta);
        }
      } catch (e) {
        /* ignore */
      }
    }

    const say = (o) => {
      try {
        report &&
          report(
            Object.assign(
              {
                invited: state.invited,
                alreadyInvited: state.alreadyInvited,
                alreadyFollowing: state.alreadyFollowing,
                page: pagePublic
              },
              o
            )
          );
      } catch (e) {
        /* ignore */
      }
    };

    // Keep the tab from being throttled while the run is in the background.
    if (settings.keepAwake && FBRI.keepAlive) {
      try {
        FBRI.keepAlive.start();
      } catch (e) {
        /* ignore */
      }
    }

    try {
      const dialog = FBRI.getActiveDialog();
      if (!dialog) {
        say({
          phase: "error",
          message:
            "No reactions list found. Open a post, click its reactions count, then try again."
        });
        return;
      }

      const mode = settings.mode || "safe";

      // Experimental API mode: try the GraphQL replay; fall back to Turbo if the
      // capture is unavailable.
      if (mode === "api" && typeof FBRI.runApi === "function") {
        const handled = await FBRI.runApi(settings, say);
        if (handled) return;
        say({
          phase: "running",
          message: "API capture unavailable — falling back to Turbo…"
        });
        settings = Object.assign({}, settings, { mode: "turbo" });
      }

      const scroller = FBRI.getScrollableContainer(dialog);
      const profile = getProfile(settings);

      // Native "Invite all" fast path.
      if (settings.useNativeInviteAll) {
        const bulk = FBRI.findBulkInviteButton(dialog, settings);
        if (bulk) {
          if (settings.dryRun) {
            highlight(bulk);
            say({
              phase: "running",
              message: "Dry run: Facebook’s native ‘Invite all’ button detected."
            });
          } else {
            say({
              phase: "running",
              message: "Clicking Facebook’s native ‘Invite all’…"
            });
            safeClick(bulk);
            await sleep(1000);
          }
        }
      }

      say({
        phase: "running",
        message: settings.dryRun
          ? "Scanning reactors (dry run)…"
          : profile.label + " mode — inviting…"
      });

      let emptyPasses = 0;
      let lastAI = 0;
      let lastAF = 0;
      while (!state.stopRequested) {
        if (FBRI.detectBlock()) {
          say({
            phase: "blocked",
            message:
              "Facebook block/limit dialog detected — stopping. Invited " +
              state.invited +
              " this run."
          });
          break;
        }

        countAlready(dialog, settings);
        // Push the already-invited / following tallies to the panel the moment
        // they change so the counters update live — even during scroll-only
        // stretches with no invite clicks. No message/phase → status text and
        // the Start/Stop buttons are left untouched.
        if (
          state.alreadyInvited !== lastAI ||
          state.alreadyFollowing !== lastAF
        ) {
          lastAI = state.alreadyInvited;
          lastAF = state.alreadyFollowing;
          say({});
        }

        const buttons = pickButtons(dialog, settings);

        if (!buttons.length) {
          // Robust, bottom-gated termination: while there is more to scroll,
          // scrollMore() moves us down (returns true) and we keep going. Only
          // once we truly can't advance do we count empty passes — with a short
          // wait between them so Facebook's lazy-load has time to append rows.
          const grew = await scrollMore(scroller, settings);
          if (grew) {
            emptyPasses = 0;
            continue;
          }
          emptyPasses++;
          if (emptyPasses >= 4) break; // reached the end of the list
          await sleep(settings.scrollWaitMs);
          continue;
        }
        emptyPasses = 0;

        if (settings.dryRun) {
          for (let i = 0; i < buttons.length; i++) {
            processed.add(buttons[i]);
            highlight(buttons[i]);
            state.invited++;
          }
          say({
            phase: "running",
            message:
              "Dry run: " + state.invited + " uninvited reactor(s) found so far…"
          });
          continue;
        }

        const n =
          profile.batchSize === Infinity
            ? buttons.length
            : Math.min(profile.batchSize, buttons.length);

        for (let i = 0; i < n && !state.stopRequested; i++) {
          const btn = buttons[i];
          processed.add(btn);
          try {
            if (profile.scrollIntoView) {
              try {
                btn.scrollIntoView({ block: "center" });
              } catch (e) {
                /* ignore */
              }
              await sleep(60);
            }
            safeClick(btn);
            state.invited++;
          } catch (e) {
            // One bad node must not abort the whole run.
            continue;
          }

          await flushStats(false);

          if (settings.maxPerRun && state.invited >= settings.maxPerRun) {
            await flushStats(true);
            say({
              phase: "done",
              message:
                "Reached the per-run cap (" +
                settings.maxPerRun +
                "). Invited " +
                state.invited +
                "."
            });
            return;
          }

          if (
            settings.longPauseEvery &&
            state.invited % settings.longPauseEvery === 0
          ) {
            await flushStats(true);
            say({
              phase: "pausing",
              message:
                "Cooling down " +
                Math.round(settings.longPauseMs / 1000) +
                "s to stay under Facebook limits…"
            });
            await sleep(settings.longPauseMs);
          } else if (profile.interClickMs > 0) {
            await sleep(profile.interClickMs);
          }
        }

        say({
          phase: "running",
          message: profile.label + " — invited " + state.invited + "…"
        });

        const between = rand(profile.betweenMin, profile.betweenMax);
        if (between > 0) await sleep(between);
      }

      if (state.stopRequested) {
        say({
          phase: "stopped",
          message: "Stopped. Invited " + state.invited + " this run."
        });
      } else if (settings.dryRun) {
        say({
          phase: "done",
          message:
            "Dry run complete. " +
            state.invited +
            " uninvited reactor(s) would be invited."
        });
      } else {
        say({
          phase: "done",
          message: "Finished. Invited " + state.invited + " this run."
        });
      }
    } catch (e) {
      say({
        phase: "error",
        message: "Error: " + (e && e.message ? e.message : String(e))
      });
    } finally {
      await flushStats(true);
      if (FBRI.keepAlive) {
        try {
          FBRI.keepAlive.stop();
        } catch (e) {
          /* ignore */
        }
      }
      state.running = false;
      state.stopRequested = false;
    }
  };
})();
