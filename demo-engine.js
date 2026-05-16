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
  var manifestPromise = null;
  var voicesReady = false;
  var activeAudios = [];
  var audioPrimed = false;
  var voiceStatusEl = null;

  var TOOL_CATALOG = {
    llm: {
      label: "Agent orchestration",
      doing: "Decomposes the brief into parallel branches, assigns tools, and enforces evidence gates before any answer ships.",
      tie: "Maps VP RevOps question → three evidence branches with explicit ETAs.",
    },
    research: {
      label: "Research synthesis",
      doing: "Queries live web and filings, dedupes sources, and tags each claim with recency and credibility tier.",
      tie: "Supplies market context that explains why internal dashboards diverge.",
    },
    live: {
      label: "Live data pulse",
      doing: "Streams billing cancellations, warehouse cohorts, and CRM activity snapshots in real time.",
      tie: "Anchors the headline churn number to billing events, not dashboard definitions.",
    },
    causal: {
      label: "Causal time-lag analysis",
      doing: "Estimates which inputs move the outcome first — and how many weeks the effect lags.",
      tie: "Separates correlation in dashboards from plausible drivers.",
    },
    abm: {
      label: "Population simulation",
      doing: "Runs thousands of synthetic agents through policy or spend scenarios to see emergent outcomes.",
      tie: "Turns HR or media policy bets into attrition or CPA trajectories.",
    },
    vetting: {
      label: "Evidence vetting gate",
      doing: "Blocks any metric from shipping until conflicts are scored and confidence is bounded.",
      tie: "Explains why CRM says 5.1% but billing-backed churn is 4.2%.",
    },
    workflow: {
      label: "Workflow graph",
      doing: "Executes the plan as a directed graph — replanning when new intel changes priority.",
      tie: "Adds a market-context branch after the competitor 8-K lands.",
    },
    compress: {
      label: "Long-doc compression",
      doing: "Indexes hundred-page playbooks so chat pulls only the slice needed per question.",
      tie: "Keeps escalation paths exact without sending the whole PDF each turn.",
    },
  };

  var TOOL_CHIPS = Object.keys(TOOL_CATALOG).map(function (id) {
    return { id: id, label: TOOL_CATALOG[id].label };
  });

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

  var DEMO_RUN_ID = "agent_20260512T110342Z_scrub";

  function logKind(line) {
    if (/\[FETCH\]/.test(line)) return "fetch";
    if (/\[INVOKE\]|\[TOOL\]|\[CONNECT\]/.test(line)) return "tool";
    if (/FETCH|INVOKE|TOOL|CONNECT/.test(line)) return "tool";
    if (/\[SRC\]|SRC |CITE|URI|evidence/.test(line)) return "src";
    if (/VETTING|VET |CONFLICT/.test(line)) return "vet";
    if (/ANSWER|FORECAST|REFLECT/.test(line)) return "answer";
    if (/WARN|REJECT/.test(line)) return "warn";
    if (/FETCH/.test(line)) return "fetch";
    return "info";
  }
  function runLog(tag, msg, offsetSec) {
    return ts(offsetSec || 0) + "  [" + tag + "]  " + msg;
  }

  /** Live wall-clock + Midwest executive persona for scenario A (no static date in copy). */
  function liveDemoContext() {
    var now = new Date();
    var h = now.getHours();
    var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var dayName = dayNames[now.getDay()];
    var monthName = monthNames[now.getMonth()];
    var greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    var timeHint = h < 12 ? "this morning" : h < 17 ? "this afternoon" : "this evening";
    var localStamp = now.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    var seasonLine =
      monthName === "May"
        ? "May in the Midwest — everything green again, and the forecast finally cooperated"
        : monthName + " in the Midwest — " + timeHint + " on the ops floor feels familiar";
    return {
      now: now,
      dayName: dayName,
      monthName: monthName,
      greeting: greeting,
      timeHint: timeHint,
      localStamp: localStamp,
      seasonLine: seasonLine,
      execFirst: "Jim",
      execTitle: "Chief Financial Officer",
      region: "Midwest",
    };
  }

  function buildScenarioA(ctx) {
    var jim = ctx.execFirst;
    var titleLabel = ctx.execTitle + " · " + ctx.region;
    var jimAsk =
      "ArchE — before standup I need one vetted monthly churn number, and I need to know why Sales, Product, and Finance are each telling a different story.";
    var archeGreeting =
      ctx.greeting +
      ", " +
      jim +
      ". It is a beautiful " +
      ctx.dayName +
      " " +
      ctx.timeHint +
      " — " +
      ctx.seasonLine +
      ". Give me a moment while I pull our thread and the live feeds.";
    var archeAnswer =
      "If you remember, " +
      jim +
      " — last time we put attention on this, we parked on the CRM activity clock versus billing cancel timestamps. Sales was still quoting five point one percent off trailing logins. " +
      "Today I closed that loop. Headline churn is four point two percent at ninety percent confidence — billing cancellations over active subscribers, last thirty days. " +
      "Finance and Product were mixing definitions; I have the reconciliation paths in the trace if you want to walk them before standup.";
    var jimSkeptic =
      "That is a clean story. How do I know you are pointed at real data — not another polished summary?";
    var archeProof =
      "Great question, " +
      jim +
      ". This session hit live billing and warehouse endpoints — vetting passed with three citations. " +
      "Click any source below and the trace will scroll to the exact FETCH or VETTING line. " +
      "If a feed fails in production, you will see it in red here — I do not swap in a plausible number.";

    return {
      title: "Revenue Ops — " + titleLabel + " (live clock)",
      beats: [
        {
          role: "decision",
          label: titleLabel + " → ArchE",
          say: jimAsk,
          pipeline: "intake",
        },
        {
          terminal: [
            runLog("CONTEXT", "local_wall_clock=" + ctx.localStamp + "  tz=visitor  region=US-Midwest", 0),
            runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  tenant=subscription_brand_scrub", 1),
            runLog("MEMORY", "recall thread_id=REV-JIM-014  prior_focus=crm_vs_billing_def", 2),
            runLog("MEMORY", "hit prior_turn: Sales quoted 5.1% CRM activity window", 3),
            runLog("MEMORY", "hit prior_turn: billing cancel_date not in CRM export", 4),
            runLog("INVOKE", "workflow=revenue_truth_single_source  step=decompose_intent", 5),
            runLog("INVOKE", "tool=agent_orchestrator  plan_branches=3  parallel=on", 6),
          ],
          terminalAnchors: [
            "trace-ctx",
            null,
            "trace-memory",
            null,
            null,
            null,
            null,
          ],
          termDelay: 240,
          pipeline: "plan",
          tools: ["llm", "workflow", "research"],
        },
        {
          role: "arche",
          label: "ArchE → " + jim,
          say: archeGreeting,
          terminalParallel: true,
          terminal: [
            runLog("RESEARCH", "recall_embedding  topic=churn_definition  sessions=2  latency_ms=88", 7),
            runLog("FETCH", "decision_memory  uri=internal://thread/REV-JIM-014  status=200", 8),
            runLog("INVOKE", "tool=research_synthesis  market_context=competitor+sector", 9),
          ],
          terminalAnchors: [null, "trace-memory-fetch", null],
          termDelay: 260,
          toolFocus: {
            tool: "research",
            doing: "Recalling your prior working session with " + jim + " while queuing market and billing feeds.",
            tie: "MEMORY and RESEARCH lines in the trace — continuation, not a cold start.",
            also: ["research", "llm"],
          },
          pipeline: "plan",
        },
        {
          terminal: [
            runLog("FETCH", "filings_feed  uri=https://filings.demo.sec.gov/8k/scrub-competitor  status=200  docs=4", 10),
            runLog("FETCH", "analyst_wire  uri=https://news.demo.marketwire/scrub-note  tier=A  age_h=36", 11),
            runLog("FETCH", "market_tick  uri=https://market.demo/quotes/sector-retail  symbols=8", 12),
            runLog("SRC", "citation_id=RS-0041  claim=competitor_guidance_shift", 13),
          ],
          terminalAnchors: [null, null, "trace-market", null],
          termDelay: 220,
          pipeline: "plan",
          tools: ["research", "live"],
          forecast: {
            title: "Projection (feeds landing)",
            rows: [
              { label: "CRM dashboard", pct: 62, value: "5.1%" },
              { label: "Billing stream", pct: 48, value: "3.9–4.6%" },
              { label: "Confidence", pct: 35, value: "35%" },
            ],
            note: "Band narrows after billing stream + vetting.",
          },
        },
        {
          toolFocus: {
            tool: "live",
            doing: "Streaming billing cancellation events — 184k rows in 420ms; warehouse cohort lockstep.",
            tie: "Scroll to trace-fetch-billing when ArchE cites the stream.",
            also: ["live", "llm"],
          },
          terminal: [
            runLog("FETCH", "live_feed:billing_events  uri=https://api.demo.billing.cloud/v2/cancellations  rows=184k  ms=420", 14),
            runLog("FETCH", "warehouse_export:cohort_v3  uri=s3://demo-warehouse-scrub/cohort/churn_v3.parquet  OK", 15),
            runLog("FETCH", "crm_snapshot:activity  uri=https://crm.demo.internal/snapshot/scrub  OK", 16),
            runLog("TOOL", "join billing×cohort  key=subscriber_id  match=99.2%", 17),
            runLog("TOOL", "diff crm_vs_billing  rows_conflict=12,408", 18),
          ],
          terminalAnchors: [
            "trace-fetch-billing",
            "trace-fetch-cohort",
            null,
            null,
            null,
          ],
          termDelay: 200,
          pipeline: "tools",
          tools: ["live", "research"],
        },
        {
          role: "narrator",
          label: "Narration",
          say: "Competitor eight-K just hit the wire — the workflow replans while Jim waits.",
          pipeline: "plan",
        },
        {
          terminal: [
            runLog("INTEL", "push competitor_8k  priority=HIGH  source=RS-0041", 19),
            runLog("REPLAN", "add_branch=market_context  timeline_shift=+12m  graph=v4", 20),
            runLog("FETCH", "filings_feed  uri=https://filings.demo.sec.gov/8k/scrub-amend  status=200", 21),
          ],
          termDelay: 210,
          pipeline: "plan",
          tools: ["workflow", "research"],
          forecast: {
            title: "Updated projection (post intel)",
            rows: [
              { label: "Churn (billing)", pct: 84, value: "4.2%" },
              { label: "CRM if unchanged", pct: 55, value: "5.1%" },
              { label: "Confidence", pct: 90, value: "90%" },
            ],
            note: "Post live pull + conflict vetting.",
          },
        },
        {
          toolFocus: {
            tool: "vetting",
            doing: "Scoring definition mismatch — blocking publish until evidence bundle is sealed.",
            tie: "trace-vet row is what Jim can audit.",
            also: ["vetting", "live"],
          },
          terminal: [
            runLog("VETTING", "conflict=crm_vs_billing  resolution=billing_wins  conf=0.90", 22),
            runLog("VETTING", "hallucination_check=PASS  method=multi_source", 23),
            runLog("SRC", "bundle=EB-REV-12  citations=3", 24),
          ],
          terminalAnchors: [null, "trace-vet", null],
          termDelay: 230,
          pipeline: "vet",
          tools: ["vetting"],
        },
        {
          role: "arche",
          label: "ArchE → " + jim,
          say: archeAnswer,
          pipeline: "answer",
          tools: ["vetting", "live"],
          forecast: {
            title: "Standup recommendation",
            rows: [
              { label: "Q+1 NRR band", pct: 93, value: "92–94%" },
              { label: "Churn (locked)", pct: 84, value: "4.2%" },
              { label: "Dictionary patch", pct: 70, value: "24h" },
            ],
            note: "Billing definition as system of record.",
          },
        },
        {
          role: "decision",
          label: titleLabel + " → ArchE",
          say: jimSkeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: "ArchE → " + jim,
          say: archeProof,
          pipeline: "answer",
          sources: [
            {
              label: "Billing stream — 184k cancellation events (trace)",
              href: "#trace-fetch-billing",
              traceAnchor: "trace-fetch-billing",
            },
            {
              label: "Warehouse cohort export — churn_v3 parquet",
              href: "#trace-fetch-cohort",
              traceAnchor: "trace-fetch-cohort",
            },
            {
              label: "Prior thread REV-JIM-014 — CRM vs billing recall",
              href: "#trace-memory",
              traceAnchor: "trace-memory",
            },
            {
              label: "Vetting bundle EB-REV-12 — conflict resolution",
              href: "#trace-vet",
              traceAnchor: "trace-vet",
            },
            {
              label: "Sample reconciliation sheet (preview)",
              href: "#evidence-sheet-preview",
              traceAnchor: "trace-fetch-billing",
            },
          ],
        },
        {
          terminal: [
            runLog("ANSWER", "churn=4.2%  conf=0.90  citations=3  source=billing", 25),
            runLog("FORECAST", "nrr_q+1=92-94%", 26),
            runLog("REFLECT", "iar=logged  handoff=data_governance", 27),
            runLog("SESSION", "complete  duration=17m48s", 28),
          ],
          termDelay: 200,
          timeline: "T+18m vetted headline  ·  T+2h reconciliation map  ·  T+24h dictionary patch",
          pipeline: "answer",
        },
      ],
    };
  }

  function getScenario(key) {
    if (key === "a") return buildScenarioA(liveDemoContext());
    return JSON.parse(JSON.stringify(SCENARIOS[key]));
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

  function setVoiceStatus(msg) {
    if (!voiceStatusEl) voiceStatusEl = $("#voice-status");
    if (voiceStatusEl) voiceStatusEl.textContent = msg || "";
  }

  /** Must run synchronously inside click/tap — unlocks HTML5 audio + speech for later async beats. */
  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.getVoices();
        var u = new SpeechSynthesisUtterance(" ");
        u.volume = 0.01;
        window.speechSynthesis.speak(u);
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    var probe = new Audio();
    probe.preload = "auto";
    if (audioManifest && audioManifest.files) {
      var first = Object.values(audioManifest.files)[0];
      if (first) probe.src = first;
    }
    probe.volume = 0.01;
    var p = probe.play();
    if (p && p.catch) {
      p.catch(function () {
        setVoiceStatus("Tap Replay if voice is silent (browser blocked autoplay).");
      });
    }
  }

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch("audio/manifest.json")
      .then(function (r) {
        if (!r.ok) throw new Error("no manifest");
        return r.json();
      })
      .then(function (m) {
        audioManifest = m;
        setVoiceStatus(
          m && m.files
            ? "Voice: Edge TTS (" + Object.keys(m.files).length + " clips)"
            : "Voice: browser fallback"
        );
        return m;
      })
      .catch(function () {
        audioManifest = null;
        setVoiceStatus("Voice: browser TTS (manifest unavailable)");
        return null;
      });
    return manifestPromise;
  }

  function playMp3(role, text) {
    if (!audioManifest || !audioManifest.files) return Promise.resolve(false);
    var rel = audioManifest.files[audioKey(role, text)];
    if (!rel) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var a = new Audio(rel);
      a.preload = "auto";
      a.volume = 1;
      activeAudios.push(a);
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        activeAudios = activeAudios.filter(function (x) {
          return x !== a;
        });
        resolve(!!ok);
      }
      a.onended = function () {
        finish(true);
      };
      a.onerror = function () {
        finish(false);
      };
      function tryPlay() {
        var p = a.play();
        if (p && typeof p.then === "function") {
          p.catch(function () {
            finish(false);
          });
        }
      }
      if (a.readyState >= 3) tryPlay();
      else {
        a.addEventListener("canplaythrough", tryPlay, { once: true });
        a.addEventListener("loadeddata", tryPlay, { once: true });
        a.load();
      }
    });
  }

  function speakBrowserOnce(clean, role) {
    return new Promise(function (resolve) {
      if (!voiceOn || !window.speechSynthesis) {
        resolve();
        return;
      }
      speechQueue.push({ clean: clean, role: role, resolve: resolve });
      pumpSpeechQueue();
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
    var clean = cleanForSpeech(text);
    if (!clean) return Promise.resolve();
    setVoiceStatus("Speaking…");

    function playChunks(chunks) {
      var anyPlayed = false;
      return chunks
        .reduce(function (chain, part) {
          return chain.then(function () {
            return playMp3(roleId, part).then(function (ok) {
              if (ok) anyPlayed = true;
            });
          });
        }, Promise.resolve())
        .then(function () {
          return anyPlayed;
        });
    }

    return playMp3(roleId, clean)
      .then(function (playedFull) {
        if (playedFull) return true;
        var chunks = speechChunks(clean);
        if (audioManifest && audioManifest.files && chunks.length > 1) {
          return playChunks(chunks);
        }
        return false;
      })
      .then(function (hadMp3) {
        if (hadMp3) {
          setVoiceStatus(audioManifest ? "Voice: Edge TTS" : "Voice: ON");
          return;
        }
        return speakBrowserOnce(clean, roleId).then(function () {
          setVoiceStatus("Voice: browser TTS");
        });
      });
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
    activeAudios.forEach(function (a) {
      try {
        a.pause();
      } catch (e) {}
    });
    activeAudios = [];
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

  function highlightTools(ids, focusId) {
    document.querySelectorAll(".tool-chip").forEach(function (chip) {
      var id = chip.getAttribute("data-tool");
      var on = ids && ids.indexOf(id) >= 0;
      chip.classList.toggle("lit", !!on);
      chip.classList.toggle("focus", !!focusId && id === focusId);
    });
  }

  function showToolSpotlight(spec) {
    var panel = $("#tool-spotlight");
    if (!panel) return;
    if (!spec || !spec.tool) {
      panel.classList.remove("visible");
      panel.textContent = "";
      return;
    }
    var meta = TOOL_CATALOG[spec.tool] || { label: spec.tool, doing: "", tie: "" };
    panel.classList.add("visible");
    panel.innerHTML =
      '<div class="spot-title">' +
      meta.label +
      "</div>" +
      '<p class="spot-doing"><strong>Now:</strong> ' +
      (spec.doing || meta.doing) +
      "</p>" +
      '<p class="spot-tie"><strong>Ties to log:</strong> ' +
      (spec.tie || meta.tie) +
      "</p>" +
      (spec.forecast
        ? '<p class="spot-forecast"><strong>Forward view:</strong> ' + spec.forecast + "</p>"
        : "");
    highlightTools(spec.also || [spec.tool], spec.tool);
  }

  function setForecast(f) {
    var panel = $("#forecast-panel");
    if (!panel) return;
    if (!f) {
      panel.classList.remove("visible");
      panel.innerHTML = "";
      return;
    }
    panel.classList.add("visible");
    var rows = (f.rows || []).map(function (r) {
      return (
        '<div class="fc-row"><span class="fc-label">' +
        r.label +
        '</span><span class="fc-bar"><span class="fc-fill" style="width:' +
        r.pct +
        '%"></span></span><span class="fc-val">' +
        r.value +
        "</span></div>"
      );
    });
    panel.innerHTML =
      '<div class="fc-head">' +
      (f.title || "Forward projection") +
      "</div>" +
      rows.join("") +
      (f.note ? '<p class="fc-note">' + f.note + "</p>" : "");
  }

  function scrollTraceTo(anchorId) {
    if (!anchorId) return;
    var el = document.getElementById(anchorId);
    var panel = el && el.closest(".panel-body");
    if (!el) return;
    el.classList.add("log-highlight");
    setTimeout(function () {
      el.classList.remove("log-highlight");
    }, 2400);
    if (panel) {
      var top = el.offsetTop - panel.clientHeight / 2;
      panel.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function appendTerminal(line, anchorId) {
    var term = $("#terminal-out");
    if (!term) return;
    var row = document.createElement("div");
    row.className = "log-line log-" + logKind(line);
    if (anchorId) row.id = anchorId;
    row.textContent = line;
    term.appendChild(row);
    var panel = term.closest(".panel-body") || term;
    panel.scrollTop = panel.scrollHeight;
    term.scrollTop = term.scrollHeight;
  }

  function setTimeline(text) {
    var el = $("#plan-timeline");
    if (el) el.textContent = text || "";
  }

  function appendBroadcast(role, label, text, sources) {
    if (role === "narrator") return;
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
    if (sources && sources.length) {
      var ev = document.createElement("div");
      ev.className = "evidence-links";
      var head = document.createElement("strong");
      head.textContent = "Sources ArchE used (scrubbed run)";
      ev.appendChild(head);
      sources.forEach(function (s) {
        var a = document.createElement("a");
        a.href = s.href || "#";
        a.textContent = s.label;
        if (s.traceAnchor) {
          a.addEventListener("click", function (e) {
            e.preventDefault();
            scrollTraceTo(s.traceAnchor);
            if (s.href && s.href.indexOf("#evidence") === 0) {
              var ext = document.querySelector(s.href);
              if (ext) ext.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          });
        } else {
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        ev.appendChild(a);
      });
      row.appendChild(ev);
    }
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    row.style.opacity = "0";
    requestAnimationFrame(function () { row.style.opacity = "1"; });
  }

  function clearTheater() {
    var term = $("#terminal-out");
    var cast = $("#broadcast-out");
    if (term) term.innerHTML = "";
    if (cast) cast.innerHTML = "";
    highlightTools([]);
    showToolSpotlight(null);
    setForecast(null);
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
      var base = getScenario(key);
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
    if (beat.toolFocus) showToolSpotlight(beat.toolFocus);
    if (beat.forecast) setForecast(beat.forecast);
    if (beat.timeline) setTimeline(beat.timeline);

    var termDelay = beat.termDelay != null ? beat.termDelay : 520;

    if (beat.terminal && beat.say && beat.terminalParallel) {
      var roleP = beat.role || "narrator";
      var labelP = beat.label || defaultLabel(roleP);
      appendBroadcast(roleP, labelP, beat.say, beat.sources);
      var speakP = speakQueued(beat.say, roleP);
      for (var ti = 0; ti < beat.terminal.length; ti++) {
        if (token !== playToken) return;
        var aid =
          beat.terminalAnchors && beat.terminalAnchors[ti] ? beat.terminalAnchors[ti] : null;
        appendTerminal(beat.terminal[ti], aid);
        await delay(termDelay);
      }
      await speakP;
      await delay(beat.pauseAfter || 500);
      return;
    }

    if (beat.terminal) {
      for (var i = 0; i < beat.terminal.length; i++) {
        if (token !== playToken) return;
        var anchor =
          beat.terminalAnchors && beat.terminalAnchors[i] ? beat.terminalAnchors[i] : null;
        appendTerminal(beat.terminal[i], anchor);
        await delay(termDelay);
      }
    }

    if (beat.say) {
      var role = beat.role || "narrator";
      var label = beat.label || defaultLabel(role);
      appendBroadcast(role, label, beat.say, beat.sources);
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

    appendTerminal(logLine("SESSION    run_id=" + DEMO_RUN_ID + "  mode=live_validation", 0));
    appendTerminal(logLine("BOOT       orchestrator=workflow_engine  trace=portfolio_demo", 0));
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

  function openModal() {
    var modal = $("#demo-modal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "hidden";
    var chooser = $("#demo-chooser");
    if (chooser) chooser.classList.add("dim");
  }

  function closeModal() {
    playToken++;
    stopSpeech();
    var modal = $("#demo-modal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
    var chooser = $("#demo-chooser");
    if (chooser) chooser.classList.remove("dim");
    var play = $("#play-demo");
    if (play) {
      play.disabled = false;
      play.textContent = "Replay";
    }
  }

  var activeScenario = null;

  function startScenario(key, customQuery) {
    if (key === "d" && !unlocked) {
      alert("Unlock consult preview (code from proposal) for the paid-media scenario and custom brief.");
      return;
    }
    activeScenario =
      customQuery != null ? buildCustomScenario(customQuery) : getScenario(key);
    openModal();
    var title = $("#theater-title");
    if (title) title.textContent = activeScenario.title;
    var play = $("#play-demo");
    if (play) {
      play.disabled = true;
      play.textContent = "Running…";
    }
    loadManifest().then(function () {
      playScenario(activeScenario);
    });
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
      function onPick() {
        primeAudio();
        voiceOn = true;
        var vt = $("#voice-toggle");
        if (vt) vt.textContent = "Voice: ON";
        startScenario(card.getAttribute("data-demo"));
      }
      card.addEventListener("click", onPick);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      });
    });

    $("#run-custom") &&
      $("#run-custom").addEventListener("click", function () {
        if (!unlocked) {
          alert("Unlock consult preview first.");
          return;
        }
        primeAudio();
        voiceOn = true;
        var vt = $("#voice-toggle");
        if (vt) vt.textContent = "Voice: ON";
        var q = sanitizeQuery(($("#custom-query") || {}).value);
        if (q) startScenario(null, q);
      });

    $("#play-demo") &&
      $("#play-demo").addEventListener("click", function () {
        primeAudio();
        if (activeScenario) {
          loadManifest().then(function () {
            playScenario(activeScenario);
          });
        }
      });

    $("#voice-toggle") &&
      $("#voice-toggle").addEventListener("click", function () {
        primeAudio();
        voiceOn = !voiceOn;
        $("#voice-toggle").textContent = voiceOn ? "Voice: ON" : "Voice: OFF";
        if (!voiceOn) {
          stopSpeech();
          setVoiceStatus("Voice: OFF");
        } else {
          setVoiceStatus("Voice: ON");
          pumpSpeechQueue();
        }
      });

    $("#modal-close") &&
      $("#modal-close").addEventListener("click", function () {
        closeModal();
      });
    $("#modal-backdrop") &&
      $("#modal-backdrop").addEventListener("click", function () {
        closeModal();
      });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var modal = $("#demo-modal");
        if (modal && modal.classList.contains("open")) closeModal();
      }
    });

    voiceStatusEl = $("#voice-status");
    loadManifest();

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
