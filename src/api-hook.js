/*
 * api-hook.js — runs in the page's MAIN world (see manifest "world": "MAIN").
 * It hooks window.fetch and XMLHttpRequest to capture, from Facebook's own
 * traffic, (a) the reactor ids from the reactions GraphQL response and (b) one
 * real "invite" mutation to use as a replay template. Captures are relayed to
 * the extension's isolated world via window.postMessage. Purely observational —
 * it never changes requests. Experimental / best-effort.
 */
(function () {
  if (window.__fbriHookInstalled) return;
  window.__fbriHookInstalled = true;

  let armed = false;
  const knownIds = new Set();

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__fbri !== true) return;
    if (d.type === "arm-capture") armed = true;
    if (d.type === "disarm-capture") armed = false;
    if (d.type === "known-ids" && Array.isArray(d.ids)) {
      d.ids.forEach((i) => knownIds.add(String(i)));
    }
  });

  function post(type, payload) {
    try {
      window.postMessage(Object.assign({ __fbri: true, type: type }, payload), "*");
    } catch (e) {
      /* ignore */
    }
  }

  // Best-effort: pull {"id":"<digits>", ... "name":"<name>"} pairs from a
  // reactions GraphQL response. Facebook shapes vary; this is heuristic.
  function extractReactors(text) {
    const reactors = [];
    if (!text || text.length > 5000000) return reactors;
    try {
      const re = /"id":"(\d{5,})"[^{}]*?"name":"((?:[^"\\]|\\.){1,80})"/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        reactors.push({ id: m[1], name: m[2], canInvite: true });
        if (reactors.length > 5000) break;
      }
    } catch (e) {
      /* ignore */
    }
    return reactors;
  }

  function looksLikeInvite(bodyStr) {
    if (!bodyStr) return false;
    return (
      /invite/i.test(bodyStr) &&
      /fb_dtsg=/.test(bodyStr) &&
      /(doc_id=|fb_api_req_friendly_name)/i.test(bodyStr)
    );
  }

  function handle(url, method, bodyStr, respText) {
    if (!armed) return;
    try {
      if (respText) {
        const reactors = extractReactors(respText);
        if (reactors.length) {
          reactors.forEach((r) => knownIds.add(r.id));
          post("reactors", { reactors: reactors });
        }
      }
      if (looksLikeInvite(bodyStr)) {
        const dtsgMatch = bodyStr.match(/fb_dtsg=([^&]+)/);
        const dtsg = dtsgMatch ? decodeURIComponent(dtsgMatch[1]) : null;
        let inviteeId = null;
        knownIds.forEach((id) => {
          if (!inviteeId && bodyStr.indexOf(id) !== -1) inviteeId = id;
        });
        post("invite-template", {
          template: {
            url: url,
            method: method || "POST",
            body: bodyStr,
            dtsg: dtsg,
            inviteeId: inviteeId
          }
        });
      }
    } catch (e) {
      /* ignore */
    }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method =
        (init && init.method) || (input && input.method) || "GET";
      let bodyStr = "";
      try {
        if (init && typeof init.body === "string") bodyStr = init.body;
      } catch (e) {
        /* ignore */
      }
      const p = origFetch.apply(this, arguments);
      try {
        if (armed && url.indexOf("/api/graphql") !== -1) {
          p.then(function (res) {
            try {
              res
                .clone()
                .text()
                .then(function (t) {
                  handle(url, method, bodyStr, t);
                })
                .catch(function () {});
            } catch (e) {
              /* ignore */
            }
          }).catch(function () {});
        }
      } catch (e) {
        /* ignore */
      }
      return p;
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__fbriUrl = url;
    this.__fbriMethod = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const bodyStr = typeof body === "string" ? body : "";
    const self = this;
    this.addEventListener("load", function () {
      try {
        if (armed && String(self.__fbriUrl || "").indexOf("/api/graphql") !== -1) {
          handle(self.__fbriUrl, self.__fbriMethod, bodyStr, self.responseText);
        }
      } catch (e) {
        /* ignore */
      }
    });
    return origSend.apply(this, arguments);
  };
})();
