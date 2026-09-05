/*
 * logic.test.js — offline validation of the core detection + run logic using
 * jsdom. jsdom has no layout engine, so we stub visibility/geometry and focus
 * on the parts that matter: which buttons get selected, cap handling, dry-run
 * (no clicks), completion, and block detection.
 *
 * Run: npm test
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { window } = dom;

// Expose the globals the content scripts expect. `chrome` is intentionally
// left undefined so config.js falls back to DEFAULT_SETTINGS.
global.window = window;
global.document = window.document;
global.MouseEvent = window.MouseEvent;
global.getComputedStyle = window.getComputedStyle.bind(window);

function loadSrc(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

["config.js", "dom.js", "page.js", "stats.js", "keepalive.js", "inviter.js"].forEach(
  loadSrc
);

// popup.js lives at the project root (not src/); load it for its pure renderer.
(function () {
  const code = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");
  vm.runInThisContext(code, { filename: "popup.js" });
})();

const FBRI = window.FBRI;
const FBRIPopup = window.FBRIPopup;

// jsdom has no layout: force visibility so selection logic can be tested.
FBRI.isVisible = () => true;

// ---- tiny test harness -----------------------------------------------------
let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) {
    passed++;
    console.log("  \u2713 " + name);
  } else {
    failed++;
    console.error("  \u2717 " + name);
  }
}

function makeButton(label, onClick) {
  const b = window.document.createElement("div");
  b.setAttribute("role", "button");
  b.textContent = label;
  if (onClick) b.addEventListener("click", () => onClick(b));
  return b;
}

function buildDialog(rows) {
  window.document.body.innerHTML = "";
  const dialog = window.document.createElement("div");
  dialog.setAttribute("role", "dialog");

  const scroller = window.document.createElement("div");
  scroller.style.overflowY = "auto";
  let top = 0;
  Object.defineProperty(scroller, "scrollTop", {
    get: () => top,
    set: (v) => {
      top = v;
    },
    configurable: true
  });
  Object.defineProperty(scroller, "scrollHeight", {
    get: () => 1000,
    configurable: true
  });
  Object.defineProperty(scroller, "clientHeight", {
    get: () => 500,
    configurable: true
  });

  rows.forEach((r) => {
    const row = window.document.createElement("div");
    row.appendChild(makeButton(r.label, r.onClick));
    scroller.appendChild(row);
  });

  dialog.appendChild(scroller);
  window.document.body.appendChild(dialog);
  return { dialog, scroller };
}

const FAST = {
  minDelayMs: 0,
  maxDelayMs: 0,
  maxPerRun: 0,
  longPauseEvery: 0,
  longPauseMs: 0,
  keepAwake: false,
  inviteLabels: ["Invite"],
  invitedLabels: ["Invited"],
  followingLabels: ["Following"],
  scrollStepPx: 5000,
  scrollWaitMs: 0,
  maxScrollRounds: 20
};

// v2 base: all default fields present, every delay zeroed for fast tests.
const V2 = Object.assign({}, FBRI.DEFAULT_SETTINGS, FAST, {
  fastMinDelayMs: 0,
  fastMaxDelayMs: 0,
  turboInterClickMs: 0,
  turboBatchPauseMs: 0,
  useNativeInviteAll: false
});

function flipOnClick(b) {
  b.textContent = "Invited";
}

async function run() {
  console.log("findInviteButtons selection:");
  {
    buildDialog([
      { label: "Invite" },
      { label: "Invited" },
      { label: "Following" },
      { label: "invite" }, // case-insensitive
      { label: "Invite" }
    ]);
    const dialog = window.document.querySelector('[role="dialog"]');
    const found = FBRI.findInviteButtons(dialog, FAST);
    assert(found.length === 3, "selects only Invite buttons (case-insensitive)");
    const labels = found.map((b) => b.textContent.toLowerCase());
    assert(
      labels.indexOf("invited") === -1 && labels.indexOf("following") === -1,
      "excludes Invited and Following"
    );
  }

  console.log("full run invites every uninvited reactor:");
  {
    const rows = [];
    let invitable = 0;
    for (let i = 0; i < 18; i++) {
      const mod = i % 6;
      if (mod === 0 || mod === 3) rows.push({ label: "Invited" });
      else if (mod === 5) rows.push({ label: "Following" });
      else {
        rows.push({ label: "Invite", onClick: flipOnClick });
        invitable++;
      }
    }
    buildDialog(rows);
    let lastPhase = "";
    await FBRI.start(FAST, (o) => {
      if (o.phase) lastPhase = o.phase;
    });
    assert(
      FBRI.getState().invited === invitable,
      "invited count equals invitable reactors (" + invitable + ")"
    );
    assert(lastPhase === "done", "run finishes with phase 'done'");
    const remaining = FBRI.findInviteButtons(
      window.document.querySelector('[role="dialog"]'),
      FAST
    );
    assert(remaining.length === 0, "no Invite buttons remain after run");
  }

  console.log("per-run cap is honored:");
  {
    const rows = [];
    for (let i = 0; i < 20; i++)
      rows.push({ label: "Invite", onClick: flipOnClick });
    buildDialog(rows);
    const capped = Object.assign({}, FAST, { maxPerRun: 5 });
    await FBRI.start(capped, () => {});
    assert(FBRI.getState().invited === 5, "stops exactly at maxPerRun (5)");
  }

  console.log("dry run previews without clicking:");
  {
    const rows = [];
    let invitable = 0;
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        rows.push({ label: "Invite", onClick: flipOnClick });
        invitable++;
      } else {
        rows.push({ label: "Invited" });
      }
    }
    buildDialog(rows);
    const dry = Object.assign({}, FAST, { dryRun: true });
    await FBRI.start(dry, () => {});
    assert(
      FBRI.getState().invited === invitable,
      "dry run counts would-be invites (" + invitable + ")"
    );
    const stillInvite = FBRI.findInviteButtons(
      window.document.querySelector('[role="dialog"]'),
      FAST
    );
    assert(
      stillInvite.length === invitable,
      "dry run does NOT click (buttons still say Invite)"
    );
  }

  console.log("block detection:");
  {
    buildDialog([{ label: "Invite" }]);
    assert(FBRI.detectBlock() === false, "no false positive on a normal dialog");
    const blockDialog = window.document.createElement("div");
    blockDialog.setAttribute("role", "dialog");
    Object.defineProperty(blockDialog, "innerText", {
      value: "You’re Temporarily Blocked. Please try again later.",
      configurable: true
    });
    window.document.body.appendChild(blockDialog);
    assert(FBRI.detectBlock() === true, "detects a temporary-block dialog");
  }

  console.log("native Invite all detection:");
  {
    buildDialog([
      { label: "Invite all" },
      { label: "Invite" },
      { label: "Invited" }
    ]);
    const dialog = window.document.querySelector('[role="dialog"]');
    const bulk = FBRI.findBulkInviteButton(dialog, V2);
    assert(
      !!bulk && bulk.textContent === "Invite all",
      "finds the native 'Invite all' button"
    );
    const perPerson = FBRI.findInviteButtons(dialog, V2);
    assert(
      perPerson.length === 1,
      "per-person finder ignores 'Invite all' (exact-match)"
    );

    buildDialog([{ label: "Invite all who reacted" }]);
    const d2 = window.document.querySelector('[role="dialog"]');
    assert(
      !!FBRI.findBulkInviteButton(d2, V2),
      "matches a bulk label by prefix"
    );

    buildDialog([{ label: "Invite" }, { label: "Invited" }]);
    const d3 = window.document.querySelector('[role="dialog"]');
    assert(
      FBRI.findBulkInviteButton(d3, V2) === null,
      "returns null when no bulk button is present"
    );
  }

  console.log("turbo mode invites every loaded reactor:");
  {
    const rows = [];
    let invitable = 0;
    for (let i = 0; i < 24; i++) {
      if (i % 3 === 0) rows.push({ label: "Invited" });
      else {
        rows.push({ label: "Invite", onClick: flipOnClick });
        invitable++;
      }
    }
    buildDialog(rows);
    const turbo = Object.assign({}, V2, { mode: "turbo" });
    let lastPhase = "";
    await FBRI.start(turbo, (o) => {
      if (o.phase) lastPhase = o.phase;
    });
    assert(
      FBRI.getState().invited === invitable,
      "turbo invited all invitable reactors (" + invitable + ")"
    );
    assert(lastPhase === "done", "turbo finishes with phase 'done'");
    const remaining = FBRI.findInviteButtons(
      window.document.querySelector('[role="dialog"]'),
      V2
    );
    assert(remaining.length === 0, "no Invite buttons remain after turbo");
  }

  console.log("fast mode invites every reactor:");
  {
    const rows = [];
    let invitable = 0;
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        rows.push({ label: "Invite", onClick: flipOnClick });
        invitable++;
      } else {
        rows.push({ label: "Invited" });
      }
    }
    buildDialog(rows);
    const fast = Object.assign({}, V2, { mode: "fast" });
    await FBRI.start(fast, () => {});
    assert(
      FBRI.getState().invited === invitable,
      "fast invited all invitable reactors (" + invitable + ")"
    );
  }

  console.log("native Invite all is clicked first when enabled:");
  {
    let bulkClicked = 0;
    const rows = [
      { label: "Invite all", onClick: () => bulkClicked++ },
      { label: "Invite", onClick: flipOnClick },
      { label: "Invite", onClick: flipOnClick }
    ];
    buildDialog(rows);
    const withNative = Object.assign({}, V2, {
      mode: "turbo",
      useNativeInviteAll: true
    });
    await FBRI.start(withNative, () => {});
    assert(bulkClicked === 1, "clicked Facebook's native 'Invite all' once");
  }

  console.log("detectPageInfo reads Page name + logo + id:");
  {
    window.document.body.innerHTML = "";
    const art = window.document.createElement("div");
    art.setAttribute("role", "article");
    const img = window.document.createElement("img");
    img.setAttribute("src", "https://x/logo.png");
    const h = window.document.createElement("h3");
    const a = window.document.createElement("a");
    a.setAttribute("role", "link");
    a.setAttribute("href", "/profile.php?id=1234567");
    a.textContent = "My Cool Page";
    h.appendChild(a);
    art.appendChild(img);
    art.appendChild(h);
    window.document.body.appendChild(art);

    const info = FBRI.detectPageInfo(window.document);
    assert(info.name === "My Cool Page", "detects the Page name from the post header");
    assert(info.logoUrl === "https://x/logo.png", "detects the Page logo URL");
    assert(info.id === "1234567", "extracts the numeric Page id from the href");
    window.document.body.innerHTML = "";
  }

  console.log("findButtonsByLabels counts by exact label:");
  {
    buildDialog([
      { label: "Invite" },
      { label: "Invited" },
      { label: "Invited" },
      { label: "Following" },
      { label: "Invite all" }
    ]);
    const dialog = window.document.querySelector('[role="dialog"]');
    assert(
      FBRI.findButtonsByLabels(dialog, ["Invited"]).length === 2,
      "counts exactly the 'Invited' buttons (not 'Invite'/'Invite all')"
    );
    assert(
      FBRI.findButtonsByLabels(dialog, ["Following"]).length === 1,
      "counts exactly the 'Following' buttons"
    );
  }

  console.log("run reports already-invited / already-following:");
  {
    const rows = [
      { label: "Invited" },
      { label: "Invited" },
      { label: "Invited" },
      { label: "Invited" },
      { label: "Following" },
      { label: "Following" }
    ];
    let invitable = 0;
    for (let i = 0; i < 6; i++) {
      rows.push({ label: "Invite", onClick: flipOnClick });
      invitable++;
    }
    buildDialog(rows);
    await FBRI.start(V2, () => {});
    assert(
      FBRI.getState().invited === invitable,
      "invited the invitable rows (" + invitable + ")"
    );
    assert(
      FBRI.getState().alreadyInvited === 4,
      "counts 4 already-invited (excludes our own Invite→Invited flips)"
    );
    assert(
      FBRI.getState().alreadyFollowing === 2,
      "counts 2 already-following"
    );
  }

  console.log("already-invited / following counters update live:");
  {
    // A list of ONLY already-invited / following rows (no invitable buttons):
    // the counters must reach the panel DURING the run, not just at the end.
    const rows = [
      { label: "Invited" },
      { label: "Invited" },
      { label: "Invited" },
      { label: "Invited" },
      { label: "Following" },
      { label: "Following" }
    ];
    buildDialog(rows);
    const reports = [];
    await FBRI.start(V2, (o) => reports.push(Object.assign({}, o)));

    const isTerminal = (p) =>
      p === "done" || p === "stopped" || p === "error" || p === "blocked";
    const live = reports.filter((r) => !isTerminal(r.phase));
    const maxAlready = Math.max(0, ...live.map((r) => r.alreadyInvited || 0));
    const maxFollowing = Math.max(
      0,
      ...live.map((r) => r.alreadyFollowing || 0)
    );
    assert(
      maxAlready === 4,
      "reports already-invited live before finishing (" + maxAlready + "/4)"
    );
    assert(
      maxFollowing === 2,
      "reports already-following live before finishing (" + maxFollowing + "/2)"
    );
  }

  console.log("statsAdd accumulates cumulative per-Page totals:");
  {
    let mem = {};
    FBRI._statsStore = {
      get: () => Promise.resolve(JSON.parse(JSON.stringify(mem))),
      set: (p) => {
        mem = JSON.parse(JSON.stringify(p));
        return Promise.resolve(true);
      }
    };
    const pageA = { id: "7654321", name: "Page A", logoUrl: "logoA" };
    await FBRI.statsAdd(pageA, 3);
    await FBRI.statsAdd(pageA, 2);
    await FBRI.statsAdd({ id: "999", name: "Page B" }, 5);
    let pages = await FBRI.statsRead();
    assert(
      pages["7654321"].invited === 5,
      "accumulates deltas for the same Page (3 + 2 = 5)"
    );
    assert(
      pages["7654321"].name === "Page A" && pages["7654321"].logoUrl === "logoA",
      "stores the Page name and logo"
    );
    assert(
      pages["999"].invited === 5 && Object.keys(pages).length === 2,
      "tracks multiple Pages separately"
    );
    await FBRI.statsReset("7654321");
    pages = await FBRI.statsRead();
    assert(
      !pages["7654321"] && !!pages["999"],
      "reset(key) removes one Page and keeps the others"
    );
    FBRI._statsStore = null;
  }

  console.log("popup renders per-Page cards + grand total:");
  {
    const html = FBRIPopup.renderPagesHTML({
      a: { id: "a", name: "Alpha", invited: 7, lastRunAt: Date.now() },
      b: { id: "b", name: "Beta", invited: 3, lastRunAt: Date.now() - 1000 }
    });
    assert(
      html.indexOf("Alpha") !== -1 && html.indexOf("Beta") !== -1,
      "lists both Pages by name"
    );
    assert(
      html.indexOf("Total invited: <strong>10</strong>") !== -1,
      "shows the grand total across Pages (10)"
    );
    const empty = FBRIPopup.renderPagesHTML({});
    assert(
      empty.indexOf("No invites recorded yet") !== -1,
      "shows an empty state when there is no data"
    );
  }

  console.log("");
  console.log("Results: " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

run();
