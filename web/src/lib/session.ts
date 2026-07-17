// ============================================================================
// Session: exchanges Telegram initData for a Supabase JWT (via auth-telegram)
// and exposes an authenticated supabase-js client + a reactive session store.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writable } from 'svelte/store'
import { getInitData } from './telegram'
import type { AuthResponse, Member } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const AUTH_FUNCTION_URL = import.meta.env.VITE_AUTH_FUNCTION_URL as string

export type SessionStatus =
  | 'loading'
  | 'authed'
  | 'forbidden' // valid Telegram user, but not on the whitelist
  | 'no_telegram' // opened outside Telegram / no initData
  | 'error'

export interface SessionState {
  status: SessionStatus
  member: Member | null
  error: string | null
}

export const session = writable<SessionState>({
  status: 'loading',
  member: null,
  error: null,
})

let client: SupabaseClient | null = null

// The authenticated client. Throws if called before a successful login.
export function getSupabase(): SupabaseClient {
  if (!client) throw new Error('Supabase client is not ready (not authenticated)')
  return client
}

function buildClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

// Exchange initData for a JWT and build the client. Idempotent enough to be
// called again for re-auth (e.g. after token expiry).
export async function initSession(): Promise<void> {
  // Dev preview: skip real auth so the UI can be exercised outside Telegram.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === '1') {
    session.set({
      status: 'authed',
      member: { telegram_id: 0, display_name: 'Мама', role: 'admin' },
      error: null,
    })
    return
  }

  const initData = getInitData()
  if (!initData) {
    session.set({ status: 'no_telegram', member: null, error: null })
    return
  }

  session.update((s) => ({ ...s, status: 'loading', error: null }))

  let res: Response
  try {
    res = await fetch(AUTH_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
  } catch {
    session.set({ status: 'error', member: null, error: 'network' })
    return
  }

  if (res.status === 403) {
    session.set({ status: 'forbidden', member: null, error: null })
    return
  }
  if (!res.ok) {
    session.set({ status: 'error', member: null, error: `http_${res.status}` })
    return
  }

  const data = (await res.json()) as AuthResponse
  client = buildClient(data.token)
  session.set({ status: 'authed', member: data.member, error: null })
}
