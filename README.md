# Allio Kampagne Generator

Internt værktøj til Allios managers til at generere SMS-genaktiveringskampagner for klinik- og salonkunder. Manageren udfylder data fra et intro-møde, og systemet genererer automatisk et komplet leveringsudkast med SMS-beskeder, prisestimater og kampagneanalyse.

**Live:** [allio-kampagne-generator.vercel.app](https://allio-kampagne-generator.vercel.app)

## Flow — 3 steps

1. **Kundeinput** — kundenavn, kliniknavn, 1–4 kampagner (ydelse, antal sovende kunder, priser, noter)
2. **SMS-udkast** — Claude genererer 2 SMS per kampagne (genaktivering + booster). Manager kan redigere direkte.
3. **Levering** — komplet dokument med analyse, tal, SMS-tekster, kopiér-alt og download som Word

## Tech stack

- React + Vite (frontend)
- Vercel serverless functions (`/api/generate`, `/api/docx`)
- Anthropic Claude API (`claude-sonnet-5`)

## Miljøvariabler

I Vercel Dashboard → Settings → Environment Variables:

| Variabel | Beskrivelse |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API-nøgle (kun server-side) |

## Lokal udvikling

`npm run dev` kører kun frontend — API-routes virker **ikke** uden Vercel CLI.

```bash
npm install
npx vercel login
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

Appen kører på http://localhost:3000 med både frontend og API.

## Deploy

Push til GitHub — Vercel deployer automatisk. Sørg for at `ANTHROPIC_API_KEY` er sat i Production.

## Funktioner

- **1–4 kampagner** per levering (standard: 2)
- **Auto-gemt kladde** i localStorage (gendannes ved refresh, slettes efter 7 dage)
- **Download Word** (.docx) fra step 3
- **Prisberegning** i JS: SMS-segmenter × 0,40 kr, bookinger 3,5–5,5 %

## Scripts

| Kommando | Beskrivelse |
|----------|-------------|
| `npm run dev` | Vite dev server (kun frontend) |
| `npm run dev:full` | Vercel dev (frontend + API) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
