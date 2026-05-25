# Case study 03 — Knowledge-base RAG assistant (not generic LLM)

## Problem

Clients need answers **from their** playbooks, SOPs, and Vault material — with refusal when context is missing.

## Approach (sanitized)

| Layer | What it does |
|-------|----------------|
| Ingest | Vault / playbook → chunk + index (embed or compressed stage index) |
| Retrieve | Top-k chunks **before** every generation |
| Generate | OpenAI with strict context window — no “naked” career advice |
| Veto | Vetting flags generic fluff, low grounding, policy violations |
| Demo | Portfolio scenario **C** (doc → queryable) and **E** (SMS coach + RAG) |

## RAG flow

1. User message arrives (SMS or chat).
2. Classify intent (resume bullet, JD decode, LinkedIn, referral, interview, accountability).
3. Retrieve only from Vault chunks for that intent.
4. Compose reply; log confidence + issues.
5. Send on channel; append to admin log.

## Metrics we report in MVP

- Retrieval hit rate on sample Vault Q&A set
- % replies blocked by vetting (generic advice)
- p95 webhook latency (SMS target under 8 seconds)

## Public proof

- **Live:** https://imndevmodeai.github.io/portfolio/ — scenarios **C** and **E**
- **Write-up:** this file in public repo `imndevmodeai/portfolio`
