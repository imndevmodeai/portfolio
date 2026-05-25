# Case study 01 — SMS job search coach MVP (Vault RAG)

**Client fit:** The Job Seeker's Vault — Twilio SMS + OpenAI + RAG, paid users only, admin logging.

## Problem

Job seekers need **actionable** coaching (resume bullets, JD decode, LinkedIn copy, outreach, interview practice, daily accountability) via **SMS**, grounded in the client's **Vault** content — not generic career advice from a raw LLM.

## Architecture

```mermaid
flowchart LR
  SMS[Twilio inbound webhook] --> GW[Channel adapter]
  GW --> MEM[Per-phone thread memory]
  MEM --> RAG[Vault chunk retrieval]
  RAG --> LLM[OpenAI intent + compose]
  LLM --> VET[Vetting / grounded check]
  VET --> OUT[Twilio outbound]
  ADMIN[Admin log + opt-out STOP] --> GW
```

## MVP delivery (2–3 weeks)

| Week | Deliverable |
|------|-------------|
| 1 | Twilio webhook + Systeme paid-user verification + Vault ingest (chunk + index) |
| 2 | Intent router + RAG prompts + STOP/admin log |
| 3 | Load test, runbook, number cutover support |

## Trace lines (what production looks like)

```
WEBHOOK   inbound sms from=+1*** 
MEMORY    thread_id=phone_hash  turns=7
RAG       retrieve top_k=4 vault_chunks=11
OPENAI    intent=rewrite_resume_bullet
VETTING   grounded=yes  generic_advice=blocked
OUTBOUND  twilio_reply segments=1
```

## Public proof (no private repo required)

| Proof | URL |
|-------|-----|
| Interactive demo scenario **E** | https://imndevmodeai.github.io/portfolio/ |
| Work samples hub | https://imndevmodeai.github.io/portfolio/work-samples.html |
| This case study (public GitHub) | https://github.com/imndevmodeai/portfolio/blob/main/case-studies/01-sms-rag-job-coach-mvp.md |

## Why not "just ChatGPT"

Vault-grounded chunks + vetting block generic fluff; per-phone memory keeps multi-day threads coherent; channel adapter isolates Twilio from model logic (testable, swappable).
