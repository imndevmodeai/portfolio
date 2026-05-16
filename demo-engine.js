/**
 * ResonantiA portfolio demo — client-side simulation only.
 * No production API, no codex/SPR payloads, no workflow JSON.
 */
(function () {
  "use strict";

  var ACCESS_CODE = "RESONANT-VIEW";
  var voiceOn = true;
  var unlocked = false;

  var PIPELINE_STEPS = [
    { id: "intake", label: "Intake" },
    { id: "plan", label: "Plan" },
    { id: "tools", label: "Tools" },
    { id: "vet", label: "Vetting" },
    { id: "answer", label: "Answer" },
  ];

  var SCENARIOS = {
    a: {
      title: "One source of truth",
      narrative:
        "Multi-source metric alignment with explicit confidence and citations.",
      user: "What's our actual monthly churn rate right now, and why do the dashboards disagree?",
      plan: "Parallel fetch from billing, CRM, and warehouse — then reconcile definitions before answering.",
      terminal: [
        "[orchestrator] scenario=truth_check",
        "[planner] branches=3 (billing, crm, warehouse)",
        "[tool] fetch_metrics … OK (simulated)",
        "[vetting] conflict detected: definition mismatch",
        "[vetting] confidence=0.90 → approved",
        "[synthesis] single answer + citations",
        "[reflection] logged (simulated)",
      ],
      result:
        "Churn: 4.2% (90% confidence). Billing cancellations are source of record. CRM uses last-activity; sales uses 30d trailing window — document the definition in your data dictionary.",
    },
    b: {
      title: "Policy over 18 months",
      narrative: "Causal estimates feed an agent simulation; trajectories compared.",
      user: "Simulate the next 18 months if we go full remote-with-visits. I care about retention and perceived productivity.",
      plan: "Estimate lagged effects, parameterize agents, run baseline vs policy, compare trajectories.",
      terminal: [
        "[orchestrator] scenario=temporal_simulation",
        "[tool] causal_lag_estimates … OK (simulated)",
        "[tool] agent_population_model steps=18 … OK",
        "[tool] trajectory_compare … divergence mid-year",
        "[vetting] caveat flagged: historical stationarity",
        "[reflection] confidence=0.82",
      ],
      result:
        "Policy scenario: voluntary attrition +0.8 pts by month 18; productivity self-report up early then flat. Recommend 6-month pilot before full rollout.",
    },
    c: {
      title: "Large doc → queryable knowledge",
      narrative: "Compress and index without shipping full documents to the model each turn.",
      user: "Turn our 200-page playbook into something we can query in chat — small context, fast answers.",
      plan: "Chunk by section, build compressed knowledge index, retrieve top slices per question.",
      terminal: [
        "[orchestrator] scenario=knowledge_index",
        "[tool] chunk_document sections=42 … OK",
        "[tool] semantic_compress index=812 entries (simulated)",
        "[tool] retrieve top_k=3 for query … OK",
        "[vetting] hallucination guard: pass",
        "[synthesis] answer from retrieved slices only",
      ],
      result:
        "Typical query uses ~2–3k tokens of context instead of 200 pages. Example: tier-2 escalation path returns only that section with contacts.",
    },
    d: {
      title: "Paid ads — safe autopilot (consult preview)",
      narrative:
        "Governed kill rules for high-spend accounts — illustrative, not connected to Meta.",
      user: "How would you architect a kill-the-losing-ad rule that's safe on autopilot at $50k/day?",
      plan: "Policy shell, evidence gates, dual-signal kills, shadow mode, circuit breakers, full audit trace.",
      terminal: [
        "[orchestrator] scenario=media_governance",
        "[planner] constraints=max_kill_rate, min_evidence",
        "[tool] feature_snapshot creative+performance … OK (simulated)",
        "[vetting] dual_signal: CPA breach + embedding drift",
        "[gate] shadow_mode=ON → log only (no spend change)",
        "[audit] trace_id=preview-7f2a (simulated)",
      ],
      result:
        "Would not ship a single boolean on day one. Shadow → 5% canary → autopilot with hourly kill caps, rollback if portfolio CPA breaches band. Every kill gets a JSON trace (features, rule version, model id).",
      consultOnly: true,
    },
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function sanitizeQuery(q) {
    return (q || "").trim().slice(0, 500);
  }

  function routeQuery(q) {
    var t = q.toLowerCase();
    if (/kill|losing ad|roas|cpa|meta|creative|ads|autopilot|50k|media buy/.test(t))
      return "d";
    if (/churn|dashboard|disagree|metric|source of truth/.test(t)) return "a";
    if (/policy|simulate|18 month|remote|retention|abm|causal/.test(t)) return "b";
    if (/rag|playbook|doc|200.page|compress|index|retrieve/.test(t)) return "c";
    return "custom";
  }

  function buildCustomScenario(q) {
    var key = routeQuery(q);
    if (key !== "custom") {
      var base = JSON.parse(JSON.stringify(SCENARIOS[key]));
      base.user = q;
      base.title = "Your question (routed preview)";
      return base;
    }
    return {
      title: "Your question (generic preview)",
      narrative: "Illustrative orchestration — production system not exposed in browser.",
      user: q,
      plan: "Decompose intent → select tools → vet → synthesize with confidence bounds.",
      terminal: [
        "[orchestrator] scenario=custom_preview",
        "[planner] intent=" + (q.slice(0, 48) || "…") + (q.length > 48 ? "…" : ""),
        "[tool] research_branch … OK (simulated)",
        "[vetting] confidence=0.78 → proceed_with_caveats",
        "[synthesis] draft answer (preview only)",
        "[reflection] logged (simulated)",
      ],
      result:
        "This is a portfolio simulation. In production, ArchE runs real tools, vetting, and reflection before any high-stakes action. Book a consult for a live walkthrough on your stack.",
    };
  }

  function setUnlocked(on) {
    unlocked = on;
    sessionStorage.setItem("resonant_portfolio_unlock", on ? "1" : "");
    var gate = $("#access-gate");
    var custom = $("#custom-demo-panel");
    if (gate) gate.classList.toggle("hidden", on);
    if (custom) custom.classList.toggle("locked", !on);
    var badge = $("#unlock-badge");
    if (badge) badge.textContent = on ? "Consult preview unlocked" : "";
  }

  function speakArchE(text) {
    if (!voiceOn || !window.speechSynthesis) return;
    var clean = text
      .replace(/\[.*?\]/g, "")
      .replace(/…/g, "...")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.92;
    u.pitch = 0.95;
    var voices = window.speechSynthesis.getVoices();
    var pick =
      voices.find(function (v) {
        return /Daniel|UK English Male|Ryan|George/i.test(v.name);
      }) ||
      voices.find(function (v) {
        return v.lang && v.lang.startsWith("en");
      });
    if (pick) u.voice = pick;
    window.speechSynthesis.speak(u);
  }

  function setPipelineActive(stepIndex) {
    PIPELINE_STEPS.forEach(function (s, i) {
      var el = document.getElementById("pipe-" + s.id);
      if (el) el.classList.toggle("active", i <= stepIndex);
    });
  }

  function typeTerminal(lines, onLine) {
    var term = $("#terminal-out");
    if (!term) return Promise.resolve();
    term.textContent = "";
    var i = 0;
    return new Promise(function (resolve) {
      function next() {
        if (i >= lines.length) {
          resolve();
          return;
        }
        var line = lines[i];
        term.textContent += line + "\n";
        term.scrollTop = term.scrollHeight;
        setPipelineActive(Math.min(4, 1 + i));
        if (onLine) onLine(line, i);
        i++;
        setTimeout(next, 520);
      }
      next();
    });
  }

  function renderChat(scenario) {
    var chat = $("#chat-out");
    if (!chat) return;
    chat.innerHTML =
      '<div class="msg user"><div class="role">You</div><div class="body"></div></div>' +
      '<div class="msg assistant"><div class="role">ArchE</div><div class="body plan-body"></div></div>' +
      '<div class="msg assistant"><div class="role">ArchE</div><div class="body"><div class="block result"></div></div></div>';
    chat.querySelector(".msg.user .body").textContent = "“" + scenario.user + "”";
    chat.querySelector(".plan-body").textContent = scenario.plan;
    chat.querySelector(".block.result").textContent = scenario.result;
  }

  async function playScenario(scenario) {
    var stage = $("#demo-stage");
    if (stage) stage.classList.add("playing");
    setPipelineActive(0);
    renderChat(scenario);
    var msgs = $("#chat-out").querySelectorAll(".msg");
    msgs.forEach(function (m) {
      m.style.opacity = "0.2";
    });

    await typeTerminal(scenario.terminal);

    msgs[0].style.opacity = "1";
    speakArchE(scenario.user);
    await delay(900);
    msgs[1].style.opacity = "1";
    speakArchE(scenario.plan);
    await delay(1100);
    setPipelineActive(4);
    msgs[2].style.opacity = "1";
    speakArchE(scenario.result);

    var replay = $("#play-demo");
    if (replay) {
      replay.disabled = false;
      replay.textContent = "Replay";
    }
  }

  function delay(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function showTheater(show) {
    var theater = $("#demo-theater");
    var chooser = $("#demo-chooser");
    if (theater) theater.classList.toggle("visible", show);
    if (chooser) chooser.classList.toggle("dim", show);
  }

  var activeScenario = null;

  function startScenario(key, customQuery) {
    if (key === "d" && !unlocked) {
      alert(
        "Scenario D (paid-ads governance) unlocks with the consult code from the proposal."
      );
      return;
    }
    activeScenario =
      customQuery != null
        ? buildCustomScenario(customQuery)
        : JSON.parse(JSON.stringify(SCENARIOS[key]));
    showTheater(true);
    var title = $("#theater-title");
    if (title) title.textContent = activeScenario.title;
    var play = $("#play-demo");
    if (play) {
      play.disabled = true;
      play.textContent = "Running…";
    }
    playScenario(activeScenario);
  }

  function init() {
    if (sessionStorage.getItem("resonant_portfolio_unlock") === "1") setUnlocked(true);

    var codeBtn = $("#access-unlock");
    if (codeBtn) {
      codeBtn.addEventListener("click", function () {
        var v = ($("#access-code") || {}).value || "";
        if (v.trim().toUpperCase() === ACCESS_CODE) setUnlocked(true);
        else alert("Invalid code. Use the consult preview code from the proposal.");
      });
    }

    document.querySelectorAll(".demo-card").forEach(function (card) {
      card.addEventListener("click", function () {
        startScenario(card.getAttribute("data-demo"));
      });
    });

    var customBtn = $("#run-custom");
    if (customBtn) {
      customBtn.addEventListener("click", function () {
        if (!unlocked) {
          alert("Unlock consult preview first (code from proposal).");
          return;
        }
        var q = sanitizeQuery(($("#custom-query") || {}).value);
        if (!q) return;
        startScenario(null, q);
      });
    }

    var playBtn = $("#play-demo");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (activeScenario) playScenario(activeScenario);
      });
    }

    var voiceBtn = $("#voice-toggle");
    if (voiceBtn) {
      voiceBtn.addEventListener("click", function () {
        voiceOn = !voiceOn;
        voiceBtn.textContent = voiceOn ? "Voice: ON" : "Voice: OFF";
        if (!voiceOn) window.speechSynthesis.cancel();
      });
    }

    var back = $("#demo-back");
    if (back) {
      back.addEventListener("click", function (e) {
        e.preventDefault();
        showTheater(false);
        window.speechSynthesis.cancel();
      });
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () {
        window.speechSynthesis.getVoices();
      };
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
