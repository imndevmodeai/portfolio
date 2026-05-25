# Case study 02 — Production webhook agent (Telegram → SMS-equivalent)

## Proof (public)

This case study describes a **live** webhook-driven agent stack operated on private infrastructure. The **public** proof is:

1. **Interactive demo** — scenario routing and trace theater at https://imndevmodeai.github.io/portfolio/
2. **Architecture** — same adapter pattern documented here for Twilio SMS cutover

## Why this matters for Twilio SMS

| Step | Telegram today | Your SMS MVP |
|------|----------------|--------------|
| Inbound | Bot webhook HTTP POST | Twilio `MessagingRequest` webhook |
| User key | Chat ID | E.164 phone (hashed in logs) |
| Memory | Thread store per user | Same — per phone |
| Brain | RAG + OpenAI + vetting | Identical |
| Outbound | Bot API send | Twilio REST reply |
| Compliance | Session + routing log | STOP keyword + admin log |

**Twilio is a transport swap**, not a greenfield architecture.

## Operational characteristics (sanitized)

- 24/7 gateway process with health checks and env-based config
- Quarterback routing (triage vs full agent vs handoff)
- Contract gate on agent replies before user sees text
- JSONL play log for audit (scrubbed identifiers in portfolio demo)

## Client takeaway

*"We already run a webhook agent in production; your Vault SMS coach is adapter + content ingest + Twilio credentials — not a science project."*

**Demo:** https://imndevmodeai.github.io/portfolio/ — scenario **E** shows the SMS-equivalent trace lines.
