# Sanitized Portfolio — ResonantiA Architecture

Use this folder as your **proof of capability** on Upwork, Toptal, and Fiverr Pro. It contains no secrets, no internal paths, and no client data.

## Files

| File | Use |
|------|-----|
| `PORTFOLIO.md` | Copy-paste or link for “portfolio” / “past work” on platforms. Good for “share a doc” requests. |
| `index.html` | Portfolio page + interactive demo. Host on VPS or GitHub Pages. |
| `assets/*.svg` | Architecture diagram + scrubbed chart mocks (required for images on the page and `og:image` link preview). |
| `demo-engine.js` | Client-side demo theater (must ship alongside `index.html`). |
| `audio/` | Pre-rendered Edge TTS clips for the demo voice rack. |

## Hosting the HTML Page

- **GitHub Pages:** Create a repo (e.g. `yourusername/portfolio`), add `index.html` as the only file in root, enable Pages in repo Settings → Pages → source: main branch, / (root). URL will be `https://yourusername.github.io/portfolio/`.
- **VPS:** After Phase 2 VPS + Cloudflare Tunnel setup, copy `index.html` to your web root (e.g. `resonantia.ai`) or a subpath (e.g. `resonantia.ai/portfolio/`).

## What to Say on Profiles

- “Built a 350+ module cognitive AI system (research, causal inference, ABM, knowledge graph, 7M+ operational entries). Sanitized portfolio available on request.”
- If you host `index.html`: “Portfolio: [your URL]”

## Do Not Include

- Paths like `/home/...` or repo layout
- API keys, env vars, or credentials
- Client names or project names beyond “ResonantiA”
- Internal protocol or security details
