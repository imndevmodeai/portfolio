# 05 — Multi-channel outreach orchestration (active sales spine)

> First-party architecture showcase. Local commerce details, buyer names, group URLs, and phone numbers are omitted. Named automation roles are AI functions under human Keyholder authority — not independent third parties.

## Buyer problem
Sales teams often run **passive** listings and hope buyers find them. Parallel outreach across groups, boards, and consulting rooms creates race conditions: shared browser tabs, accidental double-posts, and posts that go live without human brand approval.

## What ArchE demonstrates
1. **Channel isolation** — one dedicated browser tab per sales channel (`ArchE · Kirby · <channel>`), so parallel agents never share a Facebook session.
2. **Fill-before-Post** — automation can compose and screenshot a draft, but **cannot** click Post / Send / Publish until an explicit Keyholder authorization gate passes.
3. **Proof-before-claim** — a channel is only marked posted when a screenshot or post URL is logged.
4. **Honest status merge** — per-channel JSON logs roll up into a single status capsule (attempted / filled / authorized / posted / blocked).
5. **Consulting channel** — the same spine plants a demo + ask packet in buyer rooms (AI / ops automation), separate from product SKUs.

## Architecture (sanitized)

```
Keyholder (Judge)
    ↓ authorize Post
Orchestrator (merge logs + phase gates)
    ↓ parallel
Channel agents → dedicated CDP tabs → compose → Auth Gate → Post (if authorized) → proof log
```

## Why this matters for reputation-sensitive brands
Any public post is a **reputation event**. The Auth Gate keeps humans on the Publish button while agents handle research, room targeting, and draft quality — without silent automation shipping under your name.

## Related interactive demo
- Portfolio theater scenarios A–E show the same orchestration / vetting pattern used behind outreach agents.
- Adaptive proof view (business leaders / AI automation): `?view=business-leaders-using-ai-automation-b925aa51a6`

## Limitations
- This case study describes **governed process architecture**, not a guarantee of revenue per plant.
- External platforms (Facebook, Marketplace, Upwork) can still block or rate-limit sessions.
- Human review remains required for spend (Boost, Connects) and final Publish on new listings.
