# Similar Projects to ArchE — Landing Pages & Demos (Research)

**Purpose:** Reference for how other AI agent / orchestration / cognitive frameworks present themselves and what demos they offer. Use this to refine the portfolio and demo strategy.

---

## 1. LangChain

- **URL:** https://www.langchain.com  
- **Tagline:** *"Observe, Evaluate, and Deploy Reliable AI Agents"*
- **Positioning:** Engineering platform + open source frameworks for building, testing, and deploying AI agents.
- **Landing:**
  - Hero with value prop (observe / evaluate / deploy).
  - Heavy use of Webflow, animations, and “product” feel (not just docs).
  - Meta: retrieval video, framework logos, enterprise tone.
- **Demos / try-it:**
  - **LangSmith** (smith.langchain.com): Full app for tracing, evaluating, and debugging agent runs — login required; not a public “click to try” demo.
  - Docs and code examples drive “try it yourself” (pip install, notebooks).
- **Takeaway:** Strong “platform” narrative; demos are behind signup or local run, not inline on the marketing page. Our curated A/B/C chat demos on the portfolio are more immediately “tryable” than LangChain’s marketing site.

---

## 2. CrewAI

- **URL:** https://www.crewai.com  
- **Tagline:** *"The Leading Multi-Agent Platform"*
- **Positioning:** Multi-agent collaboration (crews of agents), enterprise.
- **Landing:**
  - Clean product site; “Request a demo” and “Meet with us” CTAs open popups with Calendly.
  - Form: business email, first name, last name, company, job title, LinkedIn, phone, message.
  - Success → Calendly booking for “CrewAI introduction.”
- **Demos:**
  - No public playground or inline demo on the homepage.
  - Demo is gated: fill form → schedule call → “we’ll show you.”
- **Takeaway:** Enterprise lead-gen first; no self-serve “pick A/B/C and see a conversation.” Our portfolio’s interactive A/B/C scenarios are a differentiator for instant engagement without a form.

---

## 3. AutoGen (Microsoft)

- **URL:** https://microsoft.github.io/autogen/ (redirects to `/autogen/stable/`)
- **Tagline:** *"A framework for building AI agents and applications"*
- **Landing (docs):**
  - Docs-first: “AutoGen” hero, version switcher (AgentChat, Core, Extensions, **Studio**, API Reference, .NET).
  - **Studio:** “A web-based UI for prototyping with agents without writing code. Built on AgentChat.”
  - Install: `pip install -U autogenstudio` then `autogenstudio ui` (local UI).
- **Demos:**
  - Studio is a local/self-hosted UI, not a public “try in browser” link on the main page.
  - Public hosted Studio (e.g. autogenstudio.azurewebsites.net) may exist but was not verified here.
- **Takeaway:** Open-source, dev-centric; “run it locally” is the demo. A single-page portfolio with embedded narrated demos (like ours) gives a zero-install taste.

---

## 4. LangSmith (LangChain)

- **URL:** https://smith.langchain.com  
- **Product:** Observability and evaluation for LangChain apps (traces, datasets, feedback).
- **Landing:** SPA (Vite); login/signup required; no anonymous “playground” on the homepage.
- **Takeaway:** B2B tool; demo is the product itself after auth. Not a direct comparison for “show a conversation” demos.

---

## 5. Anthropic (Claude)

- **URL:** https://www.anthropic.com/product  
- **Tagline:** *"The AI for Problem Solvers"* (Claude by Anthropic)
- **Landing:** Brand/product page; try Claude via API or chat product, not an “agent framework” demo on the page.
- **Takeaway:** Model/product company; different category. Reinforces that “framework” projects (LangChain, CrewAI, AutoGen) rarely put a full interactive chat demo on the marketing page.

---

## Summary: Gaps Our Portfolio Fills

| Project    | Public landing demo?        | How they “demo”                    |
|-----------|----------------------------|------------------------------------|
| LangChain | No                         | LangSmith (login), code/docs       |
| CrewAI    | No                         | Request demo → Calendly            |
| AutoGen   | No (docs only)             | Run Studio locally                 |
| LangSmith | No                         | Use product after signup           |
| Anthropic | N/A (model, not framework) | Use Claude elsewhere               |

**ArchE portfolio (current):**
- **Yes:** Three scenario choices (A, B, C) with narrated, curated chat (problem → execution → result).
- **Yes:** “Play” to step through messages; no signup, no install.
- **Differentiator:** Instant, zero-friction “try a cognitive workflow” on the landing page.

---

## Recommendations for the Portfolio

1. **Keep the A/B/C interactive demos** — they’re closer to “live interactive demo” than what most similar projects offer on their main landing page.
2. **Optional:** Add a one-liner above the demo cards: e.g. *“See how it works in under a minute — no signup, no install.”* to contrast with “request a demo” and “run locally.”
3. **Optional:** Add a short “How we compare” or “Why this is different” line (e.g. “Curated real-world scenarios you can step through here, not just docs or a sales call”).
4. **If you add a fourth scenario:** Consider one that’s visibly “multi-step” (e.g. research → vetting → report) to mirror LangChain’s “observe / evaluate / deploy” narrative in a single flow.

---

*Research date: Feb 2026. URLs and copy may change.*
