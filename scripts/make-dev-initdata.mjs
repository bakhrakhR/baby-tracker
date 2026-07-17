// ============================================================================
// Writes web/.env.local with a signed VITE_DEV_INIT_DATA so the Svelte app can
// authenticate against the live auth-telegram function while running in a plain
// browser (outside Telegram) during development.
//
// Your bot token stays on your machine (passed via env, never written to disk).
//
// Usage (run in YOUR terminal, with the CURRENT bot token):
//   TELEGRAM_BOT_TOKEN=<new bot token> TG_ID=349513510 \
//     node scripts/make-dev-initdata.mjs
//
// Then restart the dev server (npm run dev) and reload the page.
// The file is git-ignored and the initData expires after ~24h.
// ============================================================================

import { createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const BOT = process.env.TELEGRAM_BOT_TOKEN
const TG_ID = process.env.TG_ID
if (!BOT || !TG_ID) {
  console.error(
    'Set TELEGRAM_BOT_TOKEN and TG_ID. Example:\n' +
      '  TELEGRAM_BOT_TOKEN=123:aa TG_ID=349513510 node scripts/make-dev-initdata.mjs',
  )
  process.exit(1)
}

const fields = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: Number(TG_ID), first_name: 'DevUser' }),
}
const dcs = Object.keys(fields)
  .sort()
  .map((k) => `${k}=${fields[k]}`)
  .join('\n')
const secretKey = createHmac('sha256', 'WebAppData').update(BOT).digest()
const params = new URLSearchParams(fields)
params.set('hash', createHmac('sha256', secretKey).update(dcs).digest('hex'))

const outUrl = new URL('../web/.env.local', import.meta.url)
writeFileSync(outUrl, `VITE_DEV_INIT_DATA=${params.toString()}\n`)
console.log('Wrote web/.env.local — restart `npm run dev` and reload the page.')
