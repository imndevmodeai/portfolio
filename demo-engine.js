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
    if (/RECALL|MEMORY|continuity/.test(line)) return "recall";
    if (/TEMPORAL|viewer_local|weekday/.test(line)) return "temporal";
    if (/ANSWER|FORECAST|REFLECT/.test(line)) return "answer";
    if (/WARN|REJECT/.test(line)) return "warn";
    if (/FETCH/.test(line)) return "fetch";
    return "info";
  }
  function runLog(tag, msg, offsetSec) {
    return ts(offsetSec || 0) + "  [" + tag + "]  " + msg;
  }

  function termEntry(line, anchor) {
    return { line: line, anchor: anchor || "" };
  }

  /** Live viewer clock (Midwest) for ArchE pleasantries — no explicit calendar recitation in speech. */
  function getLiveContext() {
    var tz = "America/Chicago";
    var now = new Date();
    var hour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now),
      10
    );
    var dayName = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
    var month = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(now);
    var clockLocal =
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(now) + " CT";
    var tod = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    var greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    var seasonLine =
      month === "May"
        ? "classic Midwest spring — warm enough to open the windows, storms still rolling through on " +
          dayName +
          " afternoons"
        : month === "June" || month === "July" || month === "August"
          ? "humid Midwest summer heat building across the plains"
          : month === "December" || month === "January" || month === "February"
            ? "cold Midwest winter holding steady — lake-effect grey on the horizon"
            : "season turning across the Midwest — you can feel the shift in the air";
    return {
      execName: "Jim",
      titleLabel: "Chief Financial Officer (Midwest) → ArchE",
      archeLabel: "ArchE → Jim",
      dayName: dayName,
      month: month,
      tod: tod,
      greet: greet,
      seasonLine: seasonLine,
      clockLocal: clockLocal,
    };
  }

  function buildScenarioA(ctx) {
    var jim = ctx.execName;
    var pleasantries =
      ctx.greet +
      ", " +
      jim +
      ". Beautiful " +
      ctx.tod +
      " your way — " +
      ctx.seasonLine +
      ". Give me a moment: I am pulling what we locked on last time while billing streams in.";
    var answerWithMemory =
      "Jim — if you remember, last time we focused on the CRM activity metric versus cancel timestamps in billing. " +
      "Today we close that loop. Headline churn is four point two percent at ninety percent confidence — billing cancellations over active subscribers, last thirty days. " +
      "Sales still sees five point one because their window counts last login; Finance was blending both. " +
      "I recommend billing as system of record for standup; net revenue retention band ninety-two to ninety-four percent next quarter if we patch the dictionary this week.";
    var skeptic =
      "That is a clean story — but how do I know you are not smoothing noise? Are you sure this is the right data?";
    var proofReply =
      "Great question. Every figure below ties to a line in the orchestration trace on the left — click a source and the log scrolls to the fetch. " +
      "This session hit live billing and warehouse endpoints; vetting returned pass with three citations. If a feed fails, you will see it in trace and confidence drops — I do not swap in a polite guess.";

    return {
      title: "Revenue Ops — Midwest CFO Jim (live clock + coworker memory)",
      beats: [
        {
          role: "narrator",
          label: "Narration",
          say:
            "Jim, Midwest subscription finance. ArchE answers with today's rhythm, recalls prior working sessions, and shows every tool call in the trace.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: ctx.titleLabel,
          say:
            "ArchE — I need one vetted monthly churn number before standup, and I need to understand why Sales, Product, and Finance still show different figures.",
          pipeline: "intake",
        },
        {
          terminal: [
            termEntry(runLog("TEMPORAL", "viewer_local=" + ctx.clockLocal + "  weekday=" + ctx.dayName + "  tz=America/Chicago", 0), "trace-temporal"),
            termEntry(runLog("RECALL", "memory_thread=jim_crm_vs_billing  prior_session=standup_apr22  topic=definition_mismatch", 1), "trace-recall"),
            termEntry(runLog("RECALL", "nuance=Jim asked to stop using CRM last-activity as churn proxy", 2), "trace-recall"),
            termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  tenant=midwest_sub_scrub  continuity=ON", 3), "trace-session"),
            termEntry(runLog("INVOKE", "workflow=revenue_truth_single_source  step=decompose_intent", 4)),
            termEntry(runLog("INVOKE", "tool=agent_orchestrator  action=plan_branches  branches=3", 5)),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["llm", "workflow"],
        },
        {
          role: "arche",
          label: ctx.archeLabel,
          say: pleasantries,
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "research_synthesis  uri=https://filings.demo.sec.gov/8k/scrub-competitor  status=200", 6), "trace-research"),
            termEntry(runLog("FETCH", "market_pulse  uri=https://markets.demo/quotes/sector-subscription  status=200  delay_ms=88", 7), "trace-market"),
            termEntry(runLog("FETCH", "analyst_note  uri=https://research.demo/brief/scrub-may-outlook  tier=A", 8)),
            termEntry(runLog("CALC", "reconcile_definitions  crm_field=last_activity  billing_field=cancel_ts", 9), "trace-calc"),
          ],
          termDelay: 260,
        },
        {
          toolFocus: {
            tool: "live",
            doing: "Streaming billing cancellation events — one hundred eighty-four thousand rows in four hundred twenty milliseconds.",
            tie: "Money-movement anchor; lines tagged trace-billing-fetch below.",
            also: ["live", "llm"],
            forecast: "Billing-backed churn converging near four point two percent.",
          },
          terminal: [
            termEntry(runLog("FETCH", "live_feed:billing_events  uri=https://api.demo.billing.cloud/v2/cancellations  rows=184k  latency_ms=420", 10), "trace-billing-fetch"),
            termEntry(runLog("FETCH", "warehouse_export:cohort_v3  uri=s3://demo-warehouse-scrub/cohort/churn_v3.parquet", 11), "trace-warehouse"),
            termEntry(runLog("FETCH", "crm_snapshot:activity_based  uri=https://crm.demo.internal/snapshot/scrub", 12)),
            termEntry(runLog("LINK", "live_feed → answer.churn_source=billing_events", 13)),
            termEntry(runLog("CALC", "rolling_churn_30d  raw=4.18%  smoothed=4.2%", 14), "trace-calc"),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["live", "research"],
          forecast: {
            title: "Projection while streams land",
            rows: [
              { label: "CRM dashboard (activity)", pct: 62, value: "5.1%" },
              { label: "Billing stream", pct: 84, value: "4.2%" },
              { label: "Confidence (pre-vet)", pct: 72, value: "72%" },
            ],
            note: "Band tightens after vetting gate.",
          },
        },
        {
          role: "arche",
          label: ctx.archeLabel,
          say: answerWithMemory,
          pipeline: "vet",
          tools: ["vetting", "research"],
        },
        {
          role: "narrator",
          label: "Narration",
          say: "Competitor eight-K lands mid-run — graph replans, trace shows the branch shift.",
          pipeline: "plan",
        },
        {
          terminal: [
            termEntry(runLog("INTEL", "inject competitor_8k_headline  priority=HIGH", 15), "trace-8k"),
            termEntry(runLog("REPLAN", "add_branch=market_context  timeline_shift=+12m", 16)),
            termEntry(runLog("VETTING", "conflict=crm_vs_billing  resolution=billing_wins  conf=0.90", 17), "trace-vetting"),
            termEntry(runLog("SRC", "evidence_bundle=EB-REV-12  citations=3  check=PASS", 18), "trace-vetting"),
          ],
          termDelay: 260,
          pipeline: "vet",
          tools: ["vetting", "workflow"],
          forecast: {
            title: "Post vetting",
            rows: [
              { label: "Churn (locked)", pct: 84, value: "4.2%" },
              { label: "NRR Q+1 band", pct: 93, value: "92–94%" },
              { label: "Confidence", pct: 90, value: "90%" },
            ],
            note: "Ready for standup.",
          },
        },
        {
          role: "decision",
          label: ctx.titleLabel,
          say: skeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: ctx.archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            {
              label: "Jump to billing stream fetch in trace",
              traceAnchor: "trace-billing-fetch",
            },
            {
              label: "Jump to CRM vs billing recall",
              traceAnchor: "trace-recall",
            },
            {
              label: "Jump to vetting bundle line",
              traceAnchor: "trace-vetting",
            },
            {
              label: "Open cohort export summary (demo sheet)",
              href: "https://imndevmodeai.github.io/portfolio/#evidence-cohort-export",
            },
            {
              label: "Market pulse feed (demo)",
              traceAnchor: "trace-market",
            },
          ],
        },
        {
          terminal: [
            termEntry(runLog("ANSWER", "churn=4.2%  conf=0.90  jim=notified", 19)),
            termEntry(runLog("FORECAST", "nrr_q+1=92-94%  governance_patch=24h", 20)),
            termEntry(runLog("REFLECT", "iar=logged  handoff=data_governance", 21)),
            termEntry(runLog("SESSION", "complete  duration=17m48s  run_id=" + DEMO_RUN_ID, 22)),
          ],
          termDelay: 220,
          timeline: "T+18m vetted headline  ·  T+2h full reconciliation  ·  T+24h dictionary patch",
          pipeline: "answer",
        },
      ],
    };
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

  function scrollToTraceAnchor(anchorId) {
    if (!anchorId) return;
    var row = document.getElementById(anchorId);
    var term = $("#terminal-out");
    if (!row || !term) return;
    row.classList.add("log-highlight");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(function () {
      row.classList.remove("log-highlight");
    }, 2600);
  }

  function appendTerminal(lineOrEntry, anchorId) {
    var term = $("#terminal-out");
    if (!term) return;
    var line = typeof lineOrEntry === "string" ? lineOrEntry : lineOrEntry && lineOrEntry.line;
    var anchor = anchorId || (lineOrEntry && lineOrEntry.anchor) || "";
    if (!line) return;
    var row = document.createElement("div");
    row.className = "log-line log-" + logKind(line);
    row.textContent = line;
    if (anchor) row.id = anchor;
    term.appendChild(row);
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
        a.textContent = s.label;
        if (s.traceAnchor) {
          a.href = "#" + s.traceAnchor;
          a.addEventListener("click", function (e) {
            e.preventDefault();
            scrollToTraceAnchor(s.traceAnchor);
          });
        } else if (s.href) {
          a.href = s.href;
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

  /* portfolio-tts-export: seeds for Edge-TTS build (representative lines; live greet uses browser if no exact MP3). */
  var __PORTFOLIO_TTS_SEEDS__ = [
    { role: "narrator", say: "Jim, Midwest subscription finance. ArchE answers with today's rhythm, recalls prior working sessions, and shows every tool call in the trace." },
    { role: "decision", say: "ArchE — I need one vetted monthly churn number before standup, and I need to understand why Sales, Product, and Finance still show different figures." },
    { role: "arche", say: "Good morning, Jim. Beautiful morning your way — classic Midwest spring — warm enough to open the windows, storms still rolling through on Tuesday afternoons. Give me a moment: I am pulling what we locked on last time while billing streams in." },
    { role: "arche", say: "Jim — if you remember, last time we focused on the CRM activity metric versus cancel timestamps in billing. Today we close that loop. Headline churn is four point two percent at ninety percent confidence — billing cancellations over active subscribers, last thirty days. Sales still sees five point one because their window counts last login; Finance was blending both. I recommend billing as system of record for standup; net revenue retention band ninety-two to ninety-four percent next quarter if we patch the dictionary this week." },
    { role: "narrator", say: "Competitor eight-K lands mid-run — graph replans, trace shows the branch shift." },
    { role: "decision", say: "That is a clean story — but how do I know you are not smoothing noise? Are you sure this is the right data?" },
    { role: "arche", say: "Great question. Every figure below ties to a line in the orchestration trace on the left — click a source and the log scrolls to the fetch. This session hit live billing and warehouse endpoints; vetting returned pass with three citations. If a feed fails, you will see it in trace and confidence drops — I do not swap in a polite guess." },
  ];

  /* ——— Screenplay scenarios ——— */
  var SCENARIOS = {
    a: { hydrate: true },
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
      var base =
        key === "a"
          ? buildScenarioA(getLiveContext())
          : JSON.parse(JSON.stringify(SCENARIOS[key]));
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

  async function drainTerminal(lines, token, termDelay) {
    if (!lines || !lines.length) return;
    for (var i = 0; i < lines.length; i++) {
      if (token !== playToken) return;
      appendTerminal(lines[i]);
      await delay(termDelay || 280);
    }
  }

  async function runBeat(beat, token) {
    if (token !== playToken) return;
    if (beat.pipeline) setPipeline(beat.pipeline);
    if (beat.tools) highlightTools(beat.tools);
    if (beat.toolFocus) showToolSpotlight(beat.toolFocus);
    if (beat.forecast) setForecast(beat.forecast);
    if (beat.timeline) setTimeline(beat.timeline);

    var role = beat.role || "narrator";
    var label = beat.label || defaultLabel(role);

    if (beat.say && beat.terminalParallel && beat.terminalParallel.length) {
      appendBroadcast(role, label, beat.say, beat.sources);
      var speakP = speakQueued(beat.say, role);
      await drainTerminal(beat.terminalParallel, token, beat.termDelay);
      await speakP;
      await delay(beat.pauseAfter || 550);
      return;
    }

    if (beat.terminal) {
      await drainTerminal(beat.terminal, token, beat.termDelay);
    }

    if (beat.say) {
      appendBroadcast(role, label, beat.say, beat.sources);
      await speakQueued(beat.say, role);
      await delay(beat.pauseAfter || 700);
    } else {
      await delay(beat.pauseAfter || 450);
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
      customQuery != null
        ? buildCustomScenario(customQuery)
        : key === "a"
          ? buildScenarioA(getLiveContext())
          : JSON.parse(JSON.stringify(SCENARIOS[key]));
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
