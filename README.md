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

## Live custom brief (any question — not keyword scripts only)

GitHub Pages cannot call Cursor or Ollama from the browser. Run the **live portfolio server** on your machine or VPS:

```bash
cd /path/to/ResonantiA-v3 && source arche_env/bin/activate
# Optional — Cursor agent REST (see income_liberation/cursor_sdk_bridge.py)
export PORTFOLIO_CURSOR_SDK=1
export CURSOR_API_KEY=your_key
# Fallback — local Ollama (default)
export PORTFOLIO_LLM_PROVIDER=ollama
python3 scripts/serve_portfolio_live.py
```

Open **http://127.0.0.1:17890/** → unlock → paste any question → **Run preview**.

**Start on reboot (portfolio + ngrok):**

```bash
./scripts/install_portfolio_live_systemd_user.sh
loginctl enable-linger "$USER"
```

Public URL lands in `memory/portfolio_tunnel_latest.json` and `.env.local` (`ARCHE_PORTFOLIO_INTERACTIVE_URL`). Requires `ngrok config add-authtoken …` once.

For static Pages + remote API, set in the browser console:

```javascript
localStorage.setItem('PORTFOLIO_LIVE_API', 'https://YOUR_TUNNEL_OR_VPS:17890/api/portfolio/brief');
```

Then reload GitHub Pages and run custom preview.

## What to Say on Profiles

- “Built a 350+ module cognitive AI system (research, causal inference, ABM, knowledge graph, 7M+ operational entries). Sanitized portfolio available on request.”
- If you host `index.html`: “Portfolio: [your URL]”

## Do Not Include

- Paths like `/home/...` or repo layout
- API keys, env vars, or credentials
- Client names or project names beyond “ResonantiA”
- Internal protocol or security details
