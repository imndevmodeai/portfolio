/**
 * ResonantiA portfolio demo v3 — client-side simulation only.
 * Multi-voice broadcast, timestamped orchestration log, capability picker visuals.
 */
(function () {
  "use strict";

  var ACCESS_CODE = "RESONANT-VIEW";
  var voiceOn = true;
  var unlocked = false;
  var playToken = 0;
  var speechQueue = [];
  var speechBusy = false;
  var audioManifest = null;
  var voicesReady = false;

  var TOOL_CHIPS = [
    { id: "llm", label: "LLM orchestration" },
    { id: "research", label: "Research & synthesis" },
    { id: "causal", label: "Causal inference" },
    { id: "abm", label: "Agent-based modeling" },
    { id: "live", label: "Live data feeds" },
    { id: "vetting", label: "Vetting gate" },
    { id: "workflow", label: "Workflow DAG" },
    { id: "compress", label: "Semantic compression" },
  ];

  var PIPELINE_STEPS = ["intake", "plan", "tools", "vet", "answer"];

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function delay(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function sanitizeQuery(q) {
    return (q || "").trim().slice(0, 500);
  }

  /* ——— Timestamps for terminal ——— */
  var clockStart = 0;
  function ts(offsetSec) {
    var d = new Date(Date.now() - clockStart + offsetSec * 1000);
    return d.toISOString().replace("T", " ").slice(0, 19);
  }

  function logLine(msg, offsetSec) {
    return ts(offsetSec || 0) + "  " + msg;
  }

  /* ——— Voices: queued, full text, three roles ——— */
  function getVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  function pickVoice(role) {
    var voices = getVoices();
    if (role === "narrator") {
      return (
        voices.find(function (v) {
          return /Samantha|Karen|Google US English|Jenny|Aria/i.test(v.name);
        }) || voices.find(function (v) { return v.lang === "en-US"; })
      );
    }
    if (role === "decision") {
      return (
        voices.find(function (v) {
          return /Guy|Mark|David|Google US English Male|Microsoft.*English.*Male/i.test(v.name);
        }) || voices.find(function (v) { return v.lang && v.lang.startsWith("en"); })
      );
    }
    return (
      voices.find(function (v) {
        return /Ryan|Daniel|George|UK English Male|en-GB/i.test(v.name);
      }) || voices.find(function (v) {
        return v.lang === "en-GB";
      }) || voices.find(function (v) { return v.lang && v.lang.startsWith("en"); })
    );
  }

  function defaultLabel(role) {
    if (role === "arche") return "ArchE";
    if (role === "decision") return "Decision maker";
    return "Play-by-play";
  }

  function cleanForSpeech(text) {
    return (text || "")
      .replace(/…/g, "...")
      .replace(/\s+/g, " ")
      .trim();
  }

  function speechChunks(text) {
    var clean = cleanForSpeech(text);
    if (!clean) return [];
    var parts = clean.split(/(?<=[!?])\s+|(?<=\.)\s+(?=[A-Z"'(])/);
    parts = parts
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);
    return parts.length ? parts : [clean];
  }

  function audioKey(role, text) {
    var slug = cleanForSpeech(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return role + "/" + slug + ".mp3";
  }

  function playMp3(role, text) {
    if (!audioManifest || !audioManifest.files) return Promise.resolve(false);
    var rel = audioManifest.files[audioKey(role, text)];
    if (!rel) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var a = new Audio(rel);
      a.preload = "auto";
      a.onended = function () {
        resolve(true);
      };
      a.onerror = function () {
        resolve(false);
      };
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () {
          resolve(false);
        });
      }
    });
  }

  function itemRate(role) {
    if (role === "narrator") return 0.98;
    if (role === "decision") return 0.92;
    return 0.9;
  }

  function speakQueued(text, role) {
    if (!voiceOn) return Promise.resolve();
    var roleId = role || "arche";
    var chunks = speechChunks(text);
    if (!chunks.length) return Promise.resolve();

    return chunks.reduce(function (chain, part) {
      return chain.then(function () {
        return playMp3(roleId, part).then(function (played) {
          if (played) return;
          return new Promise(function (resolve) {
            speechQueue.push({ clean: part, role: roleId, resolve: resolve });
            pumpSpeechQueue();
          });
        });
      });
    }, Promise.resolve());
  }

  function pumpSpeechQueue() {
    if (speechBusy || !voiceOn) return;
    var item = speechQueue.shift();
    if (!item) return;
    speechBusy = true;
    if (!voicesReady && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
    var u = new SpeechSynthesisUtterance(item.clean);
    u.rate = itemRate(item.role);
    u.pitch = item.role === "decision" ? 0.92 : item.role === "narrator" ? 1.05 : 1;
    u.volume = 1;
    var v = pickVoice(item.role);
    if (v) u.voice = v;
    u.onend = function () {
      speechBusy = false;
      item.resolve();
      pumpSpeechQueue();
    };
    u.onerror = function () {
      speechBusy = false;
      item.resolve();
      pumpSpeechQueue();
    };
    window.speechSynthesis.speak(u);
  }

  function stopSpeech() {
    speechQueue = [];
    speechBusy = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  /* ——— UI helpers ——— */
  function setPipeline(stepId) {
    var idx = PIPELINE_STEPS.indexOf(stepId);
    if (idx < 0) idx = 0;
    PIPELINE_STEPS.forEach(function (id, i) {
      var el = document.getElementById("pipe-" + id);
      if (el) el.classList.toggle("active", i <= idx);
    });
  }

  function highlightTools(ids) {
    document.querySelectorAll(".tool-chip").forEach(function (chip) {
      var on = ids && ids.indexOf(chip.getAttribute("data-tool")) >= 0;
      chip.classList.toggle("lit", !!on);
    });
  }

  function appendTerminal(line) {
    var term = $("#terminal-out");
    if (!term) return;
    term.textContent += line + "\n";
    term.scrollTop = term.scrollHeight;
  }

  function setTimeline(text) {
    var el = $("#plan-timeline");
    if (el) el.textContent = text || "";
  }

  function appendBroadcast(role, label, text) {
    var box = $("#broadcast-out");
    if (!box) return;
    var row = document.createElement("div");
    row.className = "cast-line cast-" + role;
    var lab = document.createElement("span");
    lab.className = "cast-label";
    lab.textContent = label;
    var body = document.createElement("span");
    body.className = "cast-text";
    body.textContent = text;
    row.appendChild(lab);
    row.appendChild(body);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    row.style.opacity = "0";
    requestAnimationFrame(function () { row.style.opacity = "1"; });
  }

  function clearTheater() {
    var term = $("#terminal-out");
    var cast = $("#broadcast-out");
    if (term) term.textContent = "";
    if (cast) cast.innerHTML = "";
    highlightTools([]);
    setTimeline("");
    setPipeline("intake");
  }

  function renderToolRack() {
    var rack = $("#tool-rack");
    if (!rack || rack.childElementCount) return;
    TOOL_CHIPS.forEach(function (t) {
      var chip = document.createElement("span");
      chip.className = "tool-chip";
      chip.setAttribute("data-tool", t.id);
      chip.textContent = t.label;
      rack.appendChild(chip);
    });
  }

  /* ——— Screenplay scenarios ——— */
  var SCENARIOS = {
    a: {
      title: "Revenue Ops — one source of truth (live feeds)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Monday morning, D2C subscription brand. The board wants one churn number. Three dashboards disagree. Watch ArchE pull live sources, not a generic paragraph.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "VP Revenue Operations",
          say: "ArchE — what's our actual monthly churn right now, and why do Sales, Product, and Finance dashboards disagree? I need a vetted number before standup.",
          pipeline: "intake",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "ArchE maps the ask to parallel evidence branches. Notice the capability rack — it's selecting research synthesis, live billing pulse, and a vetting gate. Not a single chat completion.",
          pipeline: "plan",
          tools: ["llm", "research", "live", "vetting", "workflow"],
        },
        {
          terminal: [
            logLine("SESSION start  job=metric_reconciliation  operator=vp_revops", 0),
            logLine("PLAN       branches=3  ETA_first_answer=18m  ETA_full_map=2h", 1),
            logLine("TOOL       live_feed:billing_events  latency=420ms  rows=184k", 2),
            logLine("TOOL       warehouse_export:cohort_v3  status=OK", 3),
            logLine("TOOL       crm_snapshot:activity_based  status=OK", 4),
          ],
          pipeline: "tools",
          tools: ["research", "live", "llm"],
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Plan: ingest billing cancellations as source of record, align CRM activity definitions, reconcile sales trailing window. Parallel fetch now; vetting runs on every conflicting claim.",
          pipeline: "tools",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "Mid-flight intel — competitor just filed an 8-K. ArchE ingests the headline, reweights urgency, and extends the plan. That's the dynamic mapper clients don't get from a vanilla LLM.",
          pipeline: "plan",
        },
        {
          terminal: [
            logLine("INTEL      inject  competitor_8k_headline  priority=HIGH", 8),
            logLine("REPLAN     add_branch=market_context  timeline_shift=+12m", 9),
            logLine("VETTING    conflict: crm_vs_billing  confidence=0.90", 11),
          ],
          pipeline: "plan",
          tools: ["research", "live", "vetting", "workflow"],
        },
        {
          timeline: "T+0:18m  vetted headline metric  ·  T+2h  full reconciliation map  ·  T+1d  data dictionary patch",
          pipeline: "answer",
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Churn is 4.2 percent, ninety percent confidence, billing cancellations over active subs. CRM counts last activity, not cancel date. Sales uses a thirty day trailing window. Recommend billing as source of record and document the definition today.",
          pipeline: "answer",
          tools: ["vetting", "research"],
        },
        {
          terminal: [
            logLine("ANSWER     churn=4.2%  conf=0.90  citations=3", 14),
            logLine("REFLECT    logged  handoff=data_governance", 15),
            logLine("SESSION    complete  duration=17m48s", 16),
          ],
          pipeline: "answer",
        },
      ],
    },
    d: {
      title: "Paid media — governed kill rules ($50k/day preview)",
      consultOnly: true,
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Performance agency, fifty thousand a day in spend. They want autopilot kill rules that won't torch the account. ArchE drafts governance, not a slogan.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "Head of Performance Marketing",
          say: "How do we kill losing ads on autopilot without blowing up a fifty thousand dollar day? I need evidence gates, not vibes.",
          pipeline: "intake",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "Watch the rack: live creative performance feeds, causal lag checks, agent simulation, vetting. Shadow mode first — no spend change in this preview.",
          pipeline: "plan",
          tools: ["live", "causal", "abm", "vetting", "workflow", "llm"],
        },
        {
          terminal: [
            logLine("SESSION start  job=media_governance  spend_band=50k/day", 0),
            logLine("PLAN       shadow_mode=ON  canary=5%  kill_cap=8%/hr", 1),
            logLine("TOOL       live_feed:meta_insights  creatives=214", 2),
            logLine("TOOL       feature_snapshot  CPA,ROAS,hook_retention", 3),
          ],
          pipeline: "tools",
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Dual signal kill score: CPA breach plus creative embedding drift. No kill until minimum spend and impressions. Circuit breaker if more than eight percent of budget moves in one hour.",
          pipeline: "tools",
          tools: ["vetting", "live", "causal"],
        },
        {
          timeline: "T+0:7d shadow log only  ·  T+14d 5% canary  ·  T+28d autopilot with rollback",
          pipeline: "answer",
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Every kill emits a JSON trace: features, rule version, model id. If portfolio CPA breaches band after a batch, auto rollback. That's how you earn autopilot on real money.",
          pipeline: "answer",
        },
        {
          terminal: [
            logLine("AUDIT      trace=preview-7f2a  kills=0  shadow_only", 10),
            logLine("SESSION    complete  consult_preview", 11),
          ],
          pipeline: "answer",
        },
      ],
    },
    b: {
      title: "HR policy — 18-month simulation",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say: "CHRO office, remote policy bet. ArchE chains causal lag estimates into an agent population model — not a single LLM essay.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "Chief People Officer",
          say: "Simulate eighteen months of full remote-with-visits. Show attrition and productivity trajectories versus baseline.",
          pipeline: "intake",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "Capability rack lights causal inference, ABM, vetting. Plan projects forty-five minutes to first scenario bundle.",
          pipeline: "plan",
          tools: ["causal", "abm", "llm", "vetting", "workflow"],
        },
        {
          terminal: [
            logLine("SESSION start  job=policy_sim  horizon=18mo", 0),
            logLine("PLAN       causal_lag_estimates  agents=2400", 1),
            logLine("TOOL       abm_run  baseline vs policy  steps=78", 3),
            logLine("VETTING    scenario_realism  status=PASS", 5),
          ],
          pipeline: "tools",
          tools: ["causal", "abm"],
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Policy path: plus zero point eight attrition points by month eighteen. Productivity self report rises early, flat by Q3. Recommend six month pilot before mandate.",
          pipeline: "answer",
          tools: ["vetting"],
        },
        {
          timeline: "T+0:45m scenario bundle  ·  T+3d exec readout deck",
          pipeline: "answer",
        },
        {
          terminal: [
            logLine("ANSWER     attrition_delta=+0.8pt  conf=0.82", 8),
            logLine("SESSION    complete", 9),
          ],
          pipeline: "answer",
        },
      ],
    },
    c: {
      title: "Ops playbook — queryable in minutes",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Two hundred page internal playbook. ArchE compresses and indexes — answers without shipping the whole doc every turn.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "Director of Operations",
          say: "Make this playbook queryable in chat. Small context, fast answers, escalation paths must stay exact.",
          pipeline: "intake",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "Semantic compression plus retrieval — the rack shows compress, research, and vetting before any answer ships.",
          pipeline: "plan",
          tools: ["compress", "research", "llm", "vetting", "workflow"],
        },
        {
          terminal: [
            logLine("SESSION start  job=playbook_rag  pages=198", 0),
            logLine("TOOL       chunk_sections=42  index_entries=812", 1),
            logLine("TOOL       retrieve top_k=3  tokens=2.8k", 3),
            logLine("VETTING    escalation_path=exact_match", 4),
          ],
          pipeline: "tools",
          tools: ["compress", "research"],
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Tier two escalation returns only that section with contacts. Sub second retrieval in production; this preview is illustrative.",
          pipeline: "answer",
        },
        {
          timeline: "T+0:12m indexed  ·  T+0:25m first vetted Q&A slice",
          pipeline: "answer",
        },
      ],
    },
  };

  function routeQuery(q) {
    var t = q.toLowerCase();
    if (/kill|losing ad|roas|cpa|meta|creative|ads|autopilot|50k|media/.test(t)) return "d";
    if (/churn|dashboard|disagree|metric/.test(t)) return "a";
    if (/policy|simulate|18|remote|retention/.test(t)) return "b";
    if (/playbook|rag|doc|compress/.test(t)) return "c";
    return "custom";
  }

  function buildCustomScenario(q) {
    var key = routeQuery(q);
    if (key !== "custom") {
      var base = JSON.parse(JSON.stringify(SCENARIOS[key]));
      base.title = "Your brief (routed preview)";
      if (base.beats && base.beats[1]) {
        base.beats[1].say = q;
        base.beats[1].role = "decision";
        base.beats[1].label = "Decision maker (your text)";
      }
      return base;
    }
    return {
      title: "Your brief (generic preview)",
      beats: [
        {
          role: "narrator",
          say: "Custom intake. ArchE decomposes your language, picks capabilities, and projects a timeline. Production runs on private infrastructure — this page is illustrative.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "Decision maker (your text)",
          say: q,
          pipeline: "intake",
        },
        {
          tools: ["llm", "research", "live", "vetting", "workflow"],
          pipeline: "plan",
        },
        {
          terminal: [logLine("PLAN  intent=" + q.slice(0, 60) + (q.length > 60 ? "…" : ""), 0)],
          pipeline: "plan",
        },
        {
          role: "arche",
          say: "I would parallelize live evidence gathering, run vetting before synthesis, and return confidence-bounded answers with an explicit ETA. Book a consult for a live run on your stack.",
          pipeline: "answer",
        },
        { timeline: "T+0:20m first vetted slice  ·  T+4h decision-grade brief", pipeline: "answer" },
      ],
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

  async function runBeat(beat, token) {
    if (token !== playToken) return;
    if (beat.pipeline) setPipeline(beat.pipeline);
    if (beat.tools) highlightTools(beat.tools);
    if (beat.timeline) setTimeline(beat.timeline);

    if (beat.terminal) {
      for (var i = 0; i < beat.terminal.length; i++) {
        if (token !== playToken) return;
        appendTerminal(beat.terminal[i]);
        await delay(beat.termDelay || 520);
      }
    }

    if (beat.say) {
      var role = beat.role || "narrator";
      var label = beat.label || defaultLabel(role);
      appendBroadcast(role, label, beat.say);
      await speakQueued(beat.say, role);
      await delay(beat.pauseAfter || 700);
    } else {
      await delay(beat.pauseAfter || 650);
    }
  }

  async function playScenario(scenario) {
    var token = ++playToken;
    stopSpeech();
    clearTheater();
    clockStart = Date.now();

    appendTerminal(logLine("BOOT       resonantia-orchestrator  demo_session=portfolio", 0));
    await delay(300);

    var beats = scenario.beats || [];
    for (var i = 0; i < beats.length; i++) {
      if (token !== playToken) return;
      await runBeat(beats[i], token);
    }

    var replay = $("#play-demo");
    if (replay) {
      replay.disabled = false;
      replay.textContent = "Replay";
    }
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
      alert("Unlock consult preview (code from proposal) for the paid-media scenario and custom brief.");
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
    renderToolRack();
    if (sessionStorage.getItem("resonant_portfolio_unlock") === "1") setUnlocked(true);

    $("#access-unlock") &&
      $("#access-unlock").addEventListener("click", function () {
        var v = ($("#access-code") || {}).value || "";
        if (v.trim().toUpperCase() === ACCESS_CODE) setUnlocked(true);
        else alert("Invalid code. Use RESONANT-VIEW from the proposal.");
      });

    document.querySelectorAll(".demo-card").forEach(function (card) {
      card.addEventListener("click", function () {
        startScenario(card.getAttribute("data-demo"));
      });
    });

    $("#run-custom") &&
      $("#run-custom").addEventListener("click", function () {
        if (!unlocked) {
          alert("Unlock consult preview first.");
          return;
        }
        var q = sanitizeQuery(($("#custom-query") || {}).value);
        if (q) startScenario(null, q);
      });

    $("#play-demo") &&
      $("#play-demo").addEventListener("click", function () {
        if (activeScenario) playScenario(activeScenario);
      });

    $("#voice-toggle") &&
      $("#voice-toggle").addEventListener("click", function () {
        voiceOn = !voiceOn;
        $("#voice-toggle").textContent = voiceOn ? "Voice: ON" : "Voice: OFF";
        if (!voiceOn) stopSpeech();
        else pumpSpeechQueue();
      });

    $("#demo-back") &&
      $("#demo-back").addEventListener("click", function (e) {
        e.preventDefault();
        playToken++;
        stopSpeech();
        showTheater(false);
      });

    fetch("audio/manifest.json")
      .then(function (r) {
        if (!r.ok) throw new Error("no manifest");
        return r.json();
      })
      .then(function (m) {
        audioManifest = m;
      })
      .catch(function () {
        audioManifest = null;
      });

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () {
        voicesReady = true;
        window.speechSynthesis.getVoices();
      };
      setTimeout(function () {
        voicesReady = true;
        window.speechSynthesis.getVoices();
      }, 250);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
