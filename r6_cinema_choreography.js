/**
 * R6 cinema — simulated cursor, auto document opens, phased story:
 * manual (deliberate) → gate capture → automation wire → future multiply
 */
(function (global) {
  "use strict";
  global = global || (typeof globalThis !== "undefined" ? globalThis : window);

  var Choreo = {
    cursorSpeed: 1,
    manualPace: 0.75,
    autoPace: 0.32,
  };

  function deps() {
    return global.R6Demo || {};
  }

  function $(id) {
    return document.getElementById(id);
  }

  function delay(ms) {
    var d = deps();
    return d.delay ? d.delay(ms) : new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function tokenOk(token) {
    var d = deps();
    return token === d.playToken && !!d.playing;
  }

  function ensureCursor() {
    var stage = $("stage");
    var cur = $("demo-cursor");
    if (!stage) return null;
    if (!cur) {
      cur = document.createElement("div");
      cur.id = "demo-cursor";
      cur.setAttribute("aria-hidden", "true");
      cur.innerHTML =
        '<div class="cursor-ring"></div>' +
        '<div class="cursor-pointer"></div>' +
        '<div class="cursor-click-burst"></div>';
      stage.appendChild(cur);
    }
    return cur;
  }

  function stagePoint(el) {
    var stage = $("stage");
    if (!stage || !el) return null;
    var sr = stage.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    return {
      x: er.left + er.width / 2 - sr.left,
      y: er.top + er.height / 2 - sr.top,
    };
  }

  async function moveCursorTo(el, token, opts) {
    opts = opts || {};
    if (!tokenOk(token) || !el) return;
    var cur = ensureCursor();
    var pt = stagePoint(el);
    if (!cur || !pt) return;
    var ms = Math.round((opts.ms || 720) * Choreo.cursorSpeed);
    cur.classList.add("visible");
    cur.style.transition =
      "left " + ms + "ms cubic-bezier(0.22, 0.9, 0.28, 1), top " + ms + "ms cubic-bezier(0.22, 0.9, 0.28, 1)";
    cur.style.left = pt.x + "px";
    cur.style.top = pt.y + "px";
    await delay(ms + (opts.pause || 80));
  }

  async function simClick(el, token) {
    if (!tokenOk(token) || !el) return;
    var cur = ensureCursor();
    if (cur) cur.classList.add("clicking");
    el.classList.add("cursor-target-pulse");
    await delay(120);
    if (cur) {
      cur.classList.remove("clicking");
      cur.classList.add("clicked");
      setTimeout(function () {
        if (cur) cur.classList.remove("clicked");
      }, 280);
    }
    await delay(160);
    el.classList.remove("cursor-target-pulse");
  }

  function hideCursor() {
    var cur = $("demo-cursor");
    if (cur) cur.classList.remove("visible", "clicking", "clicked");
  }

  function setPhaseBanner(text, mode) {
    var b = $("phase-banner");
    if (!b) return;
    b.textContent = text || "";
    b.className = "phase-banner" + (mode ? " phase-" + mode : "");
    b.classList.toggle("hidden", !text);
  }

  function setManualOverlay(show) {
    var o = $("manual-overlay");
    if (o) o.classList.toggle("hidden", !show);
    var app = document.querySelector('.scene[data-scene="2"] .app-window');
    if (app) app.classList.toggle("manual-mode", !!show);
  }

  async function typeManualField(fieldId, value, token) {
    if (!tokenOk(token)) return;
    var row = document.querySelector('#manual-overlay [data-manual="' + fieldId + '"]');
    var valEl = row && row.querySelector(".manual-val");
    if (!valEl) return;
    await moveCursorTo(row, token, { ms: 520 * Choreo.cursorSpeed });
    await simClick(valEl, token);
    row.classList.add("active");
    valEl.textContent = "";
    var chars = (value || "").split("");
    for (var i = 0; i < chars.length; i++) {
      if (!tokenOk(token)) return;
      valEl.textContent += chars[i];
      await delay(Math.round(38 * Choreo.manualPace));
    }
    row.classList.add("done");
    await delay(Math.round(220 * Choreo.manualPace));
  }

  async function runPhaseManualWalkthrough(token) {
    var d = deps();
    if (!tokenOk(token)) return;

    Choreo.cursorSpeed = Choreo.manualPace;
    setPhaseBanner("Phase 1 · ArchE walks the manual path (careful, deliberate)", "manual");
    if (d.appendTerminal) {
      d.appendTerminal("MANUAL", "mode=human_pace  actor=ArchE  simulate=ops_replay", true);
    }
    if (d.showScene) d.showScene(1);
    await delay(400);

    await delay(900);

    var row = document.querySelector("#gmail-list .gmail-row.hl") ||
      document.querySelector("#gmail-list .gmail-row");
    if (row) {
      await moveCursorTo(row, token, { ms: 900 });
      await simClick(row, token);
    }
    if (d.showScene) d.showScene(2);
    if (d.renderOpenEmail) d.renderOpenEmail();
    setManualOverlay(true);
    await delay(280);

    var docKeys = (d.DEAL && d.DEAL.docs) || [];
    var docLimit = Math.min(1, docKeys.length);
    for (var i = 0; i < docLimit; i++) {
      if (!tokenOk(token)) break;
      var doc = docKeys[i];
      var key = doc.key || doc;
      var sel = '[data-doc-key="' + key + '"]';
      var chip = document.querySelector(sel);
      if (chip) {
        await moveCursorTo(chip, token, { ms: 820 });
        await simClick(chip, token);
        if (d.openDocViewer) d.openDocViewer(key);
        if (d.appendTerminal) d.appendTerminal("MANUAL", "open_attachment  file=" + (doc.label || key), true);
        await delay(Math.round(1100 * Choreo.manualPace));
        if (d.closeDocViewer) d.closeDocViewer();
        await delay(350);
      }
    }

    var deal = d.DEAL || {};
    await typeManualField("legal", deal.legal_name || "Brightline HVAC LLC", token);
    await typeManualField("request", "$" + (deal.requested_usd || 85000).toLocaleString(), token);

    setManualOverlay(false);
    if (d.appendTerminal) d.appendTerminal("MANUAL", "worksheet_complete  elapsed=high  errors=possible", true);
    await delay(400);
    setPhaseBanner("", "");
    hideCursor();
  }

  async function saveGateCard(cardEl, token) {
    if (!tokenOk(token) || !cardEl) return;
    var btn = cardEl.querySelector(".gate-save-btn");
    await moveCursorTo(btn || cardEl, token, { ms: 640 });
    await simClick(btn || cardEl, token);
    cardEl.classList.add("saved");
    var stamp = cardEl.querySelector(".gate-stamp");
    if (stamp) stamp.textContent = "SAVED ✓";
    if (deps().appendTerminal) {
      var gate = cardEl.getAttribute("data-gate") || "gate";
      deps().appendTerminal("GATE", "crystallize  rule=" + gate + "  status=locked", true);
    }
    await delay(Math.round(500 * Choreo.manualPace));
  }

  async function runPhaseGateCapture(token) {
    var d = deps();
    if (!tokenOk(token)) return;

    Choreo.cursorSpeed = Choreo.manualPace;
    if (d.showScene) d.showScene(9);
    setPhaseBanner("Phase 2 · Save the gates (nothing silent hits Close)", "gates");
    await delay(350);

    await delay(700);

    var cards = document.querySelectorAll("#gate-board .gate-card");
    for (var i = 0; i < cards.length; i++) {
      if (!tokenOk(token)) break;
      await saveGateCard(cards[i], token);
    }

    setPhaseBanner("", "");
    hideCursor();
    await delay(300);
  }

  function animateWires(token) {
    var lines = document.querySelectorAll("#wire-canvas .wire-path");
    lines.forEach(function (ln, i) {
      setTimeout(function () {
        if (!tokenOk(token)) return;
        ln.classList.add("live");
      }, i * 320);
    });
    var nodes = document.querySelectorAll("#wire-canvas .wire-node");
    nodes.forEach(function (n, i) {
      setTimeout(function () {
        if (!tokenOk(token)) return;
        n.classList.add("on");
      }, i * 280);
    });
  }

  async function runPhaseStackWhiteboard(token) {
    var d = deps();
    if (!tokenOk(token)) return;

    Choreo.cursorSpeed = 0.7;
    if (d.showScene) d.showScene(10);
    setPhaseBanner("Week 1 · whiteboard your stack (then wire APIs)", "wire");

    var wb = $("stack-whiteboard");
    var wc = $("wire-canvas");
    if (wb) {
      wb.classList.remove("hidden");
      wb.setAttribute("aria-hidden", "false");
      wb.classList.remove("drawing");
      void wb.offsetWidth;
      wb.classList.add("drawing");
    }
    if (wc) wc.classList.add("dimmed");

    var crmSel = $("crm-adapter");
    var wbLbl = $("wb-crm-label");
    if (crmSel && wbLbl) {
      var labels = { zoho: "Zoho CRM bridge", ghl: "Go High Level bridge", hubspot: "HubSpot bridge" };
      wbLbl.textContent = labels[crmSel.value] || "CRM bridge";
    }

    await delay(1400);
    if (wb) {
      wb.classList.remove("drawing");
      wb.classList.add("hidden");
      wb.setAttribute("aria-hidden", "true");
    }
    if (wc) wc.classList.remove("dimmed");
    setPhaseBanner("", "");
    await delay(200);
  }

  async function runPhaseAutomationWire(token) {
    var d = deps();
    if (!tokenOk(token)) return;

    Choreo.cursorSpeed = 0.55;
    if (d.showScene) d.showScene(10);
    setPhaseBanner("Phase 3 · Wire automations on your live stack", "wire");
    await delay(400);

    await delay(800);

    animateWires(token);
    await delay(900);

    var taps = document.querySelectorAll("#wire-canvas .wire-node[data-tap]");
    for (var i = 0; i < taps.length; i++) {
      if (!tokenOk(token)) break;
      var node = taps[i];
      await moveCursorTo(node, token, { ms: 500 });
      await simClick(node, token);
      if (d.appendTerminal) {
        d.appendTerminal("WIRE", "connect  " + (node.getAttribute("data-tap") || ""), true);
      }
      await delay(380);
    }

    setPhaseBanner("", "");
    hideCursor();
    await delay(250);
  }

  async function runPhaseFutureMultiply(token) {
    var d = deps();
    if (!tokenOk(token)) return;

    Choreo.cursorSpeed = Choreo.autoPace;
    if (d.showScene) d.showScene(11);
    setPhaseBanner("Phase 4 · Future state — parallel queue, multiplication", "future");
    await delay(350);

    await delay(900);

    var meter = $("multiply-meter");
    if (meter) meter.classList.add("running");

    var queue = $("deal-queue");
    if (queue) {
      var items = queue.querySelectorAll(".queue-deal");
      for (var i = 0; i < items.length; i++) {
        if (!tokenOk(token)) break;
        items[i].classList.add("processed");
        await moveCursorTo(items[i], token, { ms: 280 });
        await simClick(items[i], token);
        if (d.appendTerminal && i % 2 === 0) {
          d.appendTerminal("AUTO", "batch.process  deal=" + (i + 1) + "  gate=pass", false);
        }
        await delay(320);
      }
    }

    if (meter) {
      var fill = meter.querySelector(".meter-fill");
      var label = meter.querySelector(".meter-label");
      if (fill) fill.style.width = "88%";
      if (label) label.textContent = "Queue draining · ops only touches review lane";
    }

    await delay(1200);
    if (d.showScene) d.showScene(6);
    if (d.renderSlack) d.renderSlack();

    setPhaseBanner("", "");
    hideCursor();
    if (meter) meter.classList.remove("running");
  }

  async function runFastAutomationReplay(token) {
    var d = deps();
    if (!tokenOk(token)) return;
    Choreo.cursorSpeed = Choreo.autoPace;
    setPhaseBanner("Governed speed", "auto");
    if (d.showScene) d.showScene(5);
    if (d.renderClose) d.renderClose();
    await delay(380);
    setPhaseBanner("", "");
  }

  global.R6Choreo = {
    runPhaseManualWalkthrough: runPhaseManualWalkthrough,
    runPhaseGateCapture: runPhaseGateCapture,
    runPhaseStackWhiteboard: runPhaseStackWhiteboard,
    runPhaseAutomationWire: runPhaseAutomationWire,
    runPhaseFutureMultiply: runPhaseFutureMultiply,
    runFastAutomationReplay: runFastAutomationReplay,
    hideCursor: hideCursor,
    setPhaseBanner: setPhaseBanner,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
