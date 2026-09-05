/*
 * e2e.mock.js — end-to-end validation in a REAL (headless) Chrome, driving the
 * offline mock reactions page with the actual extension code. This exercises
 * the code paths jsdom can't: real layout/visibility, overflow-scroll detection,
 * lazy loading on scroll, and real click handling.
 *
 * Scenarios:
 *   1. Per-person (Safe)  — invites every reactor one-by-one.
 *   2. Turbo              — bursts through every reactor fast.
 *   3. Native "Invite all"— clicks Facebook's own bulk button once.
 *
 * Requires a local Google Chrome/Chromium. Run: npm run test:e2e
 */
const path = require("path");
const fs = require("fs");

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}

const mockUrl = "file://" + path.join(__dirname, "mock-reactions.html");

async function runScenario(browser, overrides) {
  const page = await browser.newPage();
  await page.goto(mockUrl, { waitUntil: "load" });
  await page.waitForSelector("#fbri-panel", { timeout: 5000 });

  const expectedInvitable = await page.evaluate(
    () => window.__MOCK_EXPECTED_INVITABLE
  );

  const result = await page.evaluate(async (ov) => {
    const settings = Object.assign(
      {},
      window.FBRI.DEFAULT_SETTINGS,
      {
        minDelayMs: 0,
        maxDelayMs: 0,
        fastMinDelayMs: 0,
        fastMaxDelayMs: 0,
        turboBatchPauseMs: 0,
        maxPerRun: 0,
        keepAwake: false,
        scrollWaitMs: 40,
        scrollStepPx: 500
      },
      ov
    );
    await new Promise((resolve) => {
      window.FBRI.start(settings, (o) => {
        if (["done", "stopped", "error", "blocked"].indexOf(o.phase) !== -1)
          resolve();
      });
    });
    const list = document.getElementById("list");
    const buttons = Array.from(list.querySelectorAll('[role="button"]'));
    const st = window.FBRI.getState();
    return {
      invited: st.invited,
      alreadyInvited: st.alreadyInvited,
      alreadyFollowing: st.alreadyFollowing,
      pageName: (window.FBRI.detectPageInfo(document) || {}).name,
      nativeClicked: !!window.__MOCK_NATIVE_ALL_CLICKED,
      remainingInvite: buttons.filter((b) => b.textContent.trim() === "Invite")
        .length,
      invitedShown: buttons.filter((b) => b.textContent.trim() === "Invited")
        .length
    };
  }, overrides);

  await page.close();
  return { expectedInvitable, result };
}

async function main() {
  const puppeteer = (await import("puppeteer-core")).default;
  const exe = findChrome();
  if (!exe) {
    console.error(
      "No local Chrome found. Set PUPPETEER_EXECUTABLE_PATH and retry."
    );
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--allow-file-access-from-files", "--no-sandbox"]
  });

  let failed = 0;
  const assert = (cond, name) => {
    console.log((cond ? "  \u2713 " : "  \u2717 ") + name);
    if (!cond) failed++;
  };

  try {
    // 1. Per-person (Safe), native bulk disabled so every row is clicked.
    console.log("Scenario 1 — per-person (Safe) invites everyone:");
    {
      const { expectedInvitable, result } = await runScenario(browser, {
        mode: "safe",
        useNativeInviteAll: false
      });
      assert(
        expectedInvitable > 0,
        "mock exposes invitable reactors (" + expectedInvitable + ")"
      );
      assert(
        result.invited === expectedInvitable,
        "invited all invitable reactors (" +
          result.invited +
          "/" +
          expectedInvitable +
          ")"
      );
      assert(result.remainingInvite === 0, "no 'Invite' buttons remain");
      assert(
        result.invitedShown >= expectedInvitable,
        "clicked rows now show 'Invited'"
      );
      assert(
        result.alreadyInvited === 20,
        "counts already-invited reactors (" + result.alreadyInvited + "/20)"
      );
      assert(
        result.alreadyFollowing === 10,
        "counts already-following reactors (" + result.alreadyFollowing + "/10)"
      );
      assert(
        result.pageName === "My Test Page",
        "detects the Page name from the post header (" + result.pageName + ")"
      );
    }

    // 2. Turbo — bursts through every reactor.
    console.log("Scenario 2 — Turbo invites everyone fast:");
    {
      const { expectedInvitable, result } = await runScenario(browser, {
        mode: "turbo",
        useNativeInviteAll: false
      });
      assert(
        result.invited === expectedInvitable,
        "turbo invited all invitable reactors (" +
          result.invited +
          "/" +
          expectedInvitable +
          ")"
      );
      assert(result.remainingInvite === 0, "no 'Invite' buttons remain");
    }

    // 3. Native "Invite all" — one click handles everyone.
    console.log("Scenario 3 — native 'Invite all' one-click:");
    {
      const { result } = await runScenario(browser, {
        mode: "safe",
        useNativeInviteAll: true
      });
      assert(
        result.nativeClicked === true,
        "clicked Facebook's native 'Invite all' button"
      );
      assert(
        result.remainingInvite === 0,
        "every reactor is invited after the single click"
      );
    }
  } catch (e) {
    console.error("E2E error:", e && e.message ? e.message : e);
    failed++;
  } finally {
    await browser.close();
  }

  console.log("");
  console.log(failed ? "E2E FAILED" : "E2E PASSED");
  process.exit(failed ? 1 : 0);
}

main();
