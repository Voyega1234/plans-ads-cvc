# Plans – AI Ads Automation

Google Ads campaign automation platform powered by AI, built with Next.js 14, Prisma, and SQLite.

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npm run db:push
npm run db:seed

# Start dev server (port 3005)
npm run dev
```

Open [http://localhost:3005](http://localhost:3005)

## Features

- **Brief Form** — 4-step form to capture business, campaign, audience, and schedule info
- **AI Media Planner** — generates campaign mix (Search, Brand, PMax, Display) with forecasts
- **Keyword & Audience Planner** — Thai keyword research, audience segments, negative keywords
- **Campaign Builder** — complete blueprint with ad copy, sitelinks, callouts, conversion actions
- **QA Review** — automated checks with score (0-100) before push
- **Push to Google Ads** — one-click push via Google Ads API (mock mode by default)
- **Automation Center** — rules and alerts
- **Reports** — campaign performance dashboard

## Stack

- Next.js 14, TypeScript, Tailwind CSS
- Prisma + SQLite (dev)
- Mock AI (swap in OpenAI by setting OPENAI_API_KEY)
- Mock Google Ads API (swap in real by setting MOCK_GOOGLE_ADS=false)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (default: `file:./dev.db`) |
| `NEXTAUTH_SECRET` | Auth secret |
| `OPENAI_API_KEY` | OpenAI key (leave blank for mock AI) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API token |
| `MOCK_GOOGLE_ADS` | `true` to use mock data |
| `MOCK_AI` | `true` to use mock AI responses |

## Flow

```
/brief/new → POST /api/briefs → POST /api/media-plans/generate
  → /media-plans/[id]
  → /keyword-planner/[planId] → POST /api/keyword-audience/generate
  → /campaign-builder/[planId] → POST /api/campaign-blueprints/generate
  → /review/[planId] → POST /api/qa/run
  → /push-log/[planId] → POST /api/google-ads/push
```
