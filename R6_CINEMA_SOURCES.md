# R6 cinematic demo — cited claims only

Use these footnotes in the demo UI and proposal. **Do not** state industry percentages without a source line.

## Field-level error rates (manual data entry)

| Claim | Range | Source |
|-------|--------|--------|
| Skilled manual entry | ~**1%** per field | Barchard & Pace (2011), *Behavior Research Methods* — via industry synthesis [Parsli 2026](https://parsli.co/blog/human-error-statistics) |
| Average manual entry | **3–4%** per field | Same; Goldberg et al. (2008) *JAMIA* — [Oxford Academic](https://academic.oup.com/jamia/article/26/3/269/5287977) cited in ConnectPointz / vendor summaries |
| Double-key entry | **0.3–0.5%** per field | Goldberg et al. (2008) — at ~2× labor |

**Implication for this buyer (15+ fields/deal):** At 3% per field, P(at least one error) ≈ 1 − (0.97)^15 ≈ **36%** per deal (independent-field approximation — illustrative).

## Demo-only metrics (not industry benchmarks)

| UI label | Meaning |
|----------|---------|
| **94% confidence** | Fictional model score on sanitized Brightline HVAC message in this demo |
| **Week 1 SLA** | Contract-defined target in proposal — measure on go-live, not pre-claimed |

## UI design references (simulation fidelity)

| Product | Reference |
|---------|-----------|
| **Gmail** | Material 3 Expressive — message list in rounded container, search app bar, filled compose icon [9to5Google Aug 2025](https://9to5google.com/2025/08/26/gmail-material-3-expressive-redesign/) |
| **Gmail search** | “Most relevant” vs recent — [Google Blog Mar 2025](https://blog.google/products-and-platforms/products/gmail/gmail-search-update-relevant-emails/) |
| **Close.io lead page** | Left: Tasks, Opportunities, Contacts, Custom fields; right: activity history [Close Help — Leads](https://help.close.com/docs/leads) |
| **Zoho CRM** | 2025 UI refresh — modular layout, Leads module [Zoho 2025 summaries](https://www.zoho.com/crm/) |
| **Slack** | Workspace sidebar + channel feed (standard layout) |

## Roles in buyer workflow (from job post RFP)

| Role | Before | After ArchE Week 1 |
|------|--------|-------------------|
| **Ops / data entry** | Reads email + PDFs, types 15+ fields into GHL/Zoho → Close | **Automated extract + API write**; human only on low-confidence queue |
| **CRM admin** | Rename lead, upload docs, start sequence manually | **Automated** with audit log |
| **Sales AE** | Waits for Slack “ready” | Unchanged — still books call |
| **Underwriter / credit** | Judgment on deal | **Unchanged** — not replaced |
