# Page Reactor Inviter

A Chrome extension (Manifest V3) for **Facebook Page admins**. When you open one of
your Page's posts and view its reactions, it finds everyone who reacted but is **not
yet invited** to like your Page and clicks **Invite** for each of them — skipping people
who are already **Invited** or already **Following**.

It works from a small floating panel, offers selectable **speed modes** (Safe / Fast /
Turbo) so you can trade speed for safety, can use Facebook's own
**"Invite all"** button when present, uses **randomized human-like delays** and a
**per-run cap** to stay under Facebook's limits, and includes a **Dry run** preview so you
can verify who would be invited before any real clicks happen.

It also **keeps running when the tab is in the background**, shows how many reactors are
**already invited / already following**, and records a **per-Page invited total** you can
review any time by clicking the extension's toolbar icon (name + logo, one card per Page).

---

## How it works

- You open a Page post → click the **reactions count** → Facebook shows the reactions dialog.
- The extension scans **only that open dialog**, scrolls to lazy-load the full list, and
  clicks each **Invite** button.
- Detection is based on **button text / `aria` / `role`** — not Facebook's randomized CSS
  class names — so it survives most UI tweaks. If Facebook renames the button, you just edit
  the label in Settings (no code change).
- After a click, the row flips to **Invited** and is automatically skipped, so re-running is safe.

---

## Speed modes — inviting everyone faster

Early versions invited **one person at a time** with a long pause between each — safe, but
slow on posts with hundreds of reactors. You can now pick how fast to go from the panel's
**Speed mode** dropdown. The important honest caveat:

> **Facebook enforces invite limits on its own servers.** "All at once" speeds up *sending*
> but it **cannot bypass those limits** and it **raises the risk of a temporary block**. The
> extension's auto-stop-on-block safety net stays active in every mode.

| Mode | How it sends | Speed | Block risk |
|---|---|---|---|
| **Safe** (default) | One invite, then a randomized **1.5–4s** pause | Slowest | Lowest |
| **Fast** | One invite, then a short **200–600ms** pause | ~5–15× faster | Moderate |
| **Turbo** | Clicks **every loaded** Invite button in one burst, scrolls, repeats | Near-instant | Highest |

**Use native "Invite all" if available** (checkbox, on by default): before looping, the
extension looks for Facebook's own bulk button (e.g. **"Invite all"**, **"Invite all who
reacted"**) in the dialog and clicks it. When Facebook offers it, this is the best true
"all-at-once" — one click, lowest risk. If it isn't present, the extension falls back to
your selected speed mode.

### Which should I use?

- **Start with Safe** (or the native "Invite all" if the button appears). Lowest risk.
- **Fast** is a good balance for medium lists.
- **Turbo** is fastest via the UI but most likely to trip Facebook's rate limit on big lists
  — the run auto-stops if that happens, so you simply continue later.

Whatever the mode, **you cannot exceed Facebook's server-side limits** — expect possible
temporary blocks on very large lists regardless. That's normal, and the auto-stop protects
your account.

---

## Keeps running in the background

Chrome heavily **throttles timers in tabs that aren't focused** — after a few minutes a
background tab's `setTimeout`/`setInterval` can drop to roughly once per minute, which used
to make a long invite run crawl or appear to stall when you switched tabs or windows.

To defeat this, while a run is active the extension plays a **practically silent tone**
(inaudible WebAudio, near-zero volume). A tab that is *playing audio* is **exempt from
Chrome's background throttling**, so the run keeps going at full speed even when the tab or
window isn't focused. The tone starts when you press **Invite reactors** and stops the moment
the run ends.

- Toggle it with **Keep running in background** in Settings (on by default).
- Because the tab is technically playing audio, Chrome may show the little **"audio playing"
  speaker icon** on the tab while a run is in progress. That's expected — nothing audible plays.
- It needs no extra permissions and loads no network resources (CSP-safe). If your browser
  blocks it for any reason, the run still continues; it just may throttle in the background.

The run also no longer **ends early**: it only concludes once it has scrolled to the true
**bottom** of the list and found no new invitable reactors for several consecutive passes, and
a failure on any single row can't abort the whole run.

---

## Already-invited / already-following count

As it scrolls the full reactions list, the extension also counts the people who are **already
invited** and the people who **already follow** (like) your Page, **updating these numbers live**
as it goes. The panel shows them next to the live "invited this run" number, e.g.:

> Invited this run: **12** · Already invited: **34** · Already following: **8**

These are deduplicated counts of the reactors on the current post, so you can see the whole
picture at a glance — who you just invited, who was invited before, and who already likes the Page.

---

## Per-Page totals (toolbar popup)

Click the extension's **toolbar icon** to open a popup that shows your **cumulative invited
total for each Page**, listed separately:

- One **card per Page**, with the Page's **logo** and **name** and its running **Invited: N**
  total (plus when it last ran).
- A **grand total** across all Pages.
- Live updates while a run is in progress (via `chrome.storage`), and a **Reset** button to
  clear the stored totals.

The extension auto-detects which Page a post belongs to from the post header. Because that
detection is best-effort, the floating panel shows the **detected Page in an editable field**
(with a small logo preview) — if it's ever wrong, just correct the name before starting and the
run is recorded under that name. Totals persist across runs and across browser restarts. Dry
runs are **not** counted.

---

## Install (load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this project folder
   (`FBExtenstion` — the one containing `manifest.json`).
4. The extension is now active on `facebook.com`. A floating **Reactor Inviter** panel
   appears at the bottom-right of Facebook pages.

To update after editing files, click the **reload** icon on the extension card.

---

## Usage

1. Go to **facebook.com** and make sure you're using Facebook **as your Page's admin**
   (so you can see Invite buttons on reactors).
2. Open one of your Page's posts.
3. Click the **reactions count** (e.g. the "👍❤️😆 1.2K" summary) to open the reactions dialog.
4. In the floating panel:
   - **Pick a Speed mode** (Safe / Fast / Turbo). Leave **Use native
     "Invite all" if available** ticked so the extension uses Facebook's own bulk button when
     it's offered. See [Speed modes](#speed-modes--inviting-everyone-faster) above.
   - **Check the detected Page** shown in the panel (name + logo). Correct the name if it's
     wrong — the run's totals are recorded under it.
   - **First time / to be safe:** tick **Dry run (preview, no clicks)** and press
     **Invite reactors**. It scrolls the whole list, highlights everyone who *would* be
     invited, and shows the count — without clicking anything.
   - When you're happy, untick Dry run and press **Invite reactors** again to send invites.
5. Watch the status line and the **invited this run** counter (plus **already invited /
   following**). Press **Stop** any time. You can switch to another tab — the run keeps going.
   Click the **toolbar icon** any time to see per-Page totals.

The panel is draggable (drag its blue header) and can be minimized (the `–` button).

---

## Settings

Open **Settings** in the panel. Values persist via `chrome.storage`.

| Setting | Meaning | Default |
|---|---|---|
| Speed mode | Safe / Fast / Turbo (see above) | Safe |
| Use native "Invite all" | Click Facebook's own bulk button first when present | On |
| Keep running in background | Play a silent tone so Chrome won't throttle a background tab | On |
| Safe delay min / max (ms) | Randomized wait between invites in **Safe** mode | 1500 / 4000 |
| Fast delay min / max (ms) | Randomized wait between invites in **Fast** mode | 200 / 600 |
| Turbo pause (ms) | Small pause between bursts in **Turbo** mode | 150 |
| Max per run | Stop after this many invites. `0` = unlimited | 50 |
| Long pause every | Take a longer cool-down after every N invites. `0` = off | 0 |
| Long pause (ms) | Duration of that cool-down | 30000 |
| Invite labels | Comma-separated button text that means "invite this person" | `Invite` |
| Invited labels | Comma-separated button text that means "already invited" (skipped) | `Invited` |
| Following labels | Comma-separated button text that means "already follows the Page" | `Following` |
| Invite-all labels | Comma-separated text of Facebook's native bulk button | `Invite all, …` |

### Not using Facebook in English?

Change **Invite labels** / **Invited labels** to match your language. Examples:

- Spanish: Invite = `Invitar`, Invited = `Invitado` / `Invitada`
- Portuguese: Invite = `Convidar`, Invited = `Convidado`
- German: Invite = `Einladen`, Invited = `Eingeladen`

You can list several variants separated by commas (e.g. `Invitado, Invitada`).

---

## Safety & Facebook limits

- Facebook enforces its own limits on how many invites you can send and how fast.
  Sending too many too quickly can get the action **temporarily blocked**. The faster
  **Turbo** mode raises this risk — it speeds up *sending* but **cannot
  bypass Facebook's server-side limits**.
- This tool only automates clicks **you could do by hand**. Keep the **randomized delays**
  and a sensible **Max per run** to reduce risk. Consider enabling a **Long pause** for big lists.
- If Facebook shows a "temporarily blocked" / "going too fast" dialog, the extension
  **detects it and stops automatically** — in **every** mode. If that happens, wait a while
  (hours) before trying again.
- Use at your own discretion and in line with Facebook's Terms.

---

## Testing

### Offline logic tests (no browser, no Facebook)

```bash
npm install   # one-time, installs jsdom (dev only)
npm test
```

This validates the core logic in `src/`: that only **Invite** buttons are selected
(Invited/Following excluded), the run invites everyone, the **per-run cap** is honored,
**Dry run** never clicks, the run completes, and **block detection** works — plus the v2
additions: native **"Invite all"** detection, **Turbo** and **Fast** modes inviting everyone
— and the v3 additions:
**Page detection** (name/logo/id parsing), **already-invited / already-following** counting,
**per-Page stats** (`statsAdd` with a stub storage, multi-Page totals + reset), and the
**toolbar popup** rendering.

### End-to-end test in real Chrome (optional)

If you have Google Chrome installed locally, this drives the mock page through a real
(headless) browser using the actual extension code — exercising real layout, overflow
scrolling, lazy loading, and clicks across three scenarios: **per-person (Safe)**, **Turbo**,
and Facebook's native **"Invite all"** one-click:

```bash
npm run test:e2e
```

It auto-detects Chrome; override with `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome` if needed.

### Offline mock page (in the browser)

`test/mock-reactions.html` reproduces Facebook's reactions dialog (a scrollable,
lazy-loading list of reactors with Invite / Invited / Following buttons) and loads the
**real** extension code. Open it directly in Chrome:

1. Open `test/mock-reactions.html` via `File → Open`.
2. Use the floating panel: try **Dry run** first, then a real run.
3. Watch `Invite` rows flip to `Invited` and the counter climb. This exercises the full
   scroll + click flow without touching Facebook.

---

## Live test checklist (on Facebook)

1. Load the extension unpacked (see Install).
2. Open a Page post with several reactors, open the reactions dialog.
3. **Dry run** first — confirm the highlighted/counted people look right (uninvited only).
4. Set **Max per run** low (e.g. 5) for the first real run and verify 5 rows flip to Invited.
5. Increase settings as you gain confidence.

---

## Troubleshooting

- **"No reactions list found."** — Open a post and click its **reactions count** first so
  the reactions dialog is on screen, then press Invite reactors.
- **Finds 0 invitable people, but there are some.** — Your Facebook may be in another
  language, or Facebook renamed the button. Update **Invite labels** in Settings to match
  the exact button text you see. Use **Dry run** to confirm detection.
- **It clicked something unexpected.** — It only scans the topmost open dialog. Make sure the
  reactions dialog is the front-most dialog (close other popovers first).
- **Panel missing.** — Reload the Facebook tab. The panel re-mounts automatically; if you
  changed code, reload the extension at `chrome://extensions` too.
- **Toolbar popup shows "No Pages yet".** — You haven't completed a real (non–dry-run) invite
  yet, or totals were reset. Run a real invite and the Page card appears.
- **Tab shows a speaker / "audio playing" icon during a run.** — Expected: the extension plays
  a silent tone so Chrome won't throttle the background tab. It stops when the run ends; turn
  it off with **Keep running in background** in Settings if you prefer.
- **Got temporarily blocked.** — You hit Facebook's rate limit. Wait, then use bigger delays,
  a lower Max per run, and enable Long pause.

---

## Project structure

```
manifest.json            MV3 manifest (isolated content scripts + toolbar popup)
src/
  config.js              default settings, modes, labels, chrome.storage helpers
  dom.js                 find dialog / scroller / Invite + "Invite all" buttons / block detection
  page.js                detect the post's Page: name + logo + id (header/URL fallbacks)
  stats.js               per-Page cumulative invited totals in chrome.storage (fbri_pages)
  keepalive.js           inaudible WebAudio keep-alive so background tabs aren't throttled
  inviter.js             mode-aware run engine (safe/fast/turbo; native bulk; cap; dry-run; stop;
                         already-invited/following counts; per-Page stats; robust termination)
  panel.js               floating control panel UI (mode selector, Page field, counts, settings)
  panel.css              panel styles
  content.js             bootstrap: mount panel, keep it across SPA navigation
popup.html/js/css        toolbar popup: per-Page cards (logo + name + total), grand total, reset
icons/                   extension icons (16/48/128)
test/
  logic.test.js          offline jsdom tests for the core logic + modes + v3
  e2e.mock.js            real-Chrome end-to-end run (per-person, Turbo, native Invite-all)
  mock-reactions.html    offline browser mock of the reactions dialog (with a Page header)
```

---

## Notes / limitations

- Facebook changes its UI often. The design is text/label-driven so most changes are a
  Settings edit, not a code change; larger changes may need selector updates in `src/dom.js`.
- Per-post reactor state is independent — the extension doesn't keep a cross-post "already
  processed" list (already-invited people are skipped by their **Invited** state anyway). It
  **does** keep a cumulative **invited total per Page** for the toolbar popup, which you can
  clear with the popup's **Reset** button.
- Page auto-detection is best-effort; use the editable Page field in the panel to correct it.
- Icons are simple generated placeholders; replace the files in `icons/` to rebrand.
