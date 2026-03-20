# Daily Briefing

A clean, minimal daily dashboard built with Next.js 15 (App Router, TypeScript, Tailwind, React Compiler).

## Setup

1. Clone and install:
```bash
npm install
```

2. Create a Finnhub API key (free):
   - Sign up at https://finnhub.io/register
   - Get your API key from the dashboard

3. Set environment variable:
```bash
cp .env.local.example .env.local
# Edit .env.local and add: NEXT_PUBLIC_FINNHUB_API_KEY=your_key_here
```

4. Run development server:
```bash
npm run dev
```

5. Build and deploy to Vercel:
```bash
vercel --prod
```

## Features

- Weather for Charlotte, NC (Open-Meteo)
- Markets: GLDM, SLVR, SILJ, CAPR, SPY, QQQ, BTC, TRX, SOL
- Auto-refresh at 6am and 12pm local time
- Manual refresh button
- Light mode, Apple-inspired design
