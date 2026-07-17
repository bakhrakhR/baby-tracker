// ============================================================================
// Session: exchanges Telegram initData for a Supabase JWT (via auth-telegram)
// and exposes an authenticated supabase-js client + a reactive session store.
//
// The JWT lives ~1h. Rather than tracking its expiry, the client uses a custom
// fetch that re-authenticates transparently on a 401 and retries once —
// Telegram always hands us a fresh initData, so this needs no refresh token.
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
let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null

// The authenticated client. Throws if called before a successful login.
export function getSupabase(): SupabaseClient {
  if (!client) throw new Error('Supabase client is not ready (not authenticated)')
  return client
}

// Ask auth-telegram for a fresh token. Throws a stable error code.
async function requestToken(): Promise<AuthResponse> {
  const initData = getInitData()
  if (!initData) throw new Error('no_telegram')

  let res: Response
  try {
    res = await fetch(AUTH_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
  } catch {
    throw new Error('network')
  }

  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`http_${res.status}`)
  return (await res.json()) as AuthResponse
}

// Re-authenticate, deduped so concurrent 401s trigger only one round-trip.
function refreshToken(): Promise<boolean> {
  refreshing ??= requestToken()
    .then((d) => {
      accessToken = d.token
      session.update((s) => ({ ...s, member: d.member }))
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// fetch wrapper: injects the current token, and on 401 re-auths once and retries.
const authFetch: typeof fetch = async (input, init) => {
  const call = () => {
    const headers = new Headers(init?.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(input, { ...init, headers })
  }

  const res = await call()
  if (res.status !== 401) return res
  return (await refreshToken()) ? call() : res
}

function buildClient(): SupabaseClient {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: authFetch },
  })
}

export async function initSession(): Promise<void> {
  // Dev preview: skip real auth so the UI can be exercised outside Telegram.
  // ?role=guest|editor switches the mocked role to preview those views.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === '1') {
    const param = new URLSearchParams(location.search).get('role')
    const role = param === 'guest' || param === 'editor' ? param : 'admin'
    session.set({
      status: 'authed',
      // id 100 matches the mock members list, so self-guards are previewable
      member: { telegram_id: 100, display_name: 'Мама', role },
      error: null,
    })
    return
  }

  session.update((s) => ({ ...s, status: 'loading', error: null }))
  try {
    const data = await requestToken()
    accessToken = data.token
    client ??= buildClient()
    session.set({ status: 'authed', member: data.member, error: null })
  } catch (e) {
    const code = (e as Error).message
    if (code === 'no_telegram') {
      session.set({ status: 'no_telegram', member: null, error: null })
    } else if (code === 'forbidden') {
      session.set({ status: 'forbidden', member: null, error: null })
    } else {
      session.set({ status: 'error', member: null, error: code })
    }
  }
}
