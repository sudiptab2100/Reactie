# Copilot instructions for this repo (Reactie)

Manifest V3 Chrome extension for **Facebook Page admins**: open a post's
reactions dialog and it invites everyone who reacted but isn't yet invited to
like the Page. Vanilla JS, **no build step, no framework, no bundler, no
linter**.

## Commands

- `npm install` — one-time; installs dev-only `jsdom` + `puppeteer-core`.
- `npm test` — offline logic suite (`node test/logic.test.js`) under jsdom. Fast,
  no browser, no network. Prints `Results: N passed, M failed` and exits non-zero
  on any failure.
- `npm run test:e2e` — drives `test/mock-reactions.html` in **real headless
  Chrome** via `puppeteer-core` (real layout, overflow-scroll, lazy-load, clicks).
  Needs a local Chrome; auto-detected, override with
  `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome`.
- `node --check <file>` on changed JS — the only "compile" gate that exists.
  Validate `manifest.json` is parseable JSON after editing it.
- **Running a single test:** there is no test filter/selector. `test/logic.test.js`
  is one script whose cases are sequential `console.log("...")` + `{ ... }` blocks
  sharing one `assert(cond, name)` harness. To isolate one, temporarily comment out
  the other blocks (or early-`return` from `run()` after it); don't add a framework.
- **Manual/live testing:** load unpacked at `chrome://extensions` (Developer mode →
  Load unpacked → this folder), then reload from the extension card after edits.

## Architecture (the big picture)

- **One shared global, no modules.** Every `src/*.js` is an IIFE that hangs its API
  off a single `window.FBRI` namespace (root popup uses `window.FBRIPopup`). There
  are **no `import`/`export`/`require`** — files cooperate purely through `FBRI.*`.
- **Load order is significant and duplicated in three places.** Adding/removing/
  renaming a `src` file means updating all three, in the same order:
  1. `manifest.json` → `content_scripts[0].js`
  2. `test/mock-reactions.html` → the `<script src="../src/...">` tags
  3. `test/logic.test.js` → the `loadSrc([...])` array
  Canonical order: `config → dom → page → stats → keepalive → inviter → panel → content`.
- **Runtime flow:** `content.js` bootstraps and re-mounts the panel across Facebook's
  SPA navigation (`setInterval` guard on `#fbri-panel`). `panel.js` renders the
  floating UI, loads/saves settings (`config.js`), and on **Start** calls
  `FBRI.start(settings, report)` in `inviter.js`. The inviter uses `dom.js` (find the
  active dialog, scroller, Invite / "Invite all" buttons, block dialogs), `page.js`
  (detect which Page the post belongs to), `stats.js` (persist per-Page totals), and
  `keepalive.js` (avoid background throttling). It streams progress back through the
  `report` callback.
- **Two runtime contexts, joined only by storage.** The content scripts write
  cumulative per-Page counts to `chrome.storage.local['fbri_pages']`; the separate
  toolbar popup (`popup.html`/`popup.js`) reads that same key and live-updates via
  `chrome.storage.onChanged`. Settings live under `['fbri_settings']`.

## Project-specific conventions

- **Detection is text/`aria-label`/`role`-based — never Facebook CSS classes**
  (they're randomized). Buttons are matched by exact visible label, case-insensitive,
  against label lists in settings (`inviteLabels`, `invitedLabels`, `followingLabels`,
  `bulkInviteLabels`). Preserve this; it's the whole resilience strategy and it also
  makes non-English UIs a settings edit, not a code change.
- **Never let one node abort a run.** DOM access and side effects are wrapped in
  `try/catch` that swallow (`/* ignore */`); the run loop has per-row try/catch and
  keep-alive start/stop is guarded. Match this defensive style in new code.
- **`report(o)` / `say(o)` are partial updates.** An update with **no `message` and
  no `phase`** refreshes only the counters (this is exactly how the live already-
  invited/following numbers work). A `phase` of `running`/`pausing` enables the
  running UI; `done`/`stopped`/`error`/`blocked` disables it. Only send a `phase`
  when you intend that Start/Stop state change.
- **Keep a pure / injectable seam for anything you want tested.** jsdom has no layout,
  so tests set `FBRI.isVisible = () => true`, stub `scrollTop`/`scrollHeight` via
  `Object.defineProperty`, load src through `vm.runInThisContext`, and **leave
  `chrome` undefined** so `config.js`/`stats.js` fall back to defaults / no-op. Follow
  the existing seams: pure renderer on `window.FBRIPopup.renderPagesHTML`, and the
  swappable stats backend `FBRI._statsStore` (`{ get, set }`).
- **Sentinels:** `maxPerRun: 0` = unlimited, `longPauseEvery: 0` = off. The inviter
  treats these falsy values as "disabled" (`if (settings.maxPerRun && ...)`).
- **Termination is bottom-gated on purpose.** The loop ends only after
  `emptyPasses >= 4` at the *true* bottom (scroll can't advance and height is stable),
  because Facebook's reactions list virtualizes/recycles rows. Don't "optimize" this
  back into a naive "no Invite buttons this pass → stop".
- **Internal identifiers vs. product name are separate.** Code uses the `FBRI` /
  `fbri-` prefix (panel id `#fbri-panel`, CSS `.fbri-*`); these are internal and
  intentionally *not* tied to the user-facing extension name in `manifest.json`.
- **`create` won't overwrite; full-file rewrites need `rm` then recreate.**

## Safety model (don't remove)

Speed modes are Safe / Fast / Turbo (global `mode` setting), plus an optional native
"Invite all" fast path. Faster ≠ more invites — Facebook enforces server-side limits.
`dom.js` `detectBlock()` scans for rate-limit/temporary-block dialogs and the run
**auto-stops in every mode**; dry-run highlights/counts without clicking. Keep these.
