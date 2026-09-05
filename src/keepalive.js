/*
 * keepalive.js — keeps the invite run going when the Facebook tab/window is in
 * the background. Chrome heavily throttles timers in hidden tabs (clamped to
 * >=1s, then ~once/min after a few minutes), which stalls the run. A tab that
 * is *playing audio* is exempt from that throttling, so we play a practically
 * silent WebAudio tone (inaudible, ~0.0005 gain) for the duration of a run.
 *
 * Pure Web Audio — no network/resource load (CSP-safe) and no permissions.
 * Every call is guarded so a failure (autoplay blocked, no AudioContext, etc.)
 * can never stop the run.
 */
(function () {
  const FBRI = (window.FBRI = window.FBRI || {});

  const ka = { ctx: null, osc: null, gain: null, active: false };

  function AC() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  FBRI.keepAlive = {
    // Start the inaudible tone. Best called from a user-gesture handler (the
    // Start button) so the AudioContext is allowed to run.
    start: function () {
      if (ka.active) return true;
      try {
        const Ctor = AC();
        if (!Ctor) return false;
        if (!ka.ctx) ka.ctx = new Ctor();
        try {
          if (ka.ctx.state === "suspended" && ka.ctx.resume) ka.ctx.resume();
        } catch (e) {
          /* ignore */
        }
        const osc = ka.ctx.createOscillator();
        const gain = ka.ctx.createGain();
        // Non-zero but practically silent so the tab is still flagged "audible".
        gain.gain.value = 0.0005;
        osc.frequency.value = 440;
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(ka.ctx.destination);
        osc.start();
        ka.osc = osc;
        ka.gain = gain;
        ka.active = true;
        return true;
      } catch (e) {
        ka.active = false;
        return false;
      }
    },

    // Stop the tone when the run ends.
    stop: function () {
      ka.active = false;
      try {
        if (ka.osc) {
          ka.osc.stop();
          ka.osc.disconnect();
        }
      } catch (e) {
        /* ignore */
      }
      try {
        if (ka.gain) ka.gain.disconnect();
      } catch (e) {
        /* ignore */
      }
      ka.osc = null;
      ka.gain = null;
      try {
        if (ka.ctx && ka.ctx.suspend) ka.ctx.suspend();
      } catch (e) {
        /* ignore */
      }
    },

    isActive: function () {
      return ka.active;
    }
  };
})();
