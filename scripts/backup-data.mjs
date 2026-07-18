// ============================================================================
// Full data backup via the Supabase APIs — no Docker/pg_dump required.
//
// Dumps every table to JSON and downloads every storage object, into
// backups/<timestamp>/ (git-ignored: family data, public repo).
// The same JSON is the source for a future region-migration restore.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SERVICE_KEY=<service role key> \
//     node scripts/backup-data.mjs
// ============================================================================

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const URL_BASE = process.env.SUPABASE_URL
const KEY = process.env.SERVICE_KEY
if (!URL_BASE || !KEY) {
  console.error('Set SUPABASE_URL and SERVICE_KEY env vars.')
  process.exit(1)
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const TABLES = [
  'members',
  'children',
  'wellbeing_posts',
  'feedings',
  'diapers',
  'sleep_sessions',
  'measurements',
  'doctor_visits',
  'lab_results',
  'documents',
  'memories',
  'reminders',
  'feeding_reminder_settings',
]
const BUCKETS = ['files', 'media']

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const outDir = join('backups', stamp)
mkdirSync(outDir, { recursive: true })

// --- tables -----------------------------------------------------------------
const dump = {}
for (const table of TABLES) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=10000`, {
    headers: HEADERS,
  })
  if (!res.ok) {
    console.error(`✗ ${table}: HTTP ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  dump[table] = await res.json()
  console.log(`✓ ${table}: ${dump[table].length} rows`)
}
writeFileSync(join(outDir, 'tables.json'), JSON.stringify(dump, null, 1))

// --- storage ----------------------------------------------------------------
async function listAll(bucket, prefix = '') {
  const res = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000 }),
  })
  if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`)
  const entries = await res.json()
  const files = []
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    // folders come back without an id
    if (e.id) files.push(path)
    else files.push(...(await listAll(bucket, path)))
  }
  return files
}

let totalFiles = 0
for (const bucket of BUCKETS) {
  const files = await listAll(bucket)
  for (const path of files) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
      headers: HEADERS,
    })
    if (!res.ok) {
      console.error(`✗ ${bucket}/${path}: HTTP ${res.status}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const dest = join(outDir, 'storage', bucket, path)
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, buf)
    totalFiles += 1
    console.log(`✓ ${bucket}/${path} (${(buf.length / 1024).toFixed(0)} KB)`)
  }
}

console.log(`\nDone → ${outDir}`)
console.log(`Tables: ${TABLES.length}, storage files: ${totalFiles}`)
