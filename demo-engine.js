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
  var activeAudios = [];

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
      activeAudios.push(a);
      a.preload = "auto";
      a.onended = function () {
        activeAudios = activeAudios.filter(function (x) {
          return x !== a;
        });
        resolve(true);
      };
      a.onerror = function () {
        activeAudios = activeAudios.filter(function (x) {
          return x !== a;
        });
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

    return playMp3(roleId, clean).then(function (playedFull) {
      if (playedFull) return;
      var chunks = speechChunks(clean);
      if (audioManifest && audioManifest.files && chunks.length) {
        var allMp3 = chunks.every(function (part) {
          return audioManifest.files[audioKey(roleId, part)];
        });
        if (allMp3) {
          return chunks.reduce(function (chain, part) {
            return chain.then(function () {
              return playMp3(roleId, part);
            });
          }, Promise.resolve());
        }
      }
      return speakBrowserOnce(clean, roleId);
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

  function appendTerminal(line) {
    var term = $("#terminal-out");
    if (!term) return;
    var row = document.createElement("div");
    row.className = "log-line log-" + logKind(line);
    row.textContent = line;
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
        a.href = s.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = s.label;
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
    a: {
      title: "Revenue Ops — CFO asks ArchE (scrubbed production run)",
      beats: [
        {
          role: "narrator",
          label: "Narration",
          say: "Monday morning, subscription brand. The green trace is styled after a real agent run — identifiers scrubbed. Listen for the story; the chat panel is only the Chief Financial Officer speaking with ArchE.",
          pipeline: "intake",
        },
        {
          role: "decision",
          label: "Chief Financial Officer → ArchE",
          say: "ArchE, good morning. Before standup I need one vetted monthly churn number — and I need you to tell me why Sales, Product, and Finance each show something different. Did you actually pull live billing, or are you about to give me a model guess?",
          pipeline: "intake",
        },
        {
          terminal: [
            runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  tenant=retail_sub_brand_scrub  region=us-east", 0),
            runLog("INVOKE", "workflow=revenue_truth_single_source  step=decompose_intent", 1),
            runLog("INVOKE", "tool=agent_orchestrator  action=plan_branches  branches=3", 2),
          ],
          pipeline: "plan",
          tools: ["llm", "workflow"],
        },
        {
          toolFocus: {
            tool: "research",
            doing: "Pulling competitor filings, analyst notes, and pricing pages — ranked by recency with source IDs.",
            tie: "Each FETCH line in the trace maps to a row you can open in Sources when ArchE answers.",
            also: ["llm", "research"],
            forecast: "External narrative may widen churn band until billing stream lands.",
          },
          terminal: [
            runLog("FETCH", "research_synthesis  uri=https://filings.demo.sec.gov/8k/scrub-competitor-q1  status=200  docs=4", 3),
            runLog("FETCH", "research_synthesis  uri=https://news.demo.marketwire/scrub-analyst-note  status=200  tier=A", 4),
            runLog("SRC", "citation_id=RS-0041  recency=48h  claim=competitor_guidance_shift", 5),
          ],
          pipeline: "plan",
        },
        {
          role: "arche",
          label: "ArchE → CFO",
          say: "Good morning — understood. I am not answering from a single dashboard screenshot. I have opened three parallel evidence paths: live billing cancellation stream, warehouse cohort export, and CRM activity snapshot. I will not publish a headline churn figure until the vetting gate scores the CRM versus billing conflict.",
          pipeline: "tools",
        },
        {
          toolFocus: {
            tool: "live",
            doing: "Streaming billing cancellation events — one hundred eighty-four thousand rows in four hundred twenty milliseconds.",
            tie: "This is the money-movement anchor; CRM last-activity is secondary.",
            also: ["live", "llm"],
            forecast: "Billing-backed churn converging near four point two percent at ninety percent confidence target.",
          },
          terminal: [
            runLog("FETCH", "live_feed:billing_events  uri=https://api.demo.billing.cloud/v2/cancellations?window=30d  rows=184k  latency_ms=420", 6),
            runLog("FETCH", "warehouse_export:cohort_v3  uri=s3://demo-warehouse-scrub/cohort/churn_v3.parquet  status=OK", 7),
            runLog("FETCH", "crm_snapshot:activity_based  uri=https://crm.demo.internal/snapshot/scrub-activity  status=OK", 8),
            runLog("TOOL", "link live_feed → answer.churn_source=billing_events", 9),
          ],
          pipeline: "tools",
          tools: ["live", "research"],
          forecast: {
            title: "Projection while streams land",
            rows: [
              { label: "CRM dashboard (activity)", pct: 62, value: "5.1%" },
              { label: "Billing stream (incoming)", pct: 48, value: "3.9–4.6%" },
              { label: "Confidence (pre-vet)", pct: 35, value: "35%" },
            ],
            note: "Band narrows after vetting gate — not before.",
          },
        },
        {
          role: "narrator",
          label: "Narration",
          say: "Mid-flight intel — competitor eight-K lands. Watch the trace: replan adds a branch and shifts the timeline. That is agentic routing, not a frozen chat transcript.",
          pipeline: "plan",
        },
        {
          toolFocus: {
            tool: "workflow",
            doing: "Injecting market-context branch; shifting ETA plus twelve minutes; re-prioritizing research synthesis.",
            tie: "REPLAN row in trace is the proof the graph changed — not just new wording.",
            also: ["workflow", "research", "vetting"],
          },
          terminal: [
            runLog("INTEL", "inject competitor_8k_headline  priority=HIGH  source=RS-0041", 10),
            runLog("REPLAN", "add_branch=market_context  timeline_shift=+12m  graph_version=3", 11),
            runLog("FETCH", "research_synthesis  uri=https://filings.demo.sec.gov/8k/scrub-competitor-q1-amend  status=200", 12),
          ],
          pipeline: "plan",
          forecast: {
            title: "Updated projection (post eight-K)",
            rows: [
              { label: "Churn (billing-backed)", pct: 84, value: "4.2%" },
              { label: "Downside if CRM wins", pct: 55, value: "5.1%" },
              { label: "Confidence", pct: 90, value: "90%" },
            ],
            note: "Trajectory narrowed after live pull plus conflict vetting.",
          },
        },
        {
          toolFocus: {
            tool: "vetting",
            doing: "Scoring CRM versus billing definition mismatch — blocking ship until documented.",
            tie: "VETTING row explains why three dashboards disagreed.",
            also: ["vetting", "live"],
          },
          terminal: [
            runLog("VETTING", "conflict=crm_vs_billing  resolution=billing_wins  conf=0.90", 13),
            runLog("SRC", "evidence_bundle=EB-REV-12  citations=3  hallucination_check=PASS", 14),
          ],
          pipeline: "vet",
          tools: ["vetting"],
        },
        {
          role: "arche",
          label: "ArchE → CFO",
          say: "Headline read: monthly churn is four point two percent at ninety percent confidence, using billing cancellations over active subscribers in the last thirty days. CRM still shows five point one percent because it counts last login, not cancel timestamp. Sales trailing window adds roughly four tenths of a point of noise. I recommend billing as system of record for standup; net revenue retention risk band ninety-two to ninety-four percent next quarter if definitions stay split.",
          pipeline: "answer",
          tools: ["vetting", "research"],
          forecast: {
            title: "Recommendation horizon",
            rows: [
              { label: "Q plus one NRR band", pct: 93, value: "92–94%" },
              { label: "Churn (locked definition)", pct: 84, value: "4.2%" },
              { label: "Governance patch ETA", pct: 70, value: "24h" },
            ],
            note: "Assumes billing definition adopted in standup.",
          },
        },
        {
          role: "decision",
          label: "Chief Financial Officer → ArchE",
          say: "That sounds crisp — but did you actually hit live systems, or is this a hallucinated average? Show me what you touched.",
          pipeline: "answer",
        },
        {
          role: "arche",
          label: "ArchE → CFO",
          say: "Fair challenge. The run connected to live billing and warehouse endpoints in this session — not a static training guess. Vetting returned hallucination_check pass with three citations. Open the links below: billing stream, cohort export, and the eight-K that triggered replan. If any endpoint fails in production, I surface the failure in trace and downgrade confidence — I do not silently substitute a plausible number.",
          pipeline: "answer",
          sources: [
            { label: "Billing cancellation stream (scrubbed demo endpoint)", href: "https://imndevmodeai.github.io/portfolio/#evidence-billing-stream" },
            { label: "Warehouse cohort export manifest", href: "https://imndevmodeai.github.io/portfolio/#evidence-cohort-export" },
            { label: "Competitor eight-K that triggered replan", href: "https://imndevmodeai.github.io/portfolio/#evidence-8k-intel" },
            { label: "Vetting bundle EB-REV-12 (conflict resolution log)", href: "https://imndevmodeai.github.io/portfolio/#evidence-vetting-bundle" },
          ],
        },
        {
          terminal: [
            runLog("ANSWER", "churn=4.2%  conf=0.90  citations=3  source_of_record=billing", 15),
            runLog("FORECAST", "nrr_q+1=92-94%  governance_patch=24h", 16),
            runLog("REFLECT", "iar=logged  handoff=data_governance", 17),
            runLog("SESSION", "complete  duration=17m48s  run_id=" + DEMO_RUN_ID, 18),
          ],
          timeline: "T plus eighteen minutes vetted headline  ·  T plus two hours full reconciliation map  ·  T plus one day data dictionary patch",
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
    if (beat.toolFocus) showToolSpotlight(beat.toolFocus);
    if (beat.forecast) setForecast(beat.forecast);
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
      customQuery != null
        ? buildCustomScenario(customQuery)
        : JSON.parse(JSON.stringify(SCENARIOS[key]));
    openModal();
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
