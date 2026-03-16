# Break Compliance — Clockify Sidebar Add-on

Checks whether employees took legally required breaks based on their tracked Clockify time entries. Clockify has native `type: "BREAK"` entries — breaks are explicit, not inferred from gaps.

Three jurisdiction modes at launch:
- **German ArbZG §4** — 30/45 min thresholds, 15 min minimum segment, 6h max continuous work
- **California labor law** — meal breaks (30 min at 5h/10h), rest breaks (10 min per 4h)
- **Custom** — configurable work/break thresholds

Admin-only sidebar. Results shown as a weekly pivot table (users × days) and a per-user daily checklist.

## Architecture

```
Frontend (TypeScript, esbuild)     →  Clockify iframe sidebar
Cloudflare Worker (KV backend)     →  JWT auth, config persistence, static proxy
Clockify Detailed Report API       →  time entries with REGULAR/BREAK/HOLIDAY/TIME_OFF types
```

The Worker sits in front of everything — it proxies static assets from GitHub Pages, handles lifecycle webhooks, and stores workspace config in KV.

## Prerequisites

- Node.js 18+
- A [Cloudflare](https://dash.cloudflare.com/) account (free tier works)
- A [Clockify developer](https://developer.marketplace.cake.com/) account

## Setup

### 1. Clone and install

```bash
git clone https://github.com/apet97/CBREAK.git
cd CBREAK
npm install
cd worker && npm install && cd ..
```

### 2. Create the KV namespace

```bash
cd worker
npx wrangler kv namespace create SETTINGS_KV
```

Copy the output `id` value.

### 3. Configure the Worker

Edit `worker/wrangler.toml`:

```toml
account_id = "<your-cloudflare-account-id>"

[vars]
GITHUB_PAGES_ORIGIN = "https://<your-username>.github.io/CBREAK"

[[kv_namespaces]]
binding = "SETTINGS_KV"
id = "<the-kv-namespace-id-from-step-2>"
```

### 4. Deploy the Worker

```bash
cd worker
npx wrangler deploy
```

Note the Worker URL it prints (e.g. `https://breakcheck-worker.<you>.workers.dev`).

### 5. Deploy the frontend to GitHub Pages

```bash
# From the project root
npm run build:prod

# Push the dist/ folder to gh-pages branch
# Option A: manual
git checkout -b gh-pages
cp -r dist/* .
git add -A && git commit -m "Deploy frontend"
git push origin gh-pages

# Option B: use the GitHub Action in .github/workflows/ci.yml
```

Make sure `GITHUB_PAGES_ORIGIN` in `wrangler.toml` matches the actual Pages URL.

### 6. Update the manifest

Edit `manifest.json` and set `baseUrl` to your Worker URL:

```json
{
  "baseUrl": "https://breakcheck-worker.<you>.workers.dev"
}
```

Rebuild and redeploy both frontend and Worker after this change.

### 7. Install in Clockify

1. Go to [developer.marketplace.cake.com](https://developer.marketplace.cake.com/)
2. Create a new add-on
3. Enter your Worker URL as the manifest URL: `https://breakcheck-worker.<you>.workers.dev/manifest`
4. Install on a test workspace
5. Open the sidebar — "Break Compliance" appears under Add-ons

## Development

```bash
npm run build          # dev build (with sourcemaps)
npm run build:watch    # rebuild on file changes
npm test               # run unit tests (73 tests)
npm run typecheck      # TypeScript strict check
npm --prefix worker test  # worker tests
```

### Local testing with ngrok

```bash
# Terminal 1: serve the frontend
npx http-server dist -p 8080

# Terminal 2: expose via ngrok
ngrok http 8080

# Use the ngrok URL as baseUrl in manifest.json
# Install the add-on using the ngrok URL in the developer portal
```

For Worker development:

```bash
cd worker
npx wrangler dev
```

## Compliance Rules

### German ArbZG §4

| Work hours | Break required | Notes |
|-----------|---------------|-------|
| ≤ 6h | None | — |
| 6–9h | 30 min | Break segments must be ≥ 15 min |
| > 9h | 45 min | Can be split (e.g. 15 + 15 + 15) |

Max 6h continuous work without a qualifying break (≥ 15 min). Untracked gaps are **not** assumed to be breaks (fail-safe).

### California Labor Law

| Shift length | Meal breaks | Rest breaks |
|-------------|------------|------------|
| ≤ 5h | None | Per 4h rule |
| 5–10h | 1 × 30 min | — |
| > 10h | 2 × 30 min | — |

Rest breaks: 1 × 10 min paid rest per 4h worked (or major fraction > 2h after first full period). Missed breaks report a 1h penalty per type per day.

### Custom Mode

Define your own rules as pairs of `(minWorkMinutes, requiredBreakMinutes)`. Each rule is evaluated independently.

## Data Flow

```
Clockify Detailed Report API
  POST /v1/workspaces/{wid}/reports/detailed
  → paginated entries (pageSize 200)
  → entries have type: REGULAR | BREAK | HOLIDAY | TIME_OFF
  → groupByUserAndDay()
  → evaluateCompliance(jurisdiction, userDay)
  → render pivot table or checklist
```

The `reportsUrl` comes from JWT claims (separate host from `backendUrl`). The resolution logic handles developer portal, production, and regional environments.

## CI (GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build:prod

  worker-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd worker && npm ci && npm test
```

## Security

- All API calls use `X-Addon-Token` header, never `Authorization`
- API URLs validated against `*.clockify.me` (HTTPS only) to prevent SSRF
- HTML output escaped via `escapeHtml()` to prevent XSS
- Worker verifies RSA256 JWT signatures before trusting any claims
- Installation tokens stored server-side only, never exposed to frontend
- Three-tier lifecycle authentication (Clockify-Signature → authToken JWT → API fallback)
- CORS restricted to Clockify domains, `*.github.io`, and `*.workers.dev`

## License

MIT
