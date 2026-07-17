// ============================================================================
// Thin wrapper around the Telegram WebApp SDK (loaded in index.html).
//
// Everything here degrades gracefully when the app runs outside Telegram
// (e.g. in a plain browser during development), so the UI never crashes on a
// missing window.Telegram.
// ============================================================================

// Minimal typing of the parts of the SDK we use.
interface ThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  section_bg_color?: string
  destructive_text_color?: string
}

interface HapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

interface BackButton {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}

export interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  themeParams: ThemeParams
  HapticFeedback?: HapticFeedback
  BackButton?: BackButton
  ready(): void
  expand(): void
  onEvent(event: string, cb: () => void): void
  setHeaderColor?(color: string): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp
}

// Map Telegram theme params onto CSS custom properties so the whole app
// re-themes automatically (light/dark) from a single source.
function applyTheme(wa: TelegramWebApp): void {
  const t = wa.themeParams
  const root = document.documentElement
  const set = (name: string, value?: string) => {
    if (value) root.style.setProperty(name, value)
  }
  set('--tg-bg', t.bg_color)
  set('--tg-text', t.text_color)
  set('--tg-hint', t.hint_color)
  set('--tg-link', t.link_color)
  set('--tg-button', t.button_color)
  set('--tg-button-text', t.button_text_color)
  set('--tg-secondary-bg', t.secondary_bg_color)
  set('--tg-section-bg', t.section_bg_color ?? t.bg_color)
  set('--tg-destructive', t.destructive_text_color)
  root.dataset.theme = wa.colorScheme
}

// Call once on startup.
export function initTelegram(): void {
  const wa = getWebApp()
  if (!wa) return
  wa.ready()
  wa.expand()
  applyTheme(wa)
  // Match the Telegram header to the app's warm background.
  wa.setHeaderColor?.('#FBF5EC')
  wa.onEvent('themeChanged', () => applyTheme(wa))
}

// The signed initData string to exchange for a JWT. In dev (outside Telegram)
// allow an override so the app can be exercised in a plain browser.
export function getInitData(): string {
  const wa = getWebApp()
  if (wa?.initData) return wa.initData
  if (import.meta.env.DEV) {
    return (import.meta.env.VITE_DEV_INIT_DATA as string | undefined) ?? ''
  }
  return ''
}

// --- haptics (no-ops outside Telegram) --------------------------------------
export function hapticImpact(
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium',
): void {
  getWebApp()?.HapticFeedback?.impactOccurred(style)
}

export function hapticSuccess(): void {
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
}

export function hapticError(): void {
  getWebApp()?.HapticFeedback?.notificationOccurred('error')
}

export function hapticSelection(): void {
  getWebApp()?.HapticFeedback?.selectionChanged()
}

// --- back button ------------------------------------------------------------
export function showBackButton(cb: () => void): () => void {
  const bb = getWebApp()?.BackButton
  if (!bb) return () => {}
  bb.onClick(cb)
  bb.show()
  return () => {
    bb.offClick(cb)
    bb.hide()
  }
}
