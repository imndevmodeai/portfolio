/**
 * ResonantiA portfolio demo v3 — client-side simulation only.
 * Multi-voice broadcast, timestamped orchestration log, capability picker visuals.
 */
(function () {
  "use strict";

  var ACCESS_CODE = "RESONANT-VIEW";
  /** Live brief API — same host when using scripts/serve_portfolio_live.py */
  var PORTFOLIO_LIVE_API =
    window.PORTFOLIO_LIVE_API ||
    (typeof localStorage !== "undefined" && localStorage.getItem("PORTFOLIO_LIVE_API")) ||
    "";
  var liveApiConfigPromise = null;

  function portfolioFetchHeaders() {
    return { "ngrok-skip-browser-warning": "1" };
  }

  /** True when API is same origin (local :17890 or portfolio tunnel serving the page itself). */
  function isSameOriginApiRoot(root) {
    if (!root || typeof location === "undefined") return false;
    try {
      var u = new URL(root, location.href);
      return u.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  /** Cross-origin ngrok/cloudflare tunnels cannot be embedded safely (interstitial traps the proof iframe). */
  function isTunnelHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    return (
      h.indexOf("ngrok-free") !== -1 ||
      h.indexOf("ngrok.io") !== -1 ||
      h.indexOf("ngrok.app") !== -1 ||
      h.indexOf("trycloudflare.com") !== -1
    );
  }

  /** Allow evidence iframe only when same-origin (or non-tunnel). Never iframe ngrok from github.io. */
  function evidenceEmbedAllowed(url) {
    if (!url) return false;
    if (typeof location === "undefined") return true;
    try {
      var u = new URL(url, location.href);
      if (u.origin === location.origin) return true;
      if (isTunnelHost(u.hostname)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyLiveApiUrl(url) {
    if (!url || typeof url !== "string") return;
    PORTFOLIO_LIVE_API = url.replace(/\/+$/, "");
    if (!/\/api\/portfolio\/brief\/?$/i.test(PORTFOLIO_LIVE_API)) {
      PORTFOLIO_LIVE_API =
        PORTFOLIO_LIVE_API.replace(/\/+$/, "") + "/api/portfolio/brief";
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("PORTFOLIO_LIVE_API", PORTFOLIO_LIVE_API);
        if (typeof location !== "undefined" && location.origin) {
          localStorage.removeItem("PORTFOLIO_LIVE_API_PROBE_" + location.origin);
        }
      }
    } catch (e) {}
    if (typeof window !== "undefined") window.PORTFOLIO_LIVE_API = PORTFOLIO_LIVE_API;
  }

  function loadLiveApiConfig() {
    if (PORTFOLIO_LIVE_API) return Promise.resolve(PORTFOLIO_LIVE_API);
    if (liveApiConfigPromise) return liveApiConfigPromise;
    if (typeof location === "undefined" || !/^https?:/.test(location.protocol)) {
      return Promise.resolve("");
    }
    var host = (location.hostname || "").toLowerCase();
    var needsConfig =
      host.indexOf("github.io") !== -1 ||
      host.indexOf("githubusercontent.com") !== -1;
    if (!needsConfig) return Promise.resolve(resolveLiveApiUrl());
    liveApiConfigPromise = fetch("live-api.json", {
      method: "GET",
      cache: "no-store",
      headers: portfolioFetchHeaders(),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("live-api.json HTTP " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        var url = (cfg && (cfg.brief_api || cfg.briefApi)) || "";
        if (url) applyLiveApiUrl(url);
        return PORTFOLIO_LIVE_API || "";
      })
      .catch(function () {
        return "";
      });
    return liveApiConfigPromise;
  }
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
  var lastArcheAnswerText = "";
  var lastEvidencePack = null;
  var conversationState = { priorQuery: "", priorAnswer: "", presentUrl: "" };
  var followUpBusy = false;
  var lastLiveBriefPayload = null;

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
    var base = clockStart > 0 ? clockStart : Date.now();
    var d = new Date(base + (offsetSec || 0) * 1000);
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
          role: "decision_jim",
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
          role: "decision_jim",
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
              traceAnchor: "trace-warehouse",
              proofKey: "evidence-cohort-export",
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

  function buildScenarioB(ctx) {
    var chro = "Chief People Officer";
    var archeLabel = "ArchE → CHRO";
    var pleasantries =
      ctx.greet +
      ". Before I quote attrition curves — I am loading your last hybrid pilot notes and the workforce snapshot we tagged in March. " +
      "Give me ninety seconds to lock the problem frame and spin baseline versus full remote-with-visits in the population model.";
    var expertAnswer =
      "CHRO — three layers, then the recommendation. " +
      "**Frame:** we are stress-testing a mandatory remote-with-quarterly-visits policy against your current hybrid baseline — not predicting individual resignations. " +
      "Twenty-four hundred agent-employees, calibrated to exit-survey cadence and hire cohorts you already trust. " +
      "**Attrition — voluntary turnover:** policy path adds about **zero point eight percentage points** on rolling twelve-month attrition by month eighteen. " +
      "The effect is **lagged** — most signal lands months ten through fifteen, when manager touchpoints thin out in Q2 crunch. Baseline stays near your **fourteen point two percent** band. " +
      "**Productivity:** self-report bumps months one through four — commute relief and focus — then **flattens by Q3**. " +
      "Our output proxy — throughput times quality gate — does not confirm a lasting gain. Plain language: people *feel* productive before coordination tax shows up. " +
      "**Mechanism HR will recognize:** causal pass puts **twelve-to-fourteen-week lag** from visit-cadence slip to engagement decay; ABM shows **weak cross-team ties** when visit weeks cluster instead of spreading. " +
      "**Call:** six-month pilot in **two business units** with enforced visit cadence and monthly manager calibration — not enterprise mandate. Confidence **zero point eight two** after realism vetting; widen if you want union or geo slices next run.";
    var skeptic =
      "That reads polished — but how do I know this is not HR-flavored fiction? What actually ran, and what would break my credibility in the room?";
    var proofReply =
      "Fair challenge. Every claim maps to a line in the orchestration trace — click **workforce fetch**, **causal lag**, or **ABM emergent** and the log scrolls. " +
      "We ingested a scrubbed workforce snapshot, estimated treatment lags on engagement and manager hours, then ran **seventy-eight** ABM steps for baseline versus policy. " +
      "Vetting returned **PASS** with explicit boundary notes: no union shock in this bundle, productivity is self-report heavy. " +
      "If a feed fails, you will see **WARN** in trace and confidence drops — I do not ship a polite essay.";

    return {
      title: "HR policy — 18-month simulation (mapper-depth trace)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "CHRO office, remote policy bet. ArchE runs the same spine as the thought mapper — problem frame, process graph, tool branches, vetting gate — then a board-ready answer.",
          pipeline: "intake",
        },
        {
          role: "decision_chro",
          label: chro,
          say:
            "Simulate eighteen months of full remote-with-visits versus our current hybrid baseline. Show attrition and productivity trajectories, and tell me what breaks if we mandate too fast.",
          pipeline: "intake",
        },
        {
          terminal: [
            termEntry(runLog("TEMPORAL", "viewer_local=" + ctx.clockLocal + "  policy_horizon=18mo", 0), "trace-temporal"),
            termEntry(runLog("RECALL", "memory_thread=hybrid_pilot_q1  prior=visit_cadence_slip_in_ops", 1), "trace-recall"),
            termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  job=policy_sim  tenant=hr_scrub", 2), "trace-session"),
            termEntry(runLog("MAP", "problem_frame  entities=policy,baseline,attrition,productivity  horizon=18mo", 3), "trace-map-problem"),
            termEntry(runLog("MAP", "constraints=union_calm_month  visit_min/quarter  manager_hours_cap", 4), "trace-map-problem"),
            termEntry(runLog("INVOKE", "workflow=policy_abm_causal  step=decompose_intent", 5)),
            termEntry(runLog("INVOKE", "tool=agent_orchestrator  branches=causal|abm|vetting", 6), "trace-map-process"),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["llm", "workflow"],
        },
        {
          role: "arche",
          label: archeLabel,
          say: pleasantries,
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "workforce_snapshot  uri=s3://demo-hr-scrub/workforce/cohort_2024q4.parquet  rows=24k", 7), "trace-workforce"),
            termEntry(runLog("FETCH", "engagement_pulse  uri=https://hris.demo/internal/engagement/monthly  status=200", 8), "trace-engagement"),
            termEntry(runLog("FETCH", "exit_survey_calibration  uri=https://hris.demo/internal/exits/rolling  tiers=A/B", 9)),
          ],
          termDelay: 260,
        },
        {
          toolFocus: {
            tool: "causal",
            doing:
              "Estimating lagged effects — how many weeks after visit-cadence slips before engagement scores and exit risk move.",
            tie: "Lines tagged trace-causal below; this is the 'why' branch HR leaders expect.",
            also: ["causal", "llm"],
            forecast: "Manager-touchpoint lag clustering near twelve to fourteen weeks.",
          },
          terminal: [
            termEntry(runLog("INVOKE", "tool=causal_inference  action=estimate_lagged_effects  max_lag=16w", 10), "trace-causal"),
            termEntry(runLog("CALC", "treatment=visit_cadence  outcome=engagement_decay  lag_weeks=12-14", 11), "trace-causal"),
            termEntry(runLog("CALC", "treatment=manager_hours  outcome=voluntary_exit_risk  lag_weeks=10", 12), "trace-causal"),
            termEntry(runLog("LINK", "causal_graph → abm.agent_rules.manager_touch", 13)),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["causal", "workflow"],
          forecast: {
            title: "Causal branch — while lags settle",
            rows: [
              { label: "Visit → engagement lag", pct: 78, value: "12–14 wk" },
              { label: "Engagement → exit risk", pct: 71, value: "10 wk" },
              { label: "Branch confidence", pct: 74, value: "74%" },
            ],
            note: "ABM will stress-test these lags under policy shock.",
          },
        },
        {
          toolFocus: {
            tool: "abm",
            doing:
              "Running twenty-four hundred synthetic employees through baseline hybrid versus remote-with-visits — seventy-eight time steps.",
            tie: "Emergent attrition and productivity curves tagged trace-abm below.",
            also: ["abm", "causal"],
            forecast: "Policy attrition path diverging from baseline after month nine.",
          },
          terminal: [
            termEntry(runLog("INVOKE", "tool=abm  agents=2400  steps=78  scenarios=baseline|policy", 14), "trace-abm"),
            termEntry(runLog("ABM", "phase=burn_in  steps=12  stability=OK", 15), "trace-abm"),
            termEntry(runLog("ABM", "emergent=weak_tie_decay  trigger=clustered_visit_weeks", 16), "trace-abm-emergent"),
            termEntry(runLog("ABM", "metric=attrition_12mo_roll  baseline=14.2%  policy=15.0%@m18", 17), "trace-abm-metric"),
            termEntry(runLog("ABM", "metric=productivity_self  lift=m1-m4  flat=m7+", 18), "trace-abm-metric"),
            termEntry(runLog("CALC", "attrition_delta=+0.8pt@month18  productivity_proxy=flat", 19), "trace-calc"),
          ],
          termDelay: 260,
          pipeline: "tools",
          tools: ["abm", "causal"],
          forecast: {
            title: "ABM projection — month eighteen",
            rows: [
              { label: "Attrition (policy)", pct: 82, value: "+0.8 pt" },
              { label: "Productivity (self-report)", pct: 55, value: "early lift, flat Q3" },
              { label: "Scenario confidence", pct: 82, value: "82%" },
            ],
            note: "Pending realism vetting gate.",
          },
        },
        {
          role: "arche",
          label: archeLabel,
          say: expertAnswer,
          pipeline: "vet",
          tools: ["vetting", "abm"],
        },
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Scenario realism vetting runs — boundary conditions logged before the answer ships.",
          pipeline: "vet",
        },
        {
          terminal: [
            termEntry(runLog("VETTING", "scenario_realism  status=PASS  conf=0.82", 20), "trace-vetting"),
            termEntry(runLog("VETTING", "boundary=union_shock_omitted  productivity=self_report_heavy", 21), "trace-vetting"),
            termEntry(runLog("SRC", "evidence_bundle=EB-HR-07  citations=4  check=PASS", 22), "trace-vetting"),
            termEntry(runLog("REFLECT", "iar=logged  crystallization_potential=medium", 23)),
          ],
          termDelay: 240,
          pipeline: "vet",
          tools: ["vetting"],
          forecast: {
            title: "Post-vetting — board-ready band",
            rows: [
              { label: "Attrition delta (locked)", pct: 82, value: "+0.8 pt" },
              { label: "Pilot recommendation", pct: 88, value: "2 BU / 6 mo" },
              { label: "Confidence", pct: 82, value: "82%" },
            ],
            note: "Ready for exec readout.",
          },
        },
        {
          role: "decision_chro",
          label: chro,
          say: skeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            { label: "Jump to workforce snapshot fetch", traceAnchor: "trace-workforce" },
            { label: "Jump to causal lag estimates", traceAnchor: "trace-causal" },
            { label: "Jump to ABM emergent pattern", traceAnchor: "trace-abm-emergent" },
            { label: "Jump to vetting bundle", traceAnchor: "trace-vetting" },
          ],
        },
        {
          timeline: "T+0:45m scenario bundle  ·  T+3d exec readout  ·  T+6mo pilot gate review",
          pipeline: "answer",
        },
        {
          terminal: [
            termEntry(runLog("ANSWER", "attrition_delta=+0.8pt  productivity=flat_Q3  conf=0.82", 24), "trace-answer"),
            termEntry(runLog("FORECAST", "recommend=pilot_2bu_6mo  mandate=HOLD", 25)),
            termEntry(runLog("SESSION", "complete  duration=43m12s  run_id=" + DEMO_RUN_ID, 26)),
          ],
          termDelay: 220,
          pipeline: "answer",
        },
      ],
    };
  }

  /** Scenario D — paid media: thousands of levers, automated closed loop (RESONANT-VIEW). */
  function buildScenarioD(userQuery) {
    var perfLead = "Head of Performance Marketing";
    var archeLabel = "ArchE";
    var defaultAsk =
      "How would you architect a kill-the-losing-ad rule safe at fifty thousand dollars a day—when the account has thousands of levers and the goal is full automation, not humans tuning each dial?";
    var ask = (userQuery && String(userQuery).trim()) || defaultAsk;

    var expertAnswer =
      "You are not short on signals—you are short on a governor. The job posting is explicit: an agent that reasons over thousands of variables—creative features, audience slices, ROAS, CPA, hook performance—and ships the next action through your VEO, Fal, ElevenLabs, sync.so pipe into Meta. That only works if automation is layered: an orchestration plane beside your Next.js and Prisma app, not a bigger prompt. Sensors are RedTrack plus account metrics landing in Postgres; Meta Marketing API is the actuator only. Every proposed kill, launch, or budget shift is a versioned job in the graph with tool contracts per step—planner, render QC, attribution ingest, policy check—so one bad LLM narration cannot move spend. Thousands of levers collapse into scored actions: policy shell caps how much budget can move per hour; evidence gates block kills until an ad has enough spend and conversions for its objective class; a dual-signal kill score requires CPA stress and creative embedding drift to agree. Shadow mode logs decisions without executing, then a five percent canary slice, then autopilot with rollback if portfolio CPA breaches band after a kill batch. That is how you remove yourselves from the loop without removing accountability.";

    var proofReply =
      "Click the trace on the left—lever registry ingest, job graph compile, shadow kills with execute equals zero. This preview is illustrative; production wires your live RedTrack fields and Prisma audit tables. Full threshold math and rollback rules stay on a paid consult—this demo shows the conversation shape and the automation spine your stack already asked for.";

    var skeptic =
      "Thousands of variables sounds like hype. How is this different from rules in Madgicx or a spreadsheet with twenty conditions?";

    return {
      title: "Paid media — thousands of levers, automated closed loop",
      consultOnly: true,
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say: "E-commerce performance agency, fifty thousand a day in spend. They want a closed loop: research, creative, Meta launch, live performance feeding back into what gets built next—with humans stepping out of the loop. ArchE models the orchestration plane, not a single kill switch.",
          pipeline: "intake",
        },
        {
          role: "decision_media",
          label: perfLead,
          say: ask,
          pipeline: "intake",
        },
        {
          role: "narrator",
          label: "Analyst booth",
          say: "Watch the rack ingest thousands of levers—creative embeddings, audience dimensions, ROAS and CPA slices, hook proxies—then compile an automated job graph. Shadow mode only in this preview: kills are logged, not sent to Meta.",
          pipeline: "plan",
          tools: ["live", "compress", "research", "causal", "abm", "vetting", "workflow", "llm"],
        },
        {
          toolFocus: {
            tool: "live",
            doing:
              "Streaming Meta insights plus RedTrack attribution into the feature store—hourly performance slices keyed by creative id.",
            tie: "Lines tagged trace-ingest below; these are the sensors, not the brain.",
            also: ["live", "workflow"],
            forecast: "Feature rows landing for multimodal RAG over creative plus outcome vectors.",
          },
          terminal: [
            termEntry(runLog("SESSION", "job=closed_loop_media  spend_band=50k/day  mode=shadow", 0)),
            termEntry(runLog("INGEST", "lever_registry  creative_features=1842  audience_dims=396  budget_slices=612", 1), "trace-ingest"),
            termEntry(runLog("INGEST", "signals=ROAS,CPA,hook_retention,thumb_stop,embed_distance  total_dims=2850", 2), "trace-ingest"),
            termEntry(runLog("STORE", "postgres.feature_store  vectors=multimodal_rag  refresh=hourly", 3), "trace-ingest"),
          ],
          termDelay: 260,
          pipeline: "tools",
          tools: ["live", "compress"],
        },
        {
          toolFocus: {
            tool: "workflow",
            doing:
              "Compiling job graph: planner issues tool contracts to research, script, VEO/Fal/ElevenLabs/sync.so QC, then Meta actuator—each step scoped, retries bounded.",
            tie: "Orchestration plane beside Vercel app; agents write through APIs you already trust.",
            also: ["workflow", "llm", "vetting"],
            forecast: "Closed loop propose → shadow log → canary → promote when gates pass.",
          },
          terminal: [
            termEntry(runLog("GRAPH", "nodes=research|angle|render_qc|meta_launch|perf_feedback", 4), "trace-graph"),
            termEntry(runLog("GRAPH", "edge=perf_feedback→rag_retrain→planner  loop=closed", 5), "trace-graph"),
            termEntry(runLog("POLICY", "shell=ON  max_budget_move=8%/hr  max_kills=12/window", 6), "trace-policy"),
            termEntry(runLog("MODE", "shadow=ON  canary=5%  execute_meta=BLOCKED", 7), "trace-policy"),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["workflow", "llm"],
          forecast: {
            title: "Automation spine — while graph compiles",
            rows: [
              { label: "Levers indexed", pct: 88, value: "2,850 dims" },
              { label: "Human gates", pct: 72, value: "gradual exit" },
              { label: "Shadow confidence", pct: 79, value: "79%" },
            ],
            note: "Kill score runs in log-only mode until canary promotion.",
          },
        },
        {
          toolFocus: {
            tool: "causal",
            doing:
              "Ranking which lever families actually move CPA—creative drift vs audience fatigue vs budget pacing—not correlating noise.",
            tie: "Causal lag estimates inform kill-score weights; tagged trace-causal.",
            also: ["causal", "abm"],
          },
          terminal: [
            termEntry(runLog("INVOKE", "tool=causal_inference  families=creative|audience|pacing", 8), "trace-causal"),
            termEntry(runLog("CALC", "lag=hook_retention→CPA  weeks=1-2  conf=0.76", 9), "trace-causal"),
            termEntry(runLog("SCORE", "kill_candidates=37  dual_signal_required=YES", 10), "trace-score"),
          ],
          termDelay: 220,
          pipeline: "tools",
          tools: ["causal", "abm"],
        },
        {
          role: "arche",
          label: archeLabel,
          say: expertAnswer,
          pipeline: "vet",
          tools: ["vetting", "workflow", "live"],
        },
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Vetting gate: no external spend change in shadow. Every automated decision still emits a JSON trace—features, rule version, model route—so you can debug a two a.m. kill without guessing.",
          pipeline: "vet",
        },
        {
          terminal: [
            termEntry(runLog("VETTING", "governance_layer  status=PASS  shadow_only=YES", 11), "trace-vetting"),
            termEntry(runLog("SHADOW", "kills_logged=14  kills_executed=0  canary_slice=5%", 12), "trace-shadow"),
            termEntry(runLog("AUDIT", "trace=preview-media-9c4e  rollback_armed=YES", 13), "trace-vetting"),
          ],
          termDelay: 240,
          pipeline: "vet",
          tools: ["vetting"],
        },
        {
          role: "decision_media",
          label: perfLead,
          say: skeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            { label: "Jump to lever registry ingest", traceAnchor: "trace-ingest" },
            { label: "Jump to closed-loop job graph", traceAnchor: "trace-graph" },
            { label: "Jump to policy shell and shadow mode", traceAnchor: "trace-policy" },
            { label: "Jump to shadow kill log", traceAnchor: "trace-shadow" },
          ],
        },
        {
          timeline: "T+0:7d shadow log only  ·  T+14d 5% canary on kills and launches  ·  T+28d autopilot with portfolio rollback",
          pipeline: "answer",
        },
        {
          terminal: [
            termEntry(runLog("ANSWER", "architecture=orchestration_plane  levers=automated  meta=actuator_only", 14), "trace-answer"),
            termEntry(runLog("FORECAST", "human_review=gradual_exit  consult=thresholds_on_call", 15)),
            termEntry(runLog("SESSION", "complete  mode=consult_preview  run_id=" + DEMO_RUN_ID, 16)),
          ],
          termDelay: 220,
          pipeline: "answer",
        },
      ],
    };
  }


  /* ——— Voices: queued, full text, three roles ——— */
  function getVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  /** Edge TTS cast: narrator + arche fixed; each business character has its own decision_* role. */
  function pickVoice(role) {
    var voices = getVoices();
    if (role === "narrator") {
      return (
        voices.find(function (v) {
          return /Aria|Samantha|Karen|Google US English/i.test(v.name);
        }) || voices.find(function (v) { return v.lang === "en-US"; })
      );
    }
    if (role === "arche") {
      return (
        voices.find(function (v) {
          return /Ryan/i.test(v.name);
        }) ||
        voices.find(function (v) {
          return /Microsoft.*Ryan|en-GB.*Ryan/i.test(v.name);
        }) ||
        voices.find(function (v) {
          return v.lang === "en-GB" && /Male/i.test(v.name) && !/Female/i.test(v.name);
        }) ||
        voices.find(function (v) { return v.lang === "en-GB"; })
      );
    }
    var decisionHints = {
      decision_jim: /Andrew|Davis|Mark|David/i,
      decision_chro: /Michelle|Samantha|Jenny|Aria|Zira/i,
      decision_ops: /Guy|Mark|Eric|David/i,
      decision_media: /Jenny|Michelle|Samantha|Aria|Zira/i,
      decision_jordan: /Eric|Andrew|Guy/i,
      decision_guest: /Brian|Guy|Mark/i,
    };
    var hint = decisionHints[role];
    if (hint) {
      return (
        voices.find(function (v) {
          return hint.test(v.name);
        }) || voices.find(function (v) { return v.lang && v.lang.startsWith("en"); })
      );
    }
    if (role === "decision" || (role && role.indexOf("decision_") === 0)) {
      return (
        voices.find(function (v) {
          return /Guy|Mark|David|Google US English Male|Microsoft.*English.*Male/i.test(v.name);
        }) || voices.find(function (v) { return v.lang && v.lang.startsWith("en"); })
      );
    }
    return voices.find(function (v) { return v.lang && v.lang.startsWith("en"); });
  }

  function defaultLabel(role) {
    if (role === "arche") return "ArchE";
    if (role === "decision_jim") return "Jim · CFO";
    if (role === "decision_chro") return "Chief People Officer";
    if (role === "decision_ops") return "Director of Operations";
    if (role === "decision_media") return "Head of Performance Marketing";
    if (role === "decision_jordan") return "Jordan · job seeker";
    if (role === "decision_guest") return "Decision maker";
    if (role === "decision") return "Decision maker";
    return "Play-by-play";
  }

  function cleanForSpeech(text) {
    return (text || "")
      .replace(/\*\*/g, "")
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

  function showPresentGiftLink(presentPath) {
    var link = $("#present-gift-link");
    if (!link || !presentPath) return;
    var root = resolvePortfolioApiRoot();
    link.href = root ? root + presentPath : presentPath;
    link.classList.remove("hidden");
    conversationState.presentUrl = link.href;
    var inline = $("#unlock-gift-inline");
    if (inline) {
      inline.href = link.href;
      inline.removeAttribute("data-disabled");
    }
  }

  function hidePresentGiftLink() {
    var link = $("#present-gift-link");
    if (link) {
      link.classList.add("hidden");
      link.href = "#";
    }
  }

  function showBriefCompleteToast(message) {
    var toast = $("#brief-complete-toast");
    if (!toast) return;
    toast.textContent =
      message ||
      "Brief complete — sticky pilot bar is live. Text or email from this page (Upwork-safe).";
    toast.classList.add("visible");
    setTimeout(function () {
      toast.classList.remove("visible");
    }, 12000);
  }

  function updateConversationFromScenario(live, customQuery) {
    if (live && live.is_follow_up) {
      if (live.prior_query) conversationState.priorQuery = live.prior_query;
    } else if (customQuery) {
      conversationState.priorQuery = customQuery;
    }
    if (live && live.arche_answer_snippet) {
      conversationState.priorAnswer = live.arche_answer_snippet;
    } else if (lastArcheAnswerText) {
      conversationState.priorAnswer = lastArcheAnswerText;
    }
    if (live && live.present_url) {
      showPresentGiftLink(live.present_url);
    }
    if (live && live.needs_clarification) {
      focusClarificationFollowUp(live);
    }
  }

  function focusClarificationFollowUp(live) {
    var followEl = $("#answer-followup");
    if (!followEl) return;
    var hint =
      live.clarification_question ||
      "Add your business type and city/ZIP (e.g. auto repair in Kalamazoo 49007)";
    followEl.placeholder = hint.slice(0, 120);
    followEl.setAttribute("aria-label", hint);
    setTimeline("Scope check — answer in the follow-up field, then Submit");
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
        var castNote =
          m && m.cast && m.cast.arche
            ? " · ArchE=" + String(m.cast.arche).replace(/Neural.*/, "")
            : "";
        setVoiceStatus(
          m && m.files
            ? "Voice: Edge TTS (" + Object.keys(m.files).length + " clips)" + castNote
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
    if (role === "decision" || (role && role.indexOf("decision_") === 0)) return 0.92;
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

    var apiRoot = resolvePortfolioApiRoot();
    // Prefer prebuilt MP3s for canned demos. Live Ryan API is optional enhancement —
    // never leave ArchE silent when API/ngrok fails (GitHub Pages + tunnel trap).
    var preferLiveRyan = roleId === "arche" && apiRoot && isSameOriginApiRoot(apiRoot);

    function afterMp3(hadMp3) {
      if (hadMp3) {
        setVoiceStatus(audioManifest ? "Voice: Edge TTS (manifest)" : "Voice: ON");
        return;
      }
      return playEdgeTtsApi(roleId, clean).then(function (hadLive) {
        if (hadLive) {
          setVoiceStatus(
            roleId === "arche"
              ? "Voice: Edge TTS · en-GB-RyanNeural"
              : "Voice: Edge TTS (live)"
          );
          return;
        }
        return speakBrowserOnce(clean, roleId).then(function () {
          setVoiceStatus(roleId === "arche" ? "Voice: browser (not Ryan)" : "Voice: browser TTS");
        });
      });
    }

    if (preferLiveRyan) {
      return playEdgeTtsApi(roleId, clean).then(function (hadLive) {
        if (hadLive) {
          setVoiceStatus("Voice: Edge TTS · en-GB-RyanNeural");
          return;
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
          .then(afterMp3);
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
      .then(afterMp3);
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
    u.pitch =
      item.role && item.role.indexOf("decision_") === 0
        ? 0.92
        : item.role === "decision"
          ? 0.92
          : item.role === "narrator"
            ? 1.05
            : 1;
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
    hideSpeakerPopup();
  }

  /** Portrait / φ-shell shown while a role is speaking (must match Edge TTS cast gender). */
  var SPEAKER_VISUALS = {
    arche: {
      src: "assets/arche-phi-shell.png",
      title: "ArchE",
      subtitle: "φ-shell 2D knowledge layout",
      arche: true,
    },
    decision_jim: {
      src: "assets/speakers/jim-cfo.png",
      title: "Jim · CFO",
      subtitle: "Midwest subscription finance",
    },
    decision_chro: {
      src: "assets/speakers/chro.svg",
      title: "Chief People Officer",
      subtitle: "HR policy simulation",
    },
    decision_ops: {
      src: "assets/speakers/ops-director.svg",
      title: "Director of Operations",
      subtitle: "Internal playbook owner",
    },
    decision_media: {
      src: "assets/speakers/media-lead.png",
      title: "Head of Performance Marketing",
      subtitle: "Paid media · closed loop",
    },
    decision_jordan: {
      src: "assets/speakers/jordan.svg",
      title: "Jordan · job seeker",
      subtitle: "SMS · Vault RAG coach",
    },
    decision_guest: {
      src: "assets/speakers/guest.svg",
      title: "Decision maker",
      subtitle: "Your brief · executive portrait",
    },
  };

  function castRoleClass(role) {
    if (role === "arche") return "arche";
    if (role === "decision" || (role && role.indexOf("decision_") === 0)) return "decision";
    return "narrator";
  }

  function resolveSpeakerVisual(role, label) {
    if (role === "arche") return SPEAKER_VISUALS.arche;
    if (role && SPEAKER_VISUALS[role]) {
      var vis = SPEAKER_VISUALS[role];
      if (label && role === "decision_guest") {
        return {
          src: vis.src,
          title: label,
          subtitle: vis.subtitle,
        };
      }
      return vis;
    }
    if (role && role.indexOf("decision_") === 0) {
      return {
        src: "assets/speakers/jim-cfo.png",
        title: label || "Decision maker",
        subtitle: "Executive portrait (scrubbed demo)",
      };
    }
    return null;
  }

  function showSpeakerPopup(role, label) {
    var visual = resolveSpeakerVisual(role, label);
    var pop = $("#speaker-popup");
    var img = $("#speaker-popup-img");
    var titleEl = $("#speaker-popup-title");
    var subEl = $("#speaker-popup-sub");
    if (!pop || !img) return;
    if (!visual) {
      hideSpeakerPopup();
      return;
    }
    pop.classList.toggle("arche-mode", !!visual.arche);
    img.src = visual.src;
    img.alt = label || visual.title;
    if (titleEl) titleEl.textContent = label || visual.title;
    if (subEl) subEl.textContent = visual.subtitle || "";
    pop.classList.remove("hidden");
    pop.classList.add("visible");
    pop.setAttribute("aria-hidden", "false");
  }

  function hideSpeakerPopup() {
    var pop = $("#speaker-popup");
    if (!pop) return;
    pop.classList.remove("visible");
    pop.classList.add("hidden");
    pop.setAttribute("aria-hidden", "true");
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

  /** CLI proof screenshots keyed by trace anchor id (without prefix) or slug */
  var PROOF_VISUALS = {
    "trace-billing-fetch": {
      src: "assets/proofs/billing-fetch.svg",
      title: "Billing stream fetch",
      subtitle: "Live cancellation feed — orchestration trace proof",
    },
    "trace-recall": {
      src: "assets/proofs/recall.svg",
      title: "Session recall",
      subtitle: "Prior working-session memory thread",
    },
    "trace-vetting": {
      src: "assets/proofs/vetting.svg",
      title: "Vetting bundle",
      subtitle: "Evidence gate — PASS with citations",
      evidenceSlug: "sw-mi-zoning-vetting",
    },
    "trace-fetch-1": {
      src: "assets/proofs/local-market.svg",
      title: "Primary research fetch",
      subtitle: "Scrubbed regional export (demo)",
      evidenceSlug: "mdard-livestock-matrix",
    },
    "trace-market": {
      src: "assets/proofs/market.svg",
      title: "Market pulse fetch",
      subtitle: "External market context line",
    },
    "trace-warehouse": {
      src: "assets/proofs/cohort-export.svg",
      title: "Warehouse cohort export",
      subtitle: "Scrubbed parquet export summary",
    },
    "trace-workforce": {
      src: "assets/proofs/workforce.svg",
      title: "Workforce snapshot",
      subtitle: "HR cohort ingest proof",
    },
    "trace-causal": {
      src: "assets/proofs/causal.svg",
      title: "Causal lag estimates",
      subtitle: "Temporal causal inference branch",
    },
    "trace-abm-emergent": {
      src: "assets/proofs/abm-emergent.svg",
      title: "ABM emergent pattern",
      subtitle: "Population simulation output",
    },
    "trace-ingest": {
      src: "assets/proofs/ingest.svg",
      title: "Lever registry ingest",
      subtitle: "Thousands of dimensions indexed",
    },
    "trace-graph": {
      src: "assets/proofs/graph.svg",
      title: "Closed-loop job graph",
      subtitle: "Orchestration graph compile",
    },
    "trace-policy": {
      src: "assets/proofs/policy.svg",
      title: "Policy shell",
      subtitle: "Shadow mode and budget caps",
    },
    "trace-shadow": {
      src: "assets/proofs/shadow.svg",
      title: "Shadow kill log",
      subtitle: "Logged kills — zero executed in preview",
    },
    "trace-webhook": {
      src: "assets/proofs/webhook.svg",
      title: "SMS webhook intake",
      subtitle: "Twilio inbound proof line",
    },
    "trace-rag": {
      src: "assets/proofs/rag.svg",
      title: "Vault RAG retrieval",
      subtitle: "Grounded chunks before outbound SMS",
    },
    "trace-playbook": {
      src: "assets/proofs/playbook-index.svg",
      title: "Playbook index",
      subtitle: "Compressed internal doc retrieval",
    },
    "evidence-cohort-export": {
      src: "assets/proofs/cohort-export.svg",
      title: "Cohort export sheet",
      subtitle: "Demo export summary (scrubbed)",
    },
    "trace-local-market": {
      src: "assets/proofs/local-market.svg",
      title: "Regional demand spreadsheet",
      subtitle: "SW Michigan home-services lead index (scrubbed export)",
      citation: "https://markets.demo/local/sw-mi-windows-doors",
    },
    "trace-reviews": {
      src: "assets/proofs/reviews.svg",
      title: "Google Business reviews",
      subtitle: "Review velocity UI capture — 90 day window",
      citation: "https://reviews.demo/gbp/scrub-installer",
    },
    "trace-competitor": {
      src: "assets/proofs/competitor-scan.svg",
      title: "Competitor quote sheet",
      subtitle: "Bid-board scrub — installed replacement jobs",
      citation: "https://research.demo/bids/sw-mi-replacement",
    },
    "trace-margin": {
      src: "assets/proofs/margin-model.svg",
      title: "Margin vs review-risk dashboard",
      subtitle: "Model output chart — target band 18–22%",
      citation: "https://models.demo/local/margin-v3",
    },
    "trace-ag-regulatory": {
      src: "assets/proofs/local-market.svg",
      title: "MDARD / county permit matrix",
      subtitle: "Livestock facility & CAFO rules — SW Michigan (scrubbed)",
      citation: "https://research.demo/ag/mdard-sw-mi-livestock",
    },
    "trace-ag-capacity": {
      src: "assets/proofs/competitor-scan.svg",
      title: "Regional hog capacity sheet",
      subtitle: "Indoor headcount vs packer off-take — competitor map",
      citation: "https://markets.demo/ag/sw-mi-hog-capacity",
    },
    "trace-ag-economics": {
      src: "assets/proofs/margin-model.svg",
      title: "Unit economics dashboard",
      subtitle: "Feed conversion, margin per head, capex per stall",
      citation: "https://models.demo/ag/indoor-hog-unit-econ",
    },
    "trace-ag-biosecurity": {
      src: "assets/proofs/reviews.svg",
      title: "Biosecurity & audit checklist",
      subtitle: "Ventilation, mortality, traceability — vetting panel",
      citation: "https://vetting.demo/ag/biosecurity-audit",
    },
    "trace-auto-inventory": {
      src: "assets/proofs/auto-inventory.svg",
      title: "Lot inventory aging",
      subtitle: "Days-on-lot and gross by unit (scrubbed export)",
      citation: "https://api.demo/automotive/inventory/kz-lot-2025q2",
    },
    "trace-auto-pricing": {
      src: "assets/proofs/auto-pricing.svg",
      title: "Market pricing dashboard",
      subtitle: "KBB/Manheim band vs your ask",
      citation: "https://markets.demo/automotive/pricing/kz-used",
    },
    "trace-auto-comp": {
      src: "assets/proofs/auto-comp-set.svg",
      title: "Competitive set spreadsheet",
      subtitle: "Dealer comps within 25 mi (public listings scrubbed)",
      citation: "https://research.demo/automotive/comps/kz-dealers",
    },
    "trace-auto-reviews": {
      src: "assets/proofs/auto-reviews.svg",
      title: "Dealer reputation panel",
      subtitle: "Google + marketplace review snapshot",
      citation: "https://reviews.demo/gbp/scrub-dealer-kz",
    },
    "trace-auto-vetting": {
      src: "assets/proofs/auto-vetting.svg",
      title: "Vetting bundle",
      subtitle: "Automotive brief — evidence gate PASS",
      citation: "https://vetting.demo/bundles/EB-AUTO-07",
    },
  };

  var activeProofLink = null;
  var activeBriefQuery = "";
  var activeBuyerBusinessName = "";
  var liveEvidenceAnchorMap = null;

  /** Live brief trace anchors → served HTML/CSV under /api/portfolio/evidence/ */
  var LIVE_EVIDENCE_BY_ANCHOR = {
    "trace-vetting": "scope-vetting-brief",
    "trace-local-action-plan": "local-seo-action-plan",
    "trace-local-competition": "local-competition-map",
    "trace-market-density": "market-density-sheet",
    "trace-marketing-band": "market-density-sheet",
    "trace-plan": "scope-vetting-brief",
    "trace-fetch-1": "local-competition-map",
    "trace-ag-regulatory": "mdard-livestock-matrix",
    "trace-ag-capacity": "hog-capacity-sheet",
    "trace-ag-economics": "hog-capacity-sheet",
    "trace-auto-inventory": "local-competition-map",
    "trace-auto-pricing": "market-density-sheet",
    "trace-auto-vetting": "scope-vetting-brief",
  };

  function updateDataDisclosure(pack) {
    var el = $("#data-disclosure-banner");
    if (!el) return;
    if (!pack) {
      el.innerHTML =
        "<strong>Data mode:</strong> Live preview offline — canned scenario only until the API reconnects.";
      return;
    }
    var disclosure = pack.disclosure || "Evidence is tailored to your brief.";
    var why = pack.why_not_live ? " " + pack.why_not_live : "";
    var taste = pack.preview_note
      ? " " + pack.preview_note
      : " You get a targeted taste — full production vaults and scheduled ingest ship under contract.";
    var liveNote = "";
    if (pack.local_intel && pack.local_intel.ok && pack.local_intel.competitor_count != null) {
      liveNote =
        " Live public listings: " +
        pack.local_intel.competitor_count +
        " competitors near " +
        (pack.local_intel.location || "market") +
        " (" +
        (pack.local_intel.source || "OpenStreetMap") +
        ").";
    }
    if (pack.local_intel && pack.local_intel.census && pack.local_intel.census.ok) {
      liveNote +=
        " U.S. Census county pattern: " +
        pack.local_intel.census.establishments +
        " " +
        (pack.local_intel.census.naics_label || "establishments") +
        " in " +
        (pack.local_intel.census.county || "county") +
        " County, " +
        (pack.local_intel.census.state || "") +
        ".";
    }
    el.innerHTML = "<strong>Data mode:</strong> " + disclosure + why + taste + liveNote;
  }

  function getBuyerBusinessName() {
    var el = $("#buyer-business-name");
    return el && el.value ? el.value.trim().slice(0, 80) : activeBuyerBusinessName || "";
  }

  function updateGrowthStrategy(live) {
    var panel = $("#strategy-panel");
    var body = $("#strategy-body");
    if (!panel || !body) return;
    var text = live && (live.full_strategy || "");
    var sections = (live && live.strategy_sections) || [];
    if (!text && (!sections || !sections.length)) {
      panel.classList.add("hidden");
      body.innerHTML = "";
      return;
    }
    panel.classList.remove("hidden");
    var html = "";
    if (text) {
      var leadEnd = text.indexOf("\n\n1.");
      var lead = leadEnd > 40 ? text.slice(0, leadEnd) : text.slice(0, 320);
      html += '<p class="strategy-lead">' + escapeHtml(lead) + "</p>";
    }
    if (sections && sections.length) {
      sections.forEach(function (sec, i) {
        html +=
          "<h3>" +
          (i + 1) +
          ". " +
          escapeHtml(sec.title || "Strategy") +
          "</h3><p>" +
          escapeHtml(sec.body || "") +
          "</p>";
      });
    } else if (text) {
      html +=
        '<pre style="white-space:pre-wrap;font-family:inherit;font-size:0.82rem;margin:0">' +
        escapeHtml(text) +
        "</pre>";
    }
    body.innerHTML = html;
    updatePilotScopeControls(live);
    updateSideBySide(live);
  }

  function pilotScopePdfUrl(query, buyerName) {
    var q = encodeURIComponent((query || "").trim().slice(0, 500));
    var bn = encodeURIComponent((buyerName || "").trim().slice(0, 80));
    var base = location.protocol + "//" + location.host;
    var url = base + "/api/portfolio/pilot-scope.pdf?brief=" + q;
    if (bn) url += "&business_name=" + bn;
    return url;
  }

  function updatePilotScopeControls(live) {
    var btn = $("#pilot-scope-pdf");
    var hint = $("#pilot-scope-hint");
    if (!btn) return;
    var query = (live && live.query) || activeBriefQuery || "";
    var buyer = getBuyerBusinessName();
    if (!query) {
      btn.setAttribute("href", "#");
      btn.classList.add("hidden");
      if (hint) hint.classList.add("hidden");
      return;
    }
    btn.classList.remove("hidden");
    if (hint) hint.classList.remove("hidden");
    btn.setAttribute("href", pilotScopePdfUrl(query, buyer));
  }

  function ungroundedDealershipHtml() {
    // Intentionally generic: this is the "free AI / no live market intel" baseline.
    var blocks = [
      {
        t: "Service-to-sales conversion",
        b:
          "Turn your service drive into your highest quality lead source. Track declined service RO’s, recall timing, and trade-in intent; then route hot customers to a sales closer within 15 minutes.",
      },
      {
        t: "24/7 BDC + appointment booking",
        b:
          "Stand up a BDC that answers after-hours, books appointments, and follows up until the customer shows. The win is speed-to-lead and persistent follow-up — not more ad spend.",
      },
      {
        t: "CRM reactivation (the cheapest growth lever)",
        b:
          "Run a weekly reactivation batch: unsold showroom traffic, orphan owners, aged leads, and equity candidates. Use a 3-touch sequence (call + text + email) with clear offers and a booking link.",
      },
      {
        t: "Local trust + reviews flywheel",
        b:
          "Publish weekly inventory/offer posts, collect reviews with velocity, and respond to every review within 24 hours. Listings and review velocity determine who wins the local pack.",
      },
      {
        t: "Offer discipline + measurement",
        b:
          "Pick one primary offer for 30 days, measure appointment rate and show rate, and iterate weekly. Treat this as a conversion system: lead → appointment → show → close.",
      },
    ];
    var out = "";
    blocks.forEach(function (x, i) {
      out +=
        "<h3 style=\"font-size:0.86rem;margin:0.55rem 0 0.25rem;color:#e4e4e7\">" +
        (i + 1) +
        ". " +
        escapeHtml(x.t) +
        "</h3><p style=\"margin:0 0 0.55rem;color:#a1a1aa;line-height:1.45\">" +
        escapeHtml(x.b) +
        "</p>";
    });
    return out;
  }

  function groundedSummaryHtml(live) {
    var pack = (live && live.evidence_pack) || lastEvidencePack || {};
    var plan = pack && pack.action_plan;
    var out = "";
    var sections = (live && live.strategy_sections) || [];
    if (sections && sections.length) {
      out +=
        "<p style=\"margin:0 0 0.55rem;color:#e4e4e7;line-height:1.45\"><strong>Personalized strategy</strong>: " +
        escapeHtml((sections[0] && sections[0].title) || "Playbook") +
        " + 4 more sections.</p>";
    }
    if (plan && plan.top_ten && plan.top_ten.length) {
      out +=
        "<p style=\"margin:0.35rem 0 0.25rem;color:#a1a1aa\"><strong>Live competitors</strong> (" +
        escapeHtml(plan.search_radius_miles_label || "trade area") +
        "):</p><ul style=\"margin:0.25rem 0 0.55rem;padding-left:1.15rem;color:#a1a1aa\">";
      (plan.top_ten || []).slice(0, 6).forEach(function (r) {
        out += "<li>" + escapeHtml(r.name || "—") + "</li>";
      });
      out += "</ul>";
    }
    if (plan && plan.actions && plan.actions.length) {
      out +=
        "<p style=\"margin:0.35rem 0 0.25rem;color:#a1a1aa\"><strong>Ranked 30-day plan</strong>:</p><ol style=\"margin:0.25rem 0 0;padding-left:1.15rem;color:#a1a1aa\">";
      (plan.actions || []).slice(0, 5).forEach(function (a) {
        out +=
          "<li><strong>[" +
          escapeHtml(a.priority || "P1") +
          " · " +
          escapeHtml(a.channel || "Channel") +
          "]</strong> " +
          escapeHtml(a.title || "") +
          "</li>";
      });
      out += "</ol>";
    }
    out +=
      "<p style=\"margin:0.55rem 0 0;color:#a1a1aa\">Paid wiring turns this into a system: CRM/BDC sequences, review velocity, and weekly KPI packets.</p>";
    return out;
  }

  function updateSideBySide(live) {
    var toggle = $("#side-by-side-toggle");
    var panel = $("#side-by-side-panel");
    var left = $("#side-by-side-left");
    var right = $("#side-by-side-right");
    if (!toggle || !panel || !left || !right) return;

    var hasStrategy =
      !!(live && (live.full_strategy || (live.strategy_sections && live.strategy_sections.length)));
    if (!hasStrategy) {
      panel.classList.add("hidden");
      toggle.checked = false;
      left.innerHTML = "";
      right.innerHTML = "";
      return;
    }

    if (!toggle.checked) {
      panel.classList.add("hidden");
      left.innerHTML = "";
      right.innerHTML = "";
      return;
    }

    panel.classList.remove("hidden");
    left.innerHTML = ungroundedDealershipHtml();
    right.innerHTML = groundedSummaryHtml(live);
  }

  function updateActionPlan(pack) {
    var panel = $("#action-plan-panel");
    var body = $("#action-plan-body");
    if (!panel || !body) return;
    var plan = pack && pack.action_plan;
    if (!plan || !plan.top_ten) {
      panel.classList.add("hidden");
      body.innerHTML = "";
      return;
    }
    panel.classList.remove("hidden");
    var br = plan.buyer_rank || {};
    var verdict = br.headline || "Rank analysis ready.";
    var disclosure = br.disclosure || "";
    var buyerLine = "";
    if (plan.buyer_name) {
      buyerLine =
        "<p><strong>Your business:</strong> " + escapeHtml(plan.buyer_name) + "</p>";
    } else {
      buyerLine =
        '<p><strong>Your business:</strong> <em>Add your shop name above to see top-10 gap vs competitors.</em></p>';
    }
    var rows = "";
    (plan.top_ten || []).forEach(function (row) {
      var cls = row.is_buyer ? ' class="buyer-row"' : "";
      rows +=
        "<tr" +
        cls +
        "><td>" +
        row.proxy_rank +
        "</td><td>" +
        escapeHtml(row.name) +
        "</td><td>" +
        escapeHtml(row.category) +
        "</td><td>" +
        '<a href="' +
        escapeHtml(row.google_maps_url) +
        '" target="_blank" rel="noopener">Google Maps</a> · ' +
        '<a href="' +
        escapeHtml(row.yelp_url) +
        '" target="_blank" rel="noopener">Yelp</a></td></tr>';
    });
    var steps = "";
    (plan.actions || []).forEach(function (a) {
      steps +=
        "<li><strong>[" +
        escapeHtml(a.priority) +
        " · " +
        escapeHtml(a.channel) +
        "]</strong> " +
        escapeHtml(a.title) +
        " — " +
        escapeHtml(a.detail) +
        "</li>";
    });
    var links = plan.links || {};
    var fullDoc = evidenceUrlForSlug("local-seo-action-plan", activeBriefQuery);
    body.innerHTML =
      buyerLine +
      '<div class="rank-verdict"><strong>Position verdict</strong><p style="margin:0.4rem 0 0">' +
      escapeHtml(verdict) +
      '</p><p style="margin:0.35rem 0 0;font-size:0.72rem;color:#a1a1aa">' +
      escapeHtml(disclosure) +
      "</p></div>" +
      "<h3 style=\"font-size:0.88rem;margin:0.65rem 0 0.35rem\">Top 10 (proxy rank — click to verify live)</h3>" +
      "<table><thead><tr><th>#</th><th>Business</th><th>Category</th><th>Verify</th></tr></thead><tbody>" +
      (rows || "<tr><td colspan='4'>No listings in radius.</td></tr>") +
      "</tbody></table>" +
      "<h3 style=\"font-size:0.88rem;margin:0.65rem 0 0.35rem\">30-day move-up plan</h3>" +
      '<ol class="action-steps">' +
      (steps || "<li>Add your business name for personalized steps.</li>") +
      "</ol>" +
      '<p class="plan-links"><a href="' +
      escapeHtml(links.google_business || "https://business.google.com/") +
      '" target="_blank" rel="noopener">Google Business Profile</a> · ' +
      '<a href="' +
      escapeHtml(links.yelp_search_market || "#") +
      '" target="_blank" rel="noopener">Yelp market search</a> · ' +
      '<a href="' +
      escapeHtml(links.google_maps_market || "#") +
      '" target="_blank" rel="noopener">Google Maps market</a>' +
      (fullDoc
        ? ' · <a href="' + escapeHtml(fullDoc) + '" target="_blank" rel="noopener">Full action plan doc</a>'
        : "") +
      "</p>";
  }

  function setLiveEvidenceContext(pack, query) {
    activeBriefQuery = (query || "").trim();
    liveEvidenceAnchorMap = {};
    if (pack && pack.items && pack.items.length) {
      pack.items.forEach(function (it) {
        if (it.trace_anchor && it.evidence_slug) {
          liveEvidenceAnchorMap[it.trace_anchor] = it.evidence_slug;
        }
      });
    }
    updateDataDisclosure(pack);
    updateSalesHooks(pack);
    updateActionPlan(pack);
  }

  function updateSalesHooks(pack) {
    if (!pack) return;
    lastEvidencePack = pack;
    var li = pack.local_intel || {};
    var census = li.census || {};
    var nComp = li.competitor_count;
    var nCensus = census.ok ? census.establishments : null;
    var loc = li.location || "your market";
    var label = census.naics_label || "establishments";
    var pitch = "Book a 20-min pilot — text or email (Upwork-safe on this page).";
    if (nComp != null && nCensus != null) {
      pitch =
        nComp +
        " nearby listings + " +
        nCensus +
        " county " +
        label +
        " near " +
        loc +
        " — text to book pilot.";
    } else if (nCensus != null) {
      pitch = nCensus + " county " + label + " in " + loc + " — text to book pilot.";
    } else if (nComp != null) {
      pitch = nComp + " public competitors near " + loc + " — text to book pilot.";
    }

    var modalCta = $("#modal-contact-cta");
    if (modalCta) {
      modalCta.innerHTML =
        "<strong>RESONANT-VIEW → pilot slice:</strong> " +
        pitch +
        ' <a href="tel:+12698883503">Text (269) 888-3503</a> · <a href="sms:+12698883503">SMS</a> · <a href="mailto:imndevmodeai@gmail.com">Email</a>';
    }
    var stickyCopy = $("#sticky-sales-copy");
    var sticky = $("#sticky-sales-cta");
    if (stickyCopy) stickyCopy.textContent = pitch;
    if (sticky) sticky.classList.remove("hidden");
    var nextSteps = $("#modal-next-steps");
    if (nextSteps && (pack.items || []).length) nextSteps.classList.remove("hidden");
    showBriefCompleteToast(
      "You unlocked the consult preview. Next: local comp map + ad carve-out — text to book pilot or open your gift link in the modal."
    );
  }

  function hideSalesHooks() {
    var sticky = $("#sticky-sales-cta");
    if (sticky) sticky.classList.add("hidden");
    var nextSteps = $("#modal-next-steps");
    if (nextSteps) nextSteps.classList.add("hidden");
  }

  function evidenceUrlForSlug(slug, query) {
    var root = resolvePortfolioApiRoot();
    if (!root || !slug) return "";
    var url = root + "/api/portfolio/evidence/" + slug;
    var q = (query || activeBriefQuery || "").trim();
    var params = [];
    if (q) params.push("brief=" + encodeURIComponent(q.slice(0, 220)));
    var bn = getBuyerBusinessName();
    if (bn) params.push("business_name=" + encodeURIComponent(bn));
    if (params.length) url += "?" + params.join("&");
    return url;
  }

  /** Spreadsheet/chart/UI captures — keep as document image, not terminal HTML */
  var PROOF_DOCUMENT_ANCHORS = {
    "trace-vetting": true,
    "trace-local-action-plan": true,
    "trace-local-competition": true,
    "trace-market-density": true,
    "trace-marketing-band": true,
    "trace-plan": true,
    "trace-fetch-1": true,
    "trace-local-market": true,
    "trace-reviews": true,
    "trace-competitor": true,
    "trace-margin": true,
    "trace-ag-regulatory": true,
    "trace-ag-capacity": true,
    "trace-ag-economics": true,
    "trace-ag-biosecurity": true,
    "trace-auto-inventory": true,
    "trace-auto-pricing": true,
    "trace-auto-comp": true,
    "trace-auto-reviews": true,
  };

  /** Extra lines shown under the synced trace row in the HTML proof terminal */
  var PROOF_TERMINAL_DETAILS = {
    "trace-billing-fetch": [
      "uri=https://api.demo.billing.cloud/v2/cancellations",
      "rows=184k  latency_ms=420  status=200",
      "LINK → answer.churn_source=billing_events",
    ],
    "trace-recall": [
      "prior_session=standup_apr22",
      "nuance=stop CRM last-activity as churn proxy",
    ],
    "trace-vetting": [
      "resolution=billing_wins  conf=0.90",
      "[SRC] evidence_bundle=EB-*  citations=3",
      "check=PASS",
    ],
    "trace-market": [
      "uri=https://markets.demo/quotes/sector-subscription",
      "status=200  delay_ms=88",
    ],
    "trace-warehouse": [
      "s3://demo-warehouse-scrub/cohort/churn_v3.parquet",
      "scrubbed_export · demo only",
    ],
    "trace-workforce": [
      "uri=s3://demo-hr-scrub/workforce/cohort_2024q4.parquet",
      "rows=24k  status=200",
    ],
    "trace-causal": [
      "action=estimate_lagged_effects  max_lag=16w",
      "lag_weeks=12-14  outcome=engagement_decay",
    ],
    "trace-abm-emergent": [
      "emergent=weak_tie_decay",
      "trigger=clustered_visit_weeks",
    ],
    "trace-ingest": [
      "creative_features=1842  audience_dims=396",
      "signals=ROAS,CPA,hook_retention  total_dims=2850",
    ],
    "trace-graph": [
      "edge=perf_feedback→rag_retrain→planner",
      "loop=closed",
    ],
    "trace-policy": [
      "[MODE] shadow=ON  canary=5%",
      "execute_meta=BLOCKED",
    ],
    "trace-shadow": [
      "kills_executed=0  canary_slice=5%",
      "[AUDIT] rollback_armed=YES",
    ],
    "trace-webhook": [
      "bytes=142  status=200",
      "MEMORY    thread_id=phone_hash",
    ],
    "trace-rag": [
      "vault_chunks=11  tokens=3.1k",
      "OPENAI    intent=rewrite_resume_bullet",
    ],
    "trace-playbook": [
      "TOOL       chunk_sections=42",
      "index_entries=812",
    ],
    "evidence-cohort-export": [
      "s3://demo-warehouse-scrub/cohort/churn_v3.parquet",
      "scrubbed_export · demo only",
    ],
    "trace-auto-vetting": [
      "status=PASS  conf=0.86",
      "[SRC] evidence_bundle=EB-AUTO-07  citations=5",
    ],
  };

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function proofIsDocumentVisual(visual, source) {
    if (visual && visual.kind === "document") return true;
    if (visual && visual.kind === "terminal") return false;
    var anchor = source && source.traceAnchor;
    if (anchor && PROOF_DOCUMENT_ANCHORS[anchor]) return true;
    if (visual && visual.src) {
      var docFragments = [
        "local-market",
        "competitor-scan",
        "margin-model",
        "reviews.svg",
        "auto-inventory",
        "auto-pricing",
        "auto-comp-set",
        "auto-reviews",
      ];
      for (var i = 0; i < docFragments.length; i++) {
        if (visual.src.indexOf(docFragments[i]) >= 0) return true;
      }
    }
    return false;
  }

  function collectTerminalProofLines(source, visual) {
    var lines = [];
    var anchor = source && source.traceAnchor;
    if (anchor) {
      var row = document.getElementById(anchor);
      if (row && row.textContent) lines.push(row.textContent.trim());
    }
    var extras =
      (visual && visual.detailLines) ||
      (anchor && PROOF_TERMINAL_DETAILS[anchor]) ||
      [];
    extras.forEach(function (ln) {
      var t = (ln || "").trim();
      if (t && lines.indexOf(t) < 0) lines.push(t);
    });
    if (!lines.length && visual && visual.fallbackLines) {
      lines = visual.fallbackLines.slice();
    }
    return lines;
  }

  function renderProofTerminalHtml(lines, badge) {
    var body = $("#proof-popup-terminal-body");
    var wrap = $("#proof-popup-terminal");
    var badgeEl = $("#proof-terminal-badge");
    if (!body || !wrap) return;
    if (badgeEl) badgeEl.textContent = badge || "";
    body.innerHTML = lines
      .map(function (ln, i) {
        var cls = i === 0 ? "proof-terminal-line primary" : "proof-terminal-line meta";
        return '<span class="' + cls + '">' + escapeHtml(ln) + "</span>";
      })
      .join("\n");
    wrap.hidden = false;
  }

  function enrichProofSource(s) {
    if (!s) return s;
    var out = Object.assign({}, s);
    var anchor = out.traceAnchor || "";
    var anchorMap = liveEvidenceAnchorMap || LIVE_EVIDENCE_BY_ANCHOR;
    if (!out.evidenceSlug && anchorMap[anchor]) {
      out.evidenceSlug = anchorMap[anchor];
    }
    var vis = (anchor && PROOF_VISUALS[anchor]) || (out.proofKey && PROOF_VISUALS[out.proofKey]);
    if (vis) {
      if (!out.proofImage) out.proofImage = vis.src;
      if (!out.proofTitle) out.proofTitle = vis.title;
      if (!out.proofSubtitle) out.proofSubtitle = vis.subtitle;
      if (!out.evidenceSlug && vis.evidenceSlug) out.evidenceSlug = vis.evidenceSlug;
      if (!out.citationUrl && vis.citation) out.citationUrl = vis.citation;
    }
    if (out.label && !out.proofTitle) out.proofTitle = out.label;
    if (out.serviceArm && out.guarantee) {
      out.proofSubtitle = out.serviceArm + " — on purchase: " + out.guarantee;
    }
    var root = resolvePortfolioApiRoot();
    if (out.evidenceSlug && root) {
      var briefQ = out.briefQuery || activeBriefQuery || "";
      var candidate = evidenceUrlForSlug(out.evidenceSlug, briefQ);
      if (evidenceEmbedAllowed(candidate)) {
        out.evidenceUrl = candidate;
        out.citationUrl = out.evidenceUrl;
        var disclosure =
          out.disclosure ||
          "Scrubbed demonstration file — not live market or government data.";
        out.proofSubtitle =
          (out.proofSubtitle || out.label || "Evidence document") +
          " · " +
          disclosure.slice(0, 140);
      }
      // else: keep static SVG/terminal proof — never trap visitor in ngrok interstitial iframe
    }
    return out;
  }

  function enrichLiveSources(sources) {
    if (!sources || !sources.length) return [];
    return sources.map(enrichProofSource);
  }

  function resolveProofVisual(source) {
    if (!source) return null;
    var base = null;
    if (source.proofImage) {
      base = {
        src: source.proofImage,
        title: source.proofTitle || source.label || "Evidence document",
        subtitle: source.proofSubtitle || "Orchestration trace evidence",
        citation: source.citationUrl || source.citation || "",
        evidenceSlug: source.evidenceSlug || "",
        evidenceUrl: source.evidenceUrl || "",
      };
    } else if (source.traceAnchor && PROOF_VISUALS[source.traceAnchor]) {
      base = Object.assign({}, PROOF_VISUALS[source.traceAnchor]);
    } else if (source.proofKey && PROOF_VISUALS[source.proofKey]) {
      base = Object.assign({}, PROOF_VISUALS[source.proofKey]);
    } else {
      base = {
        src: "assets/proofs/default.svg",
        title: source.label || "Evidence document",
        subtitle: "Trace-linked scrubbed export (demo)",
        citation: "",
      };
    }
    if (source.evidenceSlug) base.evidenceSlug = source.evidenceSlug;
    if (source.evidenceUrl && evidenceEmbedAllowed(source.evidenceUrl)) {
      base.evidenceUrl = source.evidenceUrl;
    }
    if (base && (source.citationUrl || source.citation) && !base.citation) {
      base.citation = source.citationUrl || source.citation;
    }
    if (base && base.evidenceSlug && !base.evidenceUrl && resolvePortfolioApiRoot()) {
      var candidate =
        resolvePortfolioApiRoot() + "/api/portfolio/evidence/" + base.evidenceSlug;
      if (evidenceEmbedAllowed(candidate)) {
        base.evidenceUrl = candidate;
        if (!base.citation) base.citation = base.evidenceUrl;
      }
    }
    return base;
  }

  function flashTerminalPanel() {
    var term = $("#terminal-out");
    if (!term) return;
    term.classList.remove("trace-flash");
    void term.offsetWidth;
    term.classList.add("trace-flash");
    setTimeout(function () {
      term.classList.remove("trace-flash");
    }, 2800);
  }

  function scrollToTraceAnchor(anchorId) {
    if (!anchorId) return null;
    var row = document.getElementById(anchorId);
    var term = $("#terminal-out");
    if (!row || !term) return null;
    row.classList.remove("log-highlight");
    void row.offsetWidth;
    row.classList.add("log-highlight");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    flashTerminalPanel();
    setTimeout(function () {
      row.classList.remove("log-highlight");
    }, 3200);
    return row;
  }

  function showProofPopup(source) {
    var visual = resolveProofVisual(source);
    var pop = $("#proof-popup");
    var img = $("#proof-popup-img");
    var frame = $("#proof-popup-frame");
    var termWrap = $("#proof-popup-terminal");
    var titleEl = $("#proof-popup-title");
    var subEl = $("#proof-popup-sub");
    var citeEl = $("#proof-popup-cite");
    var card = pop && pop.querySelector(".proof-popup-card");
    if (!pop || !img || !visual) return;

    var useDocument = proofIsDocumentVisual(visual, source);
    // Only promote to iframe document mode when embed is safe (never ngrok interstitial).
    if (visual.evidenceUrl && evidenceEmbedAllowed(visual.evidenceUrl)) {
      useDocument = true;
    } else if (visual.evidenceUrl && !evidenceEmbedAllowed(visual.evidenceUrl)) {
      visual = Object.assign({}, visual, { evidenceUrl: "" });
    }
    if (card) {
      card.classList.toggle("proof-mode-document", useDocument);
      card.classList.toggle("proof-mode-terminal", !useDocument);
    }

    if (useDocument) {
      if (termWrap) termWrap.hidden = true;
      if (visual.evidenceUrl && frame && evidenceEmbedAllowed(visual.evidenceUrl)) {
        frame.style.display = "block";
        frame.src = visual.evidenceUrl;
        img.style.display = "none";
        img.removeAttribute("src");
      } else {
        if (frame) {
          frame.style.display = "none";
          frame.removeAttribute("src");
        }
        img.style.display = "block";
        img.onerror = function () {
          img.onerror = null;
          img.src = "assets/proofs/default.svg";
        };
        img.src = visual.src || "assets/proofs/default.svg";
        img.alt = visual.title;
      }
    } else {
      if (frame) {
        frame.style.display = "none";
        frame.removeAttribute("src");
      }
      img.style.display = "none";
      img.removeAttribute("src");
      renderProofTerminalHtml(collectTerminalProofLines(source, visual), visual.title || "");
    }

    if (titleEl) titleEl.textContent = visual.title;
    if (subEl) subEl.textContent = visual.subtitle || "";
    if (citeEl) {
      citeEl.textContent = visual.citation ? "Source: " + visual.citation : "";
      citeEl.style.display = visual.citation ? "block" : "none";
    }
    pop.classList.remove("hidden");
    pop.classList.add("visible");
    pop.setAttribute("aria-hidden", "false");
    if (source && source.traceAnchor) {
      scrollToTraceAnchor(source.traceAnchor);
    }
  }

  function hideProofPopup() {
    var pop = $("#proof-popup");
    if (!pop) return;
    var termWrap = $("#proof-popup-terminal");
    if (termWrap) termWrap.hidden = true;
    var frame = $("#proof-popup-frame");
    if (frame) {
      frame.style.display = "none";
      frame.removeAttribute("src");
    }
    var body = $("#proof-popup-terminal-body");
    if (body) body.textContent = "";
    pop.classList.remove("visible");
    pop.classList.add("hidden");
    pop.setAttribute("aria-hidden", "true");
    if (activeProofLink) {
      activeProofLink.classList.remove("proof-active");
      activeProofLink = null;
    }
  }

  function openProofEvidence(source, linkEl) {
    if (!source) return;
    if (activeProofLink && activeProofLink !== linkEl) {
      activeProofLink.classList.remove("proof-active");
    }
    activeProofLink = linkEl || null;
    if (linkEl) linkEl.classList.add("proof-active");
    showProofPopup(source);
  }

  function proofFromAnchor(anchorId) {
    if (!anchorId) return { traceAnchor: "", proofKey: "" };
    if (PROOF_VISUALS[anchorId]) {
      return { traceAnchor: anchorId, label: PROOF_VISUALS[anchorId].title };
    }
    return { traceAnchor: anchorId, label: "CLI proof line" };
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
    if (anchor) {
      row.id = anchor;
      row.classList.add("log-proof-anchor");
      row.title = "Click for CLI proof image";
      row.addEventListener("click", function () {
        openProofEvidence(proofFromAnchor(anchor), null);
      });
    }
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
    row.className = "cast-line cast-" + castRoleClass(role);
    var lab = document.createElement("span");
    lab.className = "cast-label";
    lab.textContent = label;
    var body = document.createElement("span");
    body.className = "cast-text";
    body.textContent = cleanForSpeech(text);
    row.appendChild(lab);
    row.appendChild(body);
    if (role === "arche" && text) {
      lastArcheAnswerText = cleanForSpeech(text);
    }
    if (sources && sources.length) {
      var ev = document.createElement("div");
      ev.className = "evidence-links";
      var head = document.createElement("strong");
      head.textContent = "Cited sources — click to open document + trace line";
      ev.appendChild(head);
      sources.forEach(function (s) {
        var a = document.createElement("a");
        a.textContent = s.label;
        a.className = "proof-link";
        if (s.traceAnchor || s.proofImage || s.proofKey) {
          a.href = "#proof-" + (s.traceAnchor || s.proofKey || "cli");
          a.addEventListener("click", function (e) {
            e.preventDefault();
            openProofEvidence(s, a);
          });
        } else if (s.href) {
          var cohortProof = {
            proofKey: "evidence-cohort-export",
            traceAnchor: s.traceAnchor || "trace-warehouse",
            label: s.label,
          };
          a.href = s.href;
          a.addEventListener("click", function (e) {
            e.preventDefault();
            openProofEvidence(cohortProof, a);
          });
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
    lastArcheAnswerText = "";
    hideSpeakerPopup();
    hideProofPopup();
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
    { role: "decision_jim", say: "ArchE — I need one vetted monthly churn number before standup, and I need to understand why Sales, Product, and Finance still show different figures." },
    { role: "arche", say: "Good morning, Jim. Beautiful morning your way — classic Midwest spring — warm enough to open the windows, storms still rolling through on Tuesday afternoons. Give me a moment: I am pulling what we locked on last time while billing streams in." },
    { role: "arche", say: "Jim — if you remember, last time we focused on the CRM activity metric versus cancel timestamps in billing. Today we close that loop. Headline churn is four point two percent at ninety percent confidence — billing cancellations over active subscribers, last thirty days. Sales still sees five point one because their window counts last login; Finance was blending both. I recommend billing as system of record for standup; net revenue retention band ninety-two to ninety-four percent next quarter if we patch the dictionary this week." },
    { role: "narrator", say: "Competitor eight-K lands mid-run — graph replans, trace shows the branch shift." },
    { role: "decision_jim", say: "That is a clean story — but how do I know you are not smoothing noise? Are you sure this is the right data?" },
    { role: "arche", say: "Great question. Every figure below ties to a line in the orchestration trace on the left — click a source and the log scrolls to the fetch. This session hit live billing and warehouse endpoints; vetting returned pass with three citations. If a feed fails, you will see it in trace and confidence drops — I do not swap in a polite guess." },
    {
      role: "arche",
      say: "You are not short on signals—you are short on a governor. The job posting is explicit: an agent that reasons over thousands of variables—creative features, audience slices, ROAS, CPA, hook performance—and ships the next action through your VEO, Fal, ElevenLabs, sync.so pipe into Meta. That only works if automation is layered: an orchestration plane beside your Next.js and Prisma app, not a bigger prompt.",
    },
    {
      role: "arche",
      say: "Sensors are RedTrack plus account metrics landing in Postgres; Meta Marketing API is the actuator only. Thousands of levers collapse into scored actions: policy shell caps how much budget can move per hour; evidence gates block kills until an ad has enough spend; a dual-signal kill score requires CPA stress and creative embedding drift to agree. Shadow mode, then five percent canary, then autopilot with rollback. That is how you remove yourselves from the loop without removing accountability.",
    },
    {
      role: "arche",
      say: "Click the trace on the left—lever registry ingest, job graph compile, shadow kills with execute equals zero. Full threshold math stays on a paid consult—this demo shows the automation spine your stack already asked for.",
    },
    {
      role: "decision_media",
      say: "Thousands of variables sounds like hype. How is this different from rules in Madgicx or a spreadsheet with twenty conditions?",
    },
    {
      role: "narrator",
      say: "The Job Seeker's Vault — paid subscribers text in on SMS. Same spine as our production webhook agent: intake, memory, Vault RAG, vetting, outbound reply.",
    },
    {
      role: "decision_jordan",
      say: "Need a tighter resume bullet for a product manager role. I pasted the job description in my last text. Can you rewrite one bullet using my Vault playbook tone, not generic career advice?",
    },
    {
      role: "arche",
      say: "Jordan — got your text. I am loading your thread and the Vault chunks we indexed for resume rewrites. Give me a few seconds to retrieve playbook language before I answer on SMS.",
    },
    {
      role: "narrator",
      say: "Vault chunks indexed — resume bullets, job-description decode, LinkedIn lines, referral scripts, interview practice, accountability nudges.",
    },
    {
      role: "arche",
      say: "Try this bullet: Led cross-functional launch of a subscription analytics feature, cutting time-to-insight from weeks to days and lifting trial-to-paid conversion eight percent in two quarters. Pulled from your Vault win-story patterns — not a generic ChatGPT template. Reply STOP any time to opt out.",
    },
    {
      role: "decision_jordan",
      say: "That sounds polished — how do I know this is not just ChatGPT career fluff? What actually ran on your side?",
    },
    {
      role: "arche",
      say: "Fair challenge. Trace shows webhook in, memory keyed to your phone hash, four Vault chunks retrieved, then vetting blocked generic advice before Twilio sent the reply. If retrieval misses, I say I do not have your Vault passage yet — I do not invent coaching copy.",
    },
    {
      role: "narrator",
      say: "Vetting gate before send — coaching copy must be grounded or it does not ship on SMS.",
    },
    {
      role: "decision_chro",
      say: "Simulate eighteen months of full remote-with-visits versus our current hybrid baseline. Show attrition and productivity trajectories, and tell me what breaks if we mandate too fast.",
    },
    {
      role: "decision_chro",
      say: "That reads polished — but how do I know this is not HR-flavored fiction? What actually ran, and what would break my credibility in the room?",
    },
    {
      role: "narrator",
      say: "CHRO office, remote policy bet. ArchE runs the same spine as the thought mapper — problem frame, process graph, tool branches, vetting gate — then a board-ready answer.",
    },
    {
      role: "arche",
      say: "Good morning. Before I quote attrition curves — I am loading your last hybrid pilot notes and the workforce snapshot we tagged in March. Give me ninety seconds to lock the problem frame and spin baseline versus full remote-with-visits in the population model.",
    },
    {
      role: "arche",
      say: "CHRO — three layers, then the recommendation. Frame: we are stress-testing a mandatory remote-with-quarterly-visits policy against your current hybrid baseline — not predicting individual resignations. Twenty-four hundred agent-employees, calibrated to exit-survey cadence and hire cohorts you already trust. Attrition — voluntary turnover: policy path adds about zero point eight percentage points on rolling twelve-month attrition by month eighteen. The effect is lagged — most signal lands months ten through fifteen, when manager touchpoints thin out in Q2 crunch. Baseline stays near your fourteen point two percent band. Productivity: self-report bumps months one through four — commute relief and focus — then flattens by Q3. Our output proxy — throughput times quality gate — does not confirm a lasting gain. Plain language: people feel productive before coordination tax shows up. Mechanism HR will recognize: causal pass puts twelve-to-fourteen-week lag from visit-cadence slip to engagement decay; ABM shows weak cross-team ties when visit weeks cluster instead of spreading. Call: six-month pilot in two business units with enforced visit cadence and monthly manager calibration — not enterprise mandate. Confidence zero point eight two after realism vetting; widen if you want union or geo slices next run.",
    },
    {
      role: "arche",
      say: "Fair challenge. Every claim maps to a line in the orchestration trace — click workforce fetch, causal lag, or ABM emergent and the log scrolls. We ingested a scrubbed workforce snapshot, estimated treatment lags on engagement and manager hours, then ran seventy-eight ABM steps for baseline versus policy. Vetting returned PASS with explicit boundary notes: no union shock in this bundle, productivity is self-report heavy. If a feed fails, you will see WARN in trace and confidence drops — I do not ship a polite essay.",
    },
    {
      role: "narrator",
      say: "Scenario realism vetting runs — boundary conditions logged before the answer ships.",
    },
    {
      role: "decision_ops",
      say: "Make this playbook queryable in chat. Small context, fast answers — escalation paths must stay human.",
    },
  ];

  function buildScenarioE(userQuery) {
    var seeker = "Jordan · job seeker (SMS)";
    var archeLabel = "ArchE → Coach";
    var opener =
      (userQuery && userQuery.length > 20
        ? userQuery.slice(0, 200)
        : "Need a tighter resume bullet for a product manager role. I pasted the job description in my last text.") +
      " Can you rewrite one bullet using my Vault playbook tone, not generic career advice?";
    var coachOpen =
      "Jordan — got your text. I am loading your thread and the Vault chunks we indexed for resume rewrites. " +
      "Give me a few seconds to retrieve playbook language before I answer on SMS.";
    var answer =
      "Try this bullet: Led cross-functional launch of a subscription analytics feature, cutting time-to-insight from weeks to days and lifting trial-to-paid conversion eight percent in two quarters. " +
      "Pulled from your Vault win-story patterns — not a generic ChatGPT template. Reply STOP any time to opt out.";
    var skeptic =
      "That sounds polished — how do I know this is not just ChatGPT career fluff? What actually ran on your side?";
    var proofReply =
      "Fair challenge. Trace shows webhook in, memory keyed to your phone hash, four Vault chunks retrieved, then vetting blocked generic advice before Twilio sent the reply. " +
      "If retrieval misses, I say I do not have your Vault passage yet — I do not invent coaching copy.";

    return {
      title: "SMS job coach — Vault RAG (live conversation)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "The Job Seeker's Vault — paid subscribers text in on SMS. Same spine as our production webhook agent: intake, memory, Vault RAG, vetting, outbound reply.",
          pipeline: "intake",
        },
        {
          role: "decision_jordan",
          label: seeker,
          say: opener,
          pipeline: "intake",
        },
        {
          role: "arche",
          label: archeLabel,
          say: coachOpen,
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("WEBHOOK   inbound sms from=+1***  bytes=142", 0), "trace-webhook"),
            termEntry(runLog("MEMORY    thread_id=phone_hash  turns=7", 1), "trace-memory"),
            termEntry(runLog("GATE      systeme_paid_user=verified", 2), "trace-gate"),
          ],
          termDelay: 280,
        },
        {
          role: "narrator",
          label: "RAG booth",
          say:
            "Vault chunks indexed — resume bullets, job-description decode, LinkedIn lines, referral scripts, interview practice, accountability nudges.",
          pipeline: "plan",
          tools: ["compress", "research", "llm", "vetting", "workflow"],
        },
        {
          toolFocus: {
            tool: "compress",
            doing: "Compressing and indexing Vault playbook sections so retrieval stays small per SMS segment.",
            tie: "Tagged trace-rag below — this is the grounded coaching layer.",
            also: ["compress", "research", "llm"],
            forecast: "Top four Vault chunks selected for resume-bullet intent.",
          },
          terminal: [
            termEntry(runLog("RAG       retrieve top_k=4 vault_chunks=11  tokens=3.1k", 3), "trace-rag"),
            termEntry(runLog("OPENAI    intent=rewrite_resume_bullet  model=gpt-4o-mini", 4), "trace-llm"),
            termEntry(runLog("VETTING   grounded=yes  generic_advice=blocked", 5), "trace-vetting"),
          ],
          termDelay: 260,
          pipeline: "tools",
          tools: ["compress", "llm", "vetting"],
        },
        {
          role: "arche",
          label: archeLabel,
          say: answer,
          pipeline: "answer",
          terminal: [
            termEntry(runLog("OUTBOUND  twilio_reply segments=1  chars=312", 6), "trace-outbound"),
          ],
          termDelay: 220,
        },
        {
          role: "decision_jordan",
          label: seeker,
          say: skeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            { label: "Jump to webhook intake", traceAnchor: "trace-webhook" },
            { label: "Jump to Vault retrieval", traceAnchor: "trace-rag" },
            { label: "Jump to vetting gate", traceAnchor: "trace-vetting" },
          ],
        },
        {
          role: "narrator",
          label: "Play-by-play",
          say: "Vetting gate before send — coaching copy must be grounded or it does not ship on SMS.",
          pipeline: "vet",
          tools: ["vetting"],
        },
        {
          timeline: "M1: Vault ingest  ·  M2: Twilio webhook  ·  M3: Systeme paid-user gate + admin log",
          pipeline: "answer",
        },
        {
          terminal: [
            termEntry(runLog("SESSION", "complete  mode=sms_coach_demo  conf=0.88", 7)),
          ],
          termDelay: 200,
          pipeline: "answer",
        },
      ],
    };
  }

  /* ——— Screenplay scenarios ——— */
  var SCENARIOS = {
    a: { hydrate: true },
    /* Scenario D built at runtime via buildScenarioD() — thousands of levers, automated closed loop */
    d: null,
    /* Scenario B built at runtime via buildScenarioB() — mapper-depth trace + dual-layer answer */
    b: null,
    e: null,
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
          role: "decision_ops",
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
            termEntry(runLog("SESSION", "start  job=playbook_rag  pages=198", 0), "trace-playbook"),
            termEntry(runLog("TOOL", "chunk_sections=42  index_entries=812", 1), "trace-playbook"),
            termEntry(runLog("TOOL", "retrieve top_k=3  tokens=2.8k", 3), "trace-rag"),
            termEntry(runLog("VETTING", "escalation_path=exact_match", 4), "trace-vetting"),
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
          role: "decision_ops",
          label: "Director of Operations",
          say: "Show me the CLI proof for indexing and retrieval — not a slide, the actual trace lines.",
          pipeline: "answer",
        },
        {
          role: "arche",
          label: "ArchE",
          say:
            "Click any source below — the orchestration trace flashes the matching line and a proof panel opens with the scrubbed CLI capture for that step.",
          pipeline: "answer",
          sources: [
            { label: "Jump to playbook index lines", traceAnchor: "trace-playbook" },
            { label: "Jump to retrieval proof", traceAnchor: "trace-rag" },
            { label: "Jump to vetting gate", traceAnchor: "trace-vetting" },
          ],
        },
        {
          timeline: "T+0:12m indexed  ·  T+0:25m first vetted Q&A slice",
          pipeline: "answer",
        },
      ],
    },
  };

  function isHomeServicesQuery(t) {
    return (
      /\b(?:window|door|windows|doors|remodel|contractor|installer|siding|roofing|gutter)s?\b/.test(t) ||
      /\bhome improvement\b/.test(t) ||
      /\bglass replacement\b/.test(t) ||
      /\breplacement windows?\b/.test(t)
    );
  }

  function isAgricultureQuery(t) {
    return /\b(?:pig|pigs|hog|hogs|swine|livestock|dairy|cattle|poultry|farmer|farming|agricultur|greenhouse|barn|feedlot|cafo|animal husbandry|indoor farm)\b/.test(
      t
    ) || /\b(?:pig|hog|swine|livestock|dairy)\s+farm\b/.test(t) || /\bfarm\b/.test(t) && /\b(?:pig|hog|swine|indoor|livestock)\b/.test(t);
  }

  function detectBriefVertical(q) {
    var t = (q || "").toLowerCase();
    if (
      /strip club|stripclub|gentlemen.?s club|nightclub|night club|adult entertainment|cabaret|liquor license|bottle service/.test(
        t
      )
    )
      return "nightlife";
    if (
      /automotive|auto dealer|dealership|dealerships|used car|pre-?owned|car lot|vehicle|vehicles|\bcars\b|car sales|suv|truck|vin\b|manheim|kbb|kelley|nada|days on lot|floorplan|trade-?in|recon cost|dealership lot/.test(
        t
      )
    )
      return "automotive";
    if (isAgricultureQuery(t)) return "agriculture";
    if (isHomeServicesQuery(t)) return "local";
    return null;
  }

  function routeQuery(q) {
    var t = q.toLowerCase();
    var vertical = detectBriefVertical(q);
    if (vertical === "automotive") return "automotive";
    if (vertical === "nightlife") return "nightlife";
    if (vertical === "agriculture") return "agriculture";
    if (vertical === "local") return "local";
    if (/kill|losing ad|roas|cpa|meta|creative|ads|autopilot|50k|media|lever|thousand|variable|closed.?loop|veo|redtrack|orchestrat/.test(t))
      return "d";
    if (/churn|dashboard|disagree|metric/.test(t)) return "a";
    if (/policy|simulate|18|remote|retention/.test(t)) return "b";
    if (/playbook|rag|doc|compress/.test(t)) return "c";
    if (/sms|twilio|job search coach|job seeker|vault|resume bullet|linkedin headline|referral message|interview practice|accountability/.test(t))
      return "e";
    return "custom";
  }

  function sourceProof(label, traceAnchor, citationUrl) {
    var vis = PROOF_VISUALS[traceAnchor] || {};
    return {
      label: label,
      traceAnchor: traceAnchor,
      citationUrl: citationUrl || vis.citation || "",
      proofImage: vis.src,
      proofTitle: vis.title,
      proofSubtitle: vis.subtitle,
    };
  }

  /** Custom brief — automotive / dealership (inventory, pricing, comps, reviews). */
  function buildScenarioAutomotive(q) {
    var ctx = getLiveContext();
    var region = "Kalamazoo / southwest Michigan";
    if (/grand rapids/.test(q.toLowerCase())) region = "Grand Rapids / west Michigan";
    var guestLabel = "Decision maker (your text)";
    var archeLabel = "ArchE";
    var skeptic =
      "Every dealer says they are priced right — show me the actual comps and lot data, not generic advice.";
    var proofReply =
      "Click each source — you get a full spreadsheet or dashboard capture plus the cited URI in the popup footer. " +
      "Production wires your DMS, pricing feeds, and reputation APIs with your margin rules.";

    var answer =
      "For " +
      region +
      " used and CPO, target thirty-six to forty-one days on lot on core units — hold recon under twelve hundred on sedans and fifteen hundred on trucks. " +
      "Price to market index one point zero to one point zero three on high-demand SUVs; do not chase sub-one on aged sedans — wholesale or slash ask after fifty-five days. " +
      "Gross per unit should land twenty-two hundred to thirty-eight hundred on retail self-financed deals when you tighten trade-in bands to KBB retail minus eight to eleven percent. " +
      "Spend on Google Vehicle Listings and Meta inventory campaigns only on units under twenty-eight days with photo sets complete — that lifts lot traffic without eroding front gross.";

    return {
      title: "Automotive — inventory, pricing, and lot gross (your brief)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "Dealer brief — cars and trucks, not home services. ArchE pulls lot aging, market pricing bands, comp set, and reputation before recommending days-on-lot and gross targets.",
          pipeline: "intake",
        },
        { role: "decision_guest", label: guestLabel, say: q, pipeline: "intake" },
        {
          terminal: [
            termEntry(runLog("TEMPORAL", "viewer_local=" + ctx.clockLocal + "  vertical=automotive", 0), "trace-temporal"),
            termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  vertical=automotive  mode=live_validation", 1), "trace-session"),
            termEntry(runLog("INVOKE", "workflow=dealer_lot_gross  step=decompose_intent", 2)),
            termEntry(runLog("MAP", "entities=inventory,pricing,comps,reviews,days_on_lot", 3), "trace-map-problem"),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["llm", "workflow", "research"],
        },
        {
          role: "arche",
          label: archeLabel,
          say:
            ctx.greet +
            ". I am pulling your lot aging, market pricing index, and dealer comp set for " +
            region +
            " — watch the trace; I will cite each source as a document you can open.",
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "inventory_aging  uri=https://api.demo/automotive/inventory/kz-lot-2025q2  status=200", 4), "trace-auto-inventory"),
            termEntry(runLog("FETCH", "market_pricing  uri=https://markets.demo/automotive/pricing/kz-used  status=200", 5), "trace-auto-pricing"),
            termEntry(runLog("FETCH", "comp_set_25mi  uri=https://research.demo/automotive/comps/kz-dealers  n=4", 6), "trace-auto-comp"),
            termEntry(runLog("FETCH", "dealer_reviews  uri=https://reviews.demo/gbp/scrub-dealer-kz  window=90d", 7), "trace-auto-reviews"),
          ],
          termDelay: 260,
        },
        {
          toolFocus: {
            tool: "research",
            doing: "Synthesizing days-on-lot, market index, and comp spreads for your segment.",
            tie: "Spreadsheet and chart proofs open from the source links.",
            also: ["research", "live", "vetting"],
            forecast: "DOM target 36–41d · gross band $2.2k–$3.8k/unit",
          },
          terminal: [
            termEntry(runLog("CALC", "median_dom=38  target_dom=36-41  units_over_55d=12", 8), "trace-auto-inventory"),
            termEntry(runLog("CALC", "price_index=1.01  segment=suv_truck  sedans_below_1.0=flag", 9), "trace-auto-pricing"),
            termEntry(runLog("CALC", "comp_spread=+2.1% vs median_ask  dealers=4", 10), "trace-auto-comp"),
            termEntry(runLog("CALC", "review_velocity=4.58  detractor_sla=2h", 11), "trace-auto-reviews"),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["research", "live", "vetting"],
          forecast: {
            title: "While automotive evidence lands",
            rows: [
              { label: "Median days on lot", pct: 72, value: "38d" },
              { label: "Market price index", pct: 81, value: "1.01" },
              { label: "Target gross / unit", pct: 76, value: "$2.2–3.8k" },
            ],
            note: "Vetting locks numbers before the answer ships.",
          },
        },
        { role: "arche", label: archeLabel, say: answer, pipeline: "vet", tools: ["vetting", "research"] },
        {
          terminal: [
            termEntry(runLog("VETTING", "vertical=automotive  status=PASS  conf=0.86", 12), "trace-auto-vetting"),
            termEntry(runLog("SRC", "evidence_bundle=EB-AUTO-07  citations=5  check=PASS", 13), "trace-auto-vetting"),
          ],
          termDelay: 240,
          pipeline: "vet",
          tools: ["vetting"],
        },
        { role: "decision_guest", label: guestLabel, say: skeptic, pipeline: "answer" },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            sourceProof("Open lot inventory spreadsheet", "trace-auto-inventory", "https://api.demo/automotive/inventory/kz-lot-2025q2"),
            sourceProof("Open market pricing dashboard", "trace-auto-pricing", "https://markets.demo/automotive/pricing/kz-used"),
            sourceProof("Open competitive set sheet", "trace-auto-comp", "https://research.demo/automotive/comps/kz-dealers"),
            sourceProof("Open dealer reviews panel", "trace-auto-reviews", "https://reviews.demo/gbp/scrub-dealer-kz"),
            sourceProof("Open vetting bundle", "trace-auto-vetting", "https://vetting.demo/bundles/EB-AUTO-07"),
          ],
        },
        {
          timeline: "T+0:40m vetted brief  ·  T+3d pricing test  ·  T+14d DOM vs gross scorecard",
          pipeline: "answer",
        },
        {
          terminal: [
            termEntry(runLog("ANSWER", "vertical=automotive  dom_target=36-41  conf=0.86", 14), "trace-answer"),
            termEntry(runLog("SESSION", "complete  duration=19m40s  run_id=" + DEMO_RUN_ID, 15)),
          ],
          termDelay: 220,
          pipeline: "answer",
        },
      ],
    };
  }

  /** Custom brief — nightlife / venue (NOT home services). */
  function buildScenarioNightlife(q) {
    var ctx = getLiveContext();
    var region = /kalamazoo|southwest michigan|grand rapids|battle creek/.test(q.toLowerCase())
      ? "southwest Michigan"
      : "your market";
    var answer =
      "Becoming the dominant adult nightclub in " +
      region +
      " is a licensing, zoning, security, and reputation stack — not a contractor margin problem. " +
      "You need counsel on municipal adult-use ordinances, liquor license class and quota waitlists, fire-occupancy upgrades, and security staffing ratios before you scale marketing. " +
      "Competitive position: map incumbent venues within thirty miles, their cover and VIP mix, review sentiment, and incident history — then differentiate on safety, lighting, and predictable door policy rather than racing on promotion alone. " +
      "Cap expansion spend until you pass a vetting gate on legal and insurance — ArchE would wire live ordinances, comp set footfall proxies, and reputation feeds in production.";

    return {
      title: "Nightlife / venue strategy (your brief)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "Venue strategy brief for the buyer's actual question — adult nightlife in " +
            region +
            ". ArchE pulls zoning, liquor licensing context, comp venues, and reputation — not windows or doors.",
          pipeline: "intake",
        },
        { role: "decision_guest", label: "Decision maker (your text)", say: q, pipeline: "intake" },
        {
          terminal: [
            termEntry(runLog("MAP", "vertical=nightlife_venue  intent=" + q.slice(0, 60), 0), "trace-map-problem"),
            termEntry(runLog("INVOKE", "workflow=venue_market_strategy  step=decompose_intent", 1)),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["research", "live", "vetting"],
        },
        {
          role: "arche",
          label: "ArchE",
          say:
            ctx.greet +
            ". I am on your actual question — venue dominance in " +
            region +
            " — pulling ordinance summaries, comp venue signals, and reputation trends on the trace.",
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "zoning_adult_use  uri=https://research.demo/zoning/sw-mi-adult  status=200", 2), "trace-market"),
            termEntry(runLog("FETCH", "comp_venues_30mi  uri=https://research.demo/nightlife/comps  n=12", 3), "trace-market"),
            termEntry(runLog("FETCH", "reputation_feed  uri=https://reviews.demo/venue/scrub  window=90d", 4), "trace-reviews"),
          ],
          termDelay: 260,
        },
        {
          role: "arche",
          label: "ArchE",
          say: answer,
          pipeline: "vet",
          tools: ["vetting", "research"],
        },
        {
          terminal: [termEntry(runLog("VETTING", "vertical=nightlife  status=PASS  conf=0.82", 5), "trace-vetting")],
          termDelay: 220,
          pipeline: "vet",
        },
        {
          role: "arche",
          label: "ArchE",
          say: "Click sources for spreadsheet and review captures — each cites a scrubbed URI. This preview is illustrative; production uses your counsel packet and live feeds.",
          pipeline: "answer",
          sources: [
            sourceProof("Open zoning / comp research sheet", "trace-market", "https://research.demo/nightlife/comps"),
            sourceProof("Open reputation panel", "trace-reviews", "https://reviews.demo/venue/scrub"),
            sourceProof("Open vetting bundle", "trace-vetting", "https://vetting.demo/bundles/EB-NIGHT-01"),
          ],
        },
        { timeline: "T+0:50m vetted brief  ·  T+14d licensing checkpoint", pipeline: "answer" },
      ],
    };
  }

  /** Custom brief — agriculture / livestock (pig, hog, indoor production). */
  function buildScenarioAgriculture(q) {
    var ctx = getLiveContext();
    var region = /southwest michigan|kalamazoo|berrien|cass|van buren/.test(q.toLowerCase())
      ? "southwest Michigan"
      : "your region";
    var isPig = /\bpig|hog|swine|farrow|finisher/.test(q.toLowerCase());
    var species = isPig ? "indoor hog" : "livestock";
    var guestLabel = "Decision maker (your text)";
    var archeLabel = "ArchE";
    var skeptic =
      "Every ag consultant says scale up — how do I know this is not generic advice? Show me what ran.";
    var proofReply =
      "Fair question. Click each source — the trace flashes the matching CLI line and opens the scrubbed proof capture. " +
      "Production wires MDARD filings, packer contracts, feed bids, and your mortality logs with your thresholds.";
    var answer =
      "To become the largest " +
      species +
      " operation in " +
      region +
      ", you scale in phases — permits and packer access before headcount. " +
      "Phase one: confirm county zoning and MDARD site-approval for confined feeding; model ventilation and manure management for indoor barns — that caps realistic headcount before you sign feed contracts. " +
      "Phase two: secure packer or marketing cooperative off-take with weekly kill windows; without binding slaughter capacity, growing inventory becomes a margin trap. " +
      "Phase three: unit economics — target feed conversion near 2.7 to 2.9 on finishers, keep all-in cost per head under your regional comp set, and stage barn expansion only when biosecurity audits and mortality stay inside your vetting band. " +
      "Competitive map: benchmark the three largest existing producers within fifty miles on permitted capacity, not marketing claims — then close the gap on logistics (feed mill distance, trucking, wash stations) where incumbents are slow.";

    return {
      title: "Agriculture — " + species + " scale & unit economics (your brief)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "Livestock brief for the buyer's actual question — " +
            species +
            " in " +
            region +
            ". ArchE pulls regulatory capacity, regional hog inventory, packer off-take, and unit economics — not windows, doors, or installer margins.",
          pipeline: "intake",
        },
        { role: "decision_guest", label: guestLabel, say: q, pipeline: "intake" },
        {
          terminal: [
            termEntry(runLog("TEMPORAL", "viewer_local=" + ctx.clockLocal + "  vertical=agriculture", 0), "trace-temporal"),
            termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  vertical=agriculture  mode=live_validation", 1), "trace-session"),
            termEntry(runLog("INVOKE", "workflow=livestock_scale_strategy  step=decompose_intent", 2)),
            termEntry(runLog("MAP", "entities=permits,capacity,packer,feed,biosecurity  region=" + region.replace(/\s/g, "_"), 3), "trace-map-problem"),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["llm", "research", "live", "vetting"],
        },
        {
          role: "arche",
          label: archeLabel,
          say:
            ctx.greet +
            ". I am on your " +
            species +
            " question for " +
            region +
            " — pulling MDARD permit context, regional capacity, packer schedules, and feed economics on the trace.",
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "mdard_permits  uri=https://research.demo/ag/mdard-sw-mi-livestock  status=200", 4), "trace-ag-regulatory"),
            termEntry(runLog("FETCH", "regional_capacity  uri=https://markets.demo/ag/sw-mi-hog-capacity  status=200", 5), "trace-ag-capacity"),
            termEntry(runLog("FETCH", "packer_offtake  uri=https://api.demo/ag/packer-slots/sw-mi  status=200", 6), "trace-ag-capacity"),
          ],
          termDelay: 260,
        },
        {
          toolFocus: {
            tool: "research",
            doing: "Synthesizing permitted capacity, packer binding, and feed conversion for staged barn expansion.",
            tie: "Spreadsheet and unit-econ proofs open from the source links.",
            also: ["research", "live", "vetting"],
            forecast: "Staged headcount · FCR 2.7–2.9 · packer gate before build",
          },
          terminal: [
            termEntry(runLog("CALC", "permitted_headroom=+4200  phase=1  county=berrien", 7), "trace-ag-regulatory"),
            termEntry(runLog("CALC", "comp_capacity_50mi=3  largest_incumbent=12.4k_head", 8), "trace-ag-capacity"),
            termEntry(runLog("CALC", "unit_econ  fcr=2.82  margin_head=$18-24  conf=0.83", 9), "trace-ag-economics"),
            termEntry(runLog("VETTING", "biosecurity_audit=PASS  mortality_band=ok", 10), "trace-ag-biosecurity"),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["research", "live", "vetting"],
        },
        { role: "arche", label: archeLabel, say: answer, pipeline: "vet", tools: ["vetting", "research"] },
        {
          terminal: [
            termEntry(runLog("VETTING", "vertical=agriculture  claims=permits+capacity+econ  status=PASS  conf=0.83", 11), "trace-vetting"),
          ],
          termDelay: 220,
          pipeline: "vet",
        },
        { role: "decision_guest", label: guestLabel, say: skeptic, pipeline: "answer" },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            sourceProof("Open MDARD / county permit matrix", "trace-ag-regulatory", "https://research.demo/ag/mdard-sw-mi-livestock"),
            sourceProof("Open regional capacity sheet", "trace-ag-capacity", "https://markets.demo/ag/sw-mi-hog-capacity"),
            sourceProof("Open unit economics dashboard", "trace-ag-economics", "https://models.demo/ag/indoor-hog-unit-econ"),
            sourceProof("Open biosecurity audit panel", "trace-ag-biosecurity", "https://vetting.demo/ag/biosecurity-audit"),
            sourceProof("Open vetting bundle", "trace-vetting", "https://vetting.demo/bundles/EB-AG-01"),
          ],
        },
        { timeline: "T+0:45m vetted brief  ·  T+21d permit checkpoint  ·  T+90d phase-1 capacity gate", pipeline: "answer" },
        {
          terminal: [
            termEntry(runLog("ANSWER", "vertical=agriculture  species=" + species.replace(/\s/g, "_") + "  conf=0.83", 12), "trace-answer"),
            termEntry(runLog("SESSION", "complete  duration=21m10s  run_id=" + DEMO_RUN_ID, 13)),
          ],
          termDelay: 220,
          pipeline: "answer",
        },
      ],
    };
  }

  /** Custom brief — local home services (windows/doors, reviews, regional competition). */
  function buildScenarioLocalServices(q) {
    var ctx = getLiveContext();
    var region = "southwest Michigan";
    if (/kalamazoo/.test(q.toLowerCase())) region = "Kalamazoo / southwest Michigan";
    else if (/grand rapids/.test(q.toLowerCase())) region = "Grand Rapids / west Michigan";
    else if (/battle creek|niles|berrien/.test(q.toLowerCase())) region = "Berrien–Cass corridor";

    var guestLabel = "Decision maker (your text)";
    var archeLabel = "ArchE";
    var skeptic =
      "Every installer says they are competitive — how do I know this is not generic advice? Show me what ran.";
    var proofReply =
      "Fair question. Click each source — the trace flashes the matching CLI line and opens the scrubbed proof capture. " +
      "This preview uses demo endpoints; production wires your CRM, ad accounts, and review APIs with your thresholds.";

    var answer =
      "Here is the balanced play for " +
      region +
      ": hold installed margin in a band roughly eighteen to twenty-two percent on standard replacement jobs — not race to the bottom on bid boards. " +
      "Protect reviews by capping concurrent installs per crew, posting completion photos within forty-eight hours, and routing detractors to a human callback inside two hours — that keeps star rating velocity above four point six while you still win price-sensitive leads. " +
      "Competitive position: cluster Google Local Services and Meta within a fifteen-mile radius of your shop, emphasize warranty and lead-time honesty in copy, and raise price only on surge weeks when competitor quotes lag more than six days — that is where profit lifts without review bleed.";

    return {
      title: "Local services — profit, reviews, competition (your brief)",
      beats: [
        {
          role: "narrator",
          label: "Play-by-play",
          say:
            "Regional installer brief — windows and doors, southwest Michigan. ArchE pulls local demand, competitor quotes, and review velocity before recommending a margin band.",
          pipeline: "intake",
        },
        {
          role: "decision_guest",
          label: guestLabel,
          say: q,
          pipeline: "intake",
        },
        {
          terminal: [
            termEntry(runLog("TEMPORAL", "viewer_local=" + ctx.clockLocal + "  region=" + region.replace(/\s/g, "_"), 0), "trace-temporal"),
            termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  vertical=home_services  mode=live_validation", 1), "trace-session"),
            termEntry(runLog("INVOKE", "workflow=local_growth_margin  step=decompose_intent", 2)),
            termEntry(runLog("MAP", "entities=profit,reviews,competition,install_capacity  market=" + region, 3), "trace-map-problem"),
          ],
          termDelay: 280,
          pipeline: "plan",
          tools: ["llm", "workflow"],
        },
        {
          role: "arche",
          label: archeLabel,
          say:
            ctx.greet +
            ". I am pulling " +
            region +
            " demand signals, competitor install quotes, and your review trend before I recommend a margin band — give me a moment on the trace.",
          pipeline: "plan",
          terminalParallel: [
            termEntry(runLog("FETCH", "local_market_scan  uri=https://markets.demo/local/sw-mi-windows-doors  status=200", 4), "trace-local-market"),
            termEntry(runLog("FETCH", "google_business_reviews  uri=https://reviews.demo/gbp/scrub-installer  samples=90d", 5), "trace-reviews"),
            termEntry(runLog("FETCH", "competitor_quotes  uri=https://research.demo/bids/sw-mi-replacement  n=38", 6), "trace-competitor"),
          ],
          termDelay: 260,
        },
        {
          toolFocus: {
            tool: "research",
            doing: "Synthesizing bid-board spreads, seasonality, and review-risk curves for replacement windows and entry doors.",
            tie: "Lines tagged trace-competitor and trace-reviews below.",
            also: ["research", "live", "vetting"],
            forecast: "Margin band tightening around eighteen to twenty-two percent with review guardrails.",
          },
          terminal: [
            termEntry(runLog("CALC", "price_band=mid_market  competitor_undercut_pct=7.2", 7), "trace-competitor"),
            termEntry(runLog("CALC", "review_velocity=4.61  detractor_callback_sla=2h", 8), "trace-reviews"),
            termEntry(runLog("CALC", "margin_model  target=18-22%  surge_week=+4pt_max", 9), "trace-margin"),
            termEntry(runLog("LINK", "margin_model → campaign_copy=lead_time_honesty", 10)),
          ],
          termDelay: 240,
          pipeline: "tools",
          tools: ["research", "live", "vetting"],
          forecast: {
            title: "While local evidence lands",
            rows: [
              { label: "Competitive undercut risk", pct: 68, value: "7.2%" },
              { label: "Review floor (90d)", pct: 84, value: "4.6★" },
              { label: "Target margin band", pct: 78, value: "18–22%" },
            ],
            note: "Vetting gate locks numbers before answer ships.",
          },
        },
        {
          role: "arche",
          label: archeLabel,
          say: answer,
          pipeline: "vet",
          tools: ["vetting", "research"],
        },
        {
          terminal: [
            termEntry(runLog("VETTING", "claims=local_market+reviews+margin  status=PASS  conf=0.84", 11), "trace-vetting"),
            termEntry(runLog("SRC", "evidence_bundle=EB-LOCAL-03  citations=4  check=PASS", 12), "trace-vetting"),
          ],
          termDelay: 240,
          pipeline: "vet",
          tools: ["vetting"],
        },
        {
          role: "decision_guest",
          label: guestLabel,
          say: skeptic,
          pipeline: "answer",
        },
        {
          role: "arche",
          label: archeLabel,
          say: proofReply,
          pipeline: "answer",
          sources: [
            sourceProof("Open regional demand spreadsheet", "trace-local-market", "https://markets.demo/local/sw-mi-windows-doors"),
            sourceProof("Open review velocity panel", "trace-reviews", "https://reviews.demo/gbp/scrub-installer"),
            sourceProof("Open competitor quote sheet", "trace-competitor", "https://research.demo/bids/sw-mi-replacement"),
            sourceProof("Open margin dashboard", "trace-margin", "https://models.demo/local/margin-v3"),
            sourceProof("Open vetting bundle", "trace-vetting", "https://vetting.demo/bundles/EB-LOCAL-03"),
          ],
        },
        {
          timeline: "T+0:45m vetted brief  ·  T+7d campaign test  ·  T+30d margin vs review scorecard",
          pipeline: "answer",
        },
        {
          terminal: [
            termEntry(runLog("ANSWER", "region=" + region.replace(/\s/g, "_") + "  margin_band=18-22%  conf=0.84", 13), "trace-answer"),
            termEntry(runLog("SESSION", "complete  duration=22m05s  run_id=" + DEMO_RUN_ID, 14)),
          ],
          termDelay: 220,
          pipeline: "answer",
        },
      ],
    };
  }

  function resolveLiveApiUrl() {
    if (PORTFOLIO_LIVE_API) return PORTFOLIO_LIVE_API;
    if (typeof location === "undefined" || !/^https?:/.test(location.protocol)) return "";
    var host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      if (location.port === "17890") {
        return location.protocol + "//" + location.host + "/api/portfolio/brief";
      }
      return location.protocol + "//" + host + ":17890/api/portfolio/brief";
    }
    var probedKey = "PORTFOLIO_LIVE_API_PROBE_" + location.origin;
    var probedVal = "";
    try {
      probedVal = (typeof localStorage !== "undefined" && localStorage.getItem(probedKey)) || "";
    } catch (e) {}
    if (probedVal === "ok") {
      return location.origin + "/api/portfolio/brief";
    }
    if (probedVal === "no") {
      return "";
    }
    return location.origin + "/api/portfolio/brief";
  }

  function probeSameOriginPortfolioApi() {
    if (typeof location === "undefined" || !/^https?:/.test(location.protocol)) return;
    var host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return;
    var probedKey = "PORTFOLIO_LIVE_API_PROBE_" + location.origin;
    try {
      fetch(location.origin + "/api/portfolio/health", {
        method: "GET",
        cache: "no-store",
        headers: portfolioFetchHeaders(),
      })
        .then(function (r) {
          if (r.ok) {
            try { localStorage.setItem(probedKey, "ok"); } catch (e) {}
            setVoiceStatus("Voice: Edge TTS (live ArchE)");
            updateDataDisclosure({
              disclosure:
                "Live preview connected. Orchestration and answers run on ArchE; evidence HTML is generated on the fly from your brief (scrubbed demo rows — not your production vault).",
            });
          } else {
            try { localStorage.setItem(probedKey, "no"); } catch (e) {}
          }
        })
        .catch(function () {
          try { localStorage.setItem(probedKey, "no"); } catch (e) {}
        });
    } catch (e) {}
  }
  probeSameOriginPortfolioApi();

  function resolvePortfolioApiRoot() {
    var brief = resolveLiveApiUrl();
    if (brief) return brief.replace(/\/api\/portfolio\/brief\/?$/i, "");
    return "";
  }

  function playEdgeTtsApi(role, text) {
    var root = resolvePortfolioApiRoot();
    if (!root || !text) return Promise.resolve(false);
    var url =
      root +
      "/api/portfolio/tts?role=" +
      encodeURIComponent(role || "arche") +
      "&text=" +
      encodeURIComponent(text.substring(0, 900));
    return new Promise(function (resolve) {
      var a = new Audio(url);
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

  function hydrateTerminalEntries(entries) {
    if (!entries || !entries.length) return [];
    return entries.map(function (e, i) {
      var tag = e.tag || "LOG";
      var msg = e.msg || "";
      var anchor = e.anchor || "";
      return termEntry(runLog(tag, msg, i + 2), anchor || "");
    });
  }

  function hydrateLiveBeats(rawBeats) {
    if (!rawBeats || !rawBeats.length) return [];
    return rawBeats.map(function (b) {
      var beat = {};
      if (b.role) beat.role = b.role;
      if (b.label) beat.label = b.label;
      if (b.say) beat.say = b.say;
      if (b.pipeline) beat.pipeline = b.pipeline;
      if (b.tools) beat.tools = b.tools;
      if (b.toolFocus) beat.toolFocus = b.toolFocus;
      if (b.timeline) beat.timeline = b.timeline;
      if (b.termDelay) beat.termDelay = b.termDelay;
      if (b.sources) beat.sources = enrichLiveSources(b.sources);
      if (b.terminal) beat.terminal = hydrateTerminalEntries(b.terminal);
      if (b.terminalParallel) beat.terminalParallel = hydrateTerminalEntries(b.terminalParallel);
      return beat;
    });
  }

  function fetchLiveBrief(query, opts) {
    opts = opts || {};
    return loadLiveApiConfig().then(function () {
      var url = resolveLiveApiUrl();
      if (!url || !query) {
        return {
          ok: false,
          error: "no_live_api",
          detail:
            "Live ArchE is offline right now. Reload in a moment, or message the team for a guided run.",
        };
      }
      return fetchLiveBriefWithUrl(url, query, opts);
    });
  }

  function fetchLiveBriefWithUrl(url, query, opts) {
    opts = opts || {};
    var root = url.replace(/\/api\/portfolio\/brief\/?$/i, "");

    function postBrief() {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timeoutMs = 180000;
      var timer = ctrl
        ? setTimeout(function () {
            ctrl.abort();
          }, timeoutMs)
        : null;
      var postBody = { query: query };
      var bn = opts.businessName != null ? opts.businessName : getBuyerBusinessName();
      if (bn) postBody.business_name = bn;
      if (opts.followUp) {
        postBody.is_follow_up = true;
        postBody.follow_up = query;
        postBody.prior_query = opts.priorQuery || conversationState.priorQuery || "";
        postBody.prior_answer = opts.priorAnswer || conversationState.priorAnswer || lastArcheAnswerText || "";
      }
      var postHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      var pfh = portfolioFetchHeaders();
      for (var hk in pfh) {
        if (Object.prototype.hasOwnProperty.call(pfh, hk)) postHeaders[hk] = pfh[hk];
      }
      return fetch(url, {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify(postBody),
        signal: ctrl ? ctrl.signal : undefined,
      })
        .then(function (r) {
          if (!r.ok) throw new Error("brief api HTTP " + r.status);
          return r.json();
        })
        .then(function (payload) {
          if (!payload || !payload.ok || !payload.beats || !payload.beats.length) {
            return {
              ok: false,
              error: (payload && payload.error) || "empty_brief",
              engine: payload && payload.engine,
              detail: (payload && payload.error) || "ArchE returned no beats",
            };
          }
          return {
            ok: true,
            title: payload.title || "Your brief (live ArchE)",
            beats: hydrateLiveBeats(payload.beats),
            engine: payload.engine || "live",
            error: payload.error,
            evidence_pack: payload.evidence_pack || null,
            query: payload.query || query,
            prior_query: payload.prior_query || "",
            is_follow_up: !!payload.is_follow_up,
            needs_clarification: !!payload.needs_clarification,
            clarification_kind: payload.clarification_kind || "",
            clarification_question: payload.clarification_question || "",
            present_url: payload.present_url || "",
            arche_answer_snippet: payload.arche_answer_snippet || "",
            full_strategy: payload.full_strategy || "",
            strategy_sections: payload.strategy_sections || [],
          };
        })
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    }

    function healthOk() {
      return fetch(root + "/api/portfolio/health", {
        method: "GET",
        cache: "no-store",
        headers: portfolioFetchHeaders(),
      })
        .then(function (r) {
          return r.ok;
        })
        .catch(function () {
          return false;
        });
    }

    return healthOk()
      .then(function (ok) {
        if (!ok) throw new Error("portfolio health unreachable at " + root);
        return postBrief();
      })
      .catch(function (e) {
        return delay(400).then(function () {
          return healthOk().then(function (ok2) {
            if (!ok2) throw e;
            return postBrief();
          });
        });
      })
      .catch(function (e) {
        return {
          ok: false,
          error: "fetch_failed",
          detail: e && e.message ? e.message : String(e),
        };
      });
  }

  /** Shown only when live ArchE API is unreachable — never keyword vertical scripts. */
  function buildLiveArchEUnavailableScenario(q, reason) {
    var ctx = getLiveContext();
    var why =
      reason && reason.detail
        ? reason.detail
        : reason && reason.error
          ? reason.error
          : "Live API not reachable";
    return {
      title: "Live ArchE is offline — please try again in a moment",
      beats: [
        {
          role: "narrator",
          say:
            "This live preview is temporarily offline. Your question was received but not run.",
          pipeline: "intake",
        },
        { role: "decision_guest", label: "You", say: q, pipeline: "intake" },
        {
          terminal: [
            termEntry(runLog("STATUS", "live_arche  state=offline  retry=auto", 0), "trace-session"),
            termEntry(runLog("NEXT", "refresh_page_or_request_guided_run", 1), "trace-plan"),
          ],
          termDelay: 280,
          pipeline: "plan",
        },
        {
          role: "arche",
          label: "ArchE",
          say:
            ctx.greet +
            ". The live preview is offline right now, so I have not run your question yet. " +
            "Please refresh the page in a moment, or send the question through the contact link and we will reply with a full vetted brief. " +
            "Your text is preserved in the box so you can re-run with one click when the service returns.",
          pipeline: "answer",
        },
        {
          timeline: "Reload in a moment · all answers come from the live ArchE LLM, not canned scripts",
          pipeline: "answer",
        },
      ],
    };
  }

  function refreshLiveApiHealthStatus() {
    var root = resolvePortfolioApiRoot();
    if (!root) {
      setVoiceStatus("Live API: down — run serve_portfolio_live.py");
      updateDataDisclosure(null);
      return;
    }
    fetch(root + "/api/portfolio/health", {
      cache: "no-store",
      headers: portfolioFetchHeaders(),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (h) {
        if (h && h.ok) {
          setVoiceStatus("Live API: OK · " + (h.llm_provider || "ollama"));
          updateDataDisclosure({
            disclosure:
              "Live preview connected. Orchestration and answers run on ArchE; evidence HTML is generated on the fly from your brief (scrubbed demo rows — not your production vault).",
          });
        } else {
          setVoiceStatus("Live API: down — run serve_portfolio_live.py");
          updateDataDisclosure(null);
        }
      })
      .catch(function () {
        setVoiceStatus("Live API: down — run serve_portfolio_live.py");
        updateDataDisclosure(null);
      });
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
    var reward = $("#unlock-reward-banner");
    if (reward) reward.classList.toggle("hidden", !on);
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
      showSpeakerPopup(role, label);
      var speakP = speakQueued(beat.say, role);
      await drainTerminal(beat.terminalParallel, token, beat.termDelay);
      await speakP;
      hideSpeakerPopup();
      await delay(beat.pauseAfter || 550);
      return;
    }

    if (beat.terminal) {
      await drainTerminal(beat.terminal, token, beat.termDelay);
    }

    if (beat.say) {
      appendBroadcast(role, label, beat.say, beat.sources);
      showSpeakerPopup(role, label);
      if (voiceOn) {
        await speakQueued(beat.say, role);
      } else {
        await delay(Math.min(4200, 900 + beat.say.length * 28));
      }
      hideSpeakerPopup();
      await delay(beat.pauseAfter || 700);
    } else {
      hideSpeakerPopup();
      await delay(beat.pauseAfter || 450);
    }
  }

  async function playFollowUpBeats(beats) {
    var token = ++playToken;
    var play = $("#play-demo");
    if (play) {
      play.disabled = true;
      play.textContent = "Follow-up…";
    }
    setTimeline("Follow-up → live ArchE (evidence regenerated for your thread)…");
    for (var i = 0; i < beats.length; i++) {
      if (token !== playToken) return;
      await runBeat(beats[i], token);
    }
    if (lastArcheAnswerText) conversationState.priorAnswer = lastArcheAnswerText;
    if (play) {
      play.disabled = false;
      play.textContent = "Replay";
    }
  }

  function submitFollowUp() {
    if (followUpBusy) return;
    var followEl = $("#answer-followup");
    var followText = followEl && followEl.value ? followEl.value.trim() : "";
    if (!followText) {
      setVoiceStatus("Type a follow-up first");
      return;
    }
    if (!conversationState.priorQuery && !lastArcheAnswerText) {
      setVoiceStatus("Run an initial brief first");
      return;
    }
    primeAudio();
    voiceOn = true;
    followUpBusy = true;
    var btn = $("#followup-submit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "…";
    }
    setTimeline("Calling live ArchE for your follow-up…");
    fetchLiveBrief(followText, {
      followUp: true,
      priorQuery: conversationState.priorQuery,
      priorAnswer: conversationState.priorAnswer || lastArcheAnswerText,
    })
      .then(function (live) {
        if (live && live.ok && live.beats) {
          if (live.evidence_pack) {
            setLiveEvidenceContext(live.evidence_pack, (conversationState.priorQuery + " " + followText).trim());
          }
          activeBriefQuery = (conversationState.priorQuery + " " + followText).trim();
          updateConversationFromScenario(live, null);
          if (followEl) followEl.value = "";
          return loadManifest().then(function () {
            return playFollowUpBeats(live.beats);
          });
        }
        setTimeline("Follow-up failed — " + (live && live.error ? live.error : "unavailable"));
      })
      .finally(function () {
        followUpBusy = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Submit";
        }
      });
  }

  async function playScenario(scenario) {
    var token = ++playToken;
    stopSpeech();
    clearTheater();
    clockStart = Date.now();

    appendTerminal(termEntry(runLog("SESSION", "run_id=" + DEMO_RUN_ID + "  mode=live_validation", 0)));
    appendTerminal(termEntry(runLog("BOOT", "orchestrator=workflow_engine  trace=portfolio_demo", 0)));
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
    if (scenario && scenario.arche_answer_snippet) {
      conversationState.priorAnswer = scenario.arche_answer_snippet;
    } else if (lastArcheAnswerText) {
      conversationState.priorAnswer = lastArcheAnswerText;
    }
    if (scenario && scenario.evidence_pack) {
      updateSalesHooks(scenario.evidence_pack);
    } else if (lastEvidencePack) {
      updateSalesHooks(lastEvidencePack);
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
    stopQueryMic();
    stopAnswerMic();
    var followEl = $("#answer-followup");
    if (followEl) followEl.value = "";
    hidePresentGiftLink();
    hideSpeakerPopup();
    hideProofPopup();
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

  function speechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  function setMicBtnActive(btn, active) {
    if (!btn) return;
    if (active) btn.classList.add("active");
    else btn.classList.remove("active");
  }

  function startFieldMic(field, btn, state) {
    var Ctor = speechRecognitionCtor();
    if (!Ctor) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (!field) return;
    if (state.active) {
      state.stop();
      return;
    }
    state.baseText = field.value || "";
    var finalTranscript = "";
    var rec = new Ctor();
    state.recognition = rec;
    state.active = true;
    setMicBtnActive(btn, true);
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = function (event) {
      var interim = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t + " ";
        else interim += t;
      }
      var prefix = state.baseText ? state.baseText + " " : "";
      field.value = (prefix + finalTranscript + interim).trim();
    };
    rec.onerror = function () {
      state.stop();
    };
    rec.onend = function () {
      if (state.active) state.stop();
    };
    try {
      rec.start();
    } catch (e) {
      state.stop();
    }
  }

  var queryMicState = {
    active: false,
    recognition: null,
    baseText: "",
    stop: function () {
      if (this.recognition) {
        try {
          this.recognition.onresult = null;
          this.recognition.onerror = null;
          this.recognition.onend = null;
          this.recognition.stop();
        } catch (e) {
          /* ignore */
        }
        this.recognition = null;
      }
      this.active = false;
      this.baseText = "";
      setMicBtnActive($("#query-mic-btn"), false);
    },
  };

  var answerMicState = {
    active: false,
    recognition: null,
    baseText: "",
    stop: function () {
      if (this.recognition) {
        try {
          this.recognition.onresult = null;
          this.recognition.onerror = null;
          this.recognition.onend = null;
          this.recognition.stop();
        } catch (e) {
          /* ignore */
        }
        this.recognition = null;
      }
      this.active = false;
      this.baseText = "";
      setMicBtnActive($("#answer-mic-btn"), false);
    },
  };

  function stopQueryMic() {
    queryMicState.stop();
  }

  function stopAnswerMic() {
    answerMicState.stop();
  }

  function toggleQueryMic() {
    startFieldMic($("#custom-query"), $("#query-mic-btn"), queryMicState);
  }

  function toggleAnswerMic() {
    startFieldMic($("#answer-followup"), $("#answer-mic-btn"), answerMicState);
  }

  function scrapeUrlIntoQuery() {
    var ta = $("#custom-query");
    var raw = (ta && ta.value) || "";
    var urlMatch = raw.match(/https?:\/\/[^\s<>"']+/i);
    var url = urlMatch ? urlMatch[0] : window.prompt("Paste URL to scrape into your question:");
    if (!url) return;
    var root = resolvePortfolioApiRoot();
    if (!root) {
      alert("URL scrape needs the live server. Run: python3 scripts/serve_portfolio_live.py");
      return;
    }
    var btn = $("#query-scrape-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "…";
    }
    fetch(root + "/api/portfolio/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (!res.body || !res.body.ok) {
          alert((res.body && res.body.error) || "Scrape failed");
          return;
        }
        var header = "Source: " + (res.body.url || url) + "\n\n";
        var chunk = (res.body.text || "").trim();
        if (ta) {
          var existing = ta.value.trim();
          ta.value = existing ? existing + "\n\n---\n" + header + chunk : header + chunk;
        }
      })
      .catch(function () {
        alert("Scrape request failed — is serve_portfolio_live.py running?");
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "⎘";
        }
      });
  }

  function speakLastArcheAnswer() {
    if (!lastArcheAnswerText) {
      setVoiceStatus("No ArchE answer yet");
      return;
    }
    primeAudio();
    voiceOn = true;
    var vt = $("#voice-toggle");
    if (vt) vt.textContent = "Voice: ON";
    speakQueued(lastArcheAnswerText, "arche");
  }

  function initSpeechUi() {
    var hasSTT = !!speechRecognitionCtor();
    var qMic = $("#query-mic-btn");
    var aMic = $("#answer-mic-btn");
    if (qMic && !hasSTT) {
      qMic.disabled = true;
      qMic.title = "Speech-to-text not supported in this browser";
    }
    if (aMic && !hasSTT) {
      aMic.disabled = true;
      aMic.title = "Speech-to-text not supported in this browser";
    }
    if (qMic) qMic.addEventListener("click", toggleQueryMic);
    if (aMic) aMic.addEventListener("click", toggleAnswerMic);
    var clearBtn = $("#query-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        stopQueryMic();
        var ta = $("#custom-query");
        if (ta) ta.value = "";
      });
    }
    var scrapeBtn = $("#query-scrape-btn");
    if (scrapeBtn) scrapeBtn.addEventListener("click", scrapeUrlIntoQuery);
    var speakBtn = $("#answer-speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", speakLastArcheAnswer);
    var followSubmit = $("#followup-submit");
    if (followSubmit) followSubmit.addEventListener("click", submitFollowUp);
    var followInput = $("#answer-followup");
    if (followInput) {
      followInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          submitFollowUp();
        }
      });
    }
  }

  function startScenario(key, customQuery) {
    if (key === "d" && !unlocked) {
      alert("Unlock consult preview (code from proposal) for the paid-media scenario and custom brief.");
      return;
    }
    openModal();
    var play = $("#play-demo");
    if (play) {
      play.disabled = true;
      play.textContent = "Running…";
    }
    var titleEl = $("#theater-title");

    function runWithScenario(scenario) {
      activeScenario = scenario;
      if (scenario.evidence_pack) {
        setLiveEvidenceContext(scenario.evidence_pack, scenario.query || customQuery || "");
      } else if (scenario.query) {
        activeBriefQuery = scenario.query;
      }
      if (titleEl) titleEl.textContent = activeScenario.title;
      loadManifest().then(function () {
        playScenario(activeScenario);
      });
    }

    if (customQuery != null) {
      if (titleEl) titleEl.textContent = "Your brief — calling live ArchE…";
      setTimeline("Custom brief → POST /api/portfolio/brief (Cursor SDK or Ollama)…");
      fetchLiveBrief(customQuery).then(function (live) {
        if (live && live.ok && live.beats) {
          live.query = customQuery;
          lastLiveBriefPayload = live;
          setLiveEvidenceContext(live.evidence_pack, customQuery);
          updateGrowthStrategy(live);
          updateConversationFromScenario(live, customQuery);
          setTimeline(
            "Live ArchE brief — engine: " +
              (live.engine || "live") +
              (live.evidence_pack ? " · pack: " + live.evidence_pack.pack_id : "") +
              (live.error ? " (" + live.error + ")" : "")
          );
          runWithScenario(live);
        } else {
          setTimeline("Live ArchE required — " + (live && live.error ? live.error : "unavailable"));
          runWithScenario(buildLiveArchEUnavailableScenario(customQuery, live || { error: "unknown" }));
        }
      });
      return;
    }

    activeScenario =
      key === "a"
        ? buildScenarioA(getLiveContext())
        : key === "b"
          ? buildScenarioB(getLiveContext())
          : key === "d"
            ? buildScenarioD()
            : key === "e"
              ? buildScenarioE()
              : JSON.parse(JSON.stringify(SCENARIOS[key]));
    runWithScenario(activeScenario);
  }

  /**
   * Apply one buyer-safe Adaptive Proof Surface from the deterministic manifest.
   * The URL carries an opaque view slug; private prospect records never enter the
   * public bundle. The visitor may edit the seeded Resonant View query.
   */
  function loadAdaptiveProofSurface() {
    if (typeof URLSearchParams === "undefined") return Promise.resolve(null);
    var params = new URLSearchParams(window.location.search || "");
    var viewSlug = (params.get("view") || "").trim();
    var explicitQuery = sanitizeQuery(params.get("query") || "");
    if (!viewSlug && !explicitQuery) return Promise.resolve(null);

    return fetch("adaptive_views.json", {
      method: "GET",
      cache: "no-store",
      headers: portfolioFetchHeaders(),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("adaptive_views.json HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        var view = viewSlug && manifest && manifest.views ? manifest.views[viewSlug] : null;
        var seed = explicitQuery || sanitizeQuery((view && view.seeded_query) || "");
        if (view) {
          document.title = view.headline + " — Resonant View";
          var banner = document.createElement("section");
          banner.id = "adaptive-proof-surface";
          banner.style.cssText =
            "margin:0 0 1rem;padding:1rem 1.1rem;border:1px solid rgba(34,211,238,.55);" +
            "border-radius:12px;background:linear-gradient(110deg,rgba(34,211,238,.11),rgba(139,92,246,.13))";
          var proofLinks = (view.proofs || [])
            .map(function (proof) {
              var safePath = String(proof.path || "").replace(/^income_liberation\/portfolio\//, "");
              return '<li><a style="color:#67e8f9" href="' + encodeURI(safePath) + '">' +
                String(proof.label || "Evidence") + "</a>" +
                (proof.limitation ? " — " + String(proof.limitation) : "") + "</li>";
            })
            .join("");
          banner.innerHTML =
            '<div style="font-size:.72rem;color:#67e8f9;text-transform:uppercase;letter-spacing:.08em">Adaptive proof surface</div>' +
            '<h1 style="margin:.25rem 0;color:#c4b5fd">' + String(view.headline || "") + "</h1>" +
            '<p style="color:#e4e4e7">' + String(view.pain_statement || "") + "</p>" +
            '<p><strong style="color:#fde68a">' + String(view.offer_title || "") + "</strong> · " +
            String(view.cta || "") + "</p>" +
            (proofLinks ? '<ul style="font-size:.78rem">' + proofLinks + "</ul>" : "") +
            '<p style="font-size:.72rem">' + String(view.disclosure || "") + "</p>";
          document.body.insertBefore(banner, document.body.firstChild);
        }
        if (seed) {
          setUnlocked(true);
          var input = $("#custom-query");
          if (input) {
            input.value = seed;
            input.setAttribute("data-adaptive-seed", "1");
          }
        }
        return view;
      })
      .catch(function (error) {
        console.warn("Adaptive proof surface unavailable:", error);
        return null;
      });
  }

  function init() {
    renderToolRack();
    if (sessionStorage.getItem("resonant_portfolio_unlock") === "1") setUnlocked(true);
    loadAdaptiveProofSurface();

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
        activeBuyerBusinessName = getBuyerBusinessName();
        if (!q) {
          alert("Type your question in the large box below the business name field, then Run preview.");
          var ta = $("#custom-query");
          if (ta) ta.focus();
          return;
        }
        if (q) startScenario(null, q);
      });

    var sbs = $("#side-by-side-toggle");
    if (sbs) {
      sbs.addEventListener("change", function () {
        updateSideBySide(lastLiveBriefPayload || activeScenario || null);
      });
    }

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
    $("#proof-popup-close") &&
      $("#proof-popup-close").addEventListener("click", function () {
        hideProofPopup();
      });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var proof = $("#proof-popup");
        if (proof && proof.classList.contains("visible")) {
          hideProofPopup();
          return;
        }
        var modal = $("#demo-modal");
        if (modal && modal.classList.contains("open")) closeModal();
      }
    });

    voiceStatusEl = $("#voice-status");
    initSpeechUi();
    loadLiveApiConfig().then(function () {
      refreshLiveApiHealthStatus();
    });
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
