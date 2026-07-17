// Shared app types. Data-model types mirror the DB schema (supabase/migrations).

export type AppRole = 'admin' | 'editor' | 'guest'

export type Tab = 'home' | 'feed' | 'visit' | 'files' | 'memory'

export interface Member {
  telegram_id: number
  display_name: string
  role: AppRole
}

// Response from the auth-telegram Edge Function.
export interface AuthResponse {
  token: string
  expires_in: number
  member: Member
}

// --- feedings ---------------------------------------------------------------
export type FeedingMethod = 'breast' | 'bottle'
export type BreastSide = 'left' | 'right' | 'both'
export type MilkType = 'breast_milk' | 'formula'

// --- diapers ----------------------------------------------------------------
export type DiaperKind = 'wet' | 'dirty' | 'mixed'

export interface Feeding {
  id: string
  child_id: string
  fed_at: string
  method: FeedingMethod
  breast_side: BreastSide | null
  duration_min: number | null
  amount_ml: number | null
  milk_type: MilkType | null
  notes: string | null
  created_by: number | null
  created_at: string
}
