# Case study 04 — OpenAI automation with governance

## Problem

OpenAI automations fail in production without **confidence tracking**, **vetting**, and **audit trails** — especially paid coaching SMS where bad advice has reputational cost.

## What we enforce (every action)

| Field | Purpose |
|-------|---------|
| Status | success / partial / error |
| Confidence | 0.0–1.0 — triggers human review when low |
| Issues | Explicit flags (grounding, policy, hallucination) |
| Alignment | Fit to user goal and client brand |

## Gates in the stack

- **Vetting** before user-visible send on coaching copy
- **Workflow phase gates** — do not proceed on failed confidence
- **Audit JSONL** — each turn logged (scrubbed in public demo traces)
- **Human handoff** — login, billing, legal submit stay with the client

## SMS coach mapping

| Job requirement | Our pattern |
|-----------------|-------------|
| OpenAI for coaching | Intent router + schema-shaped outputs |
| No generic advice | RAG-only context + vetting block |
| Admin logging | Per-thread audit export |
| Paid users only | Webhook gate (Systeme.io in MVP scope) |

## Scale reference (sanitized)

- Large cognitive automation stack: hundreds of modules, dozens of workflow blueprints, millions of operational trace entries (aggregate counts only — no internal repo links).

## Public proof

- Portfolio theater shows `VETTING` and trace lines: https://imndevmodeai.github.io/portfolio/ scenario **E**
