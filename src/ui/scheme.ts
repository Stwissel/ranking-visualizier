/**
 * Light or dark, by explicit class on `<html>` as Web Awesome expects.
 * @module
 */
export type Scheme = 'light' | 'dark' | 'system'

const KEY = 'ranking-visualizier.scheme'

export function readSchemePreference(storage: Storage = localStorage): Scheme {
  const value = storage.getItem(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function saveSchemePreference(scheme: Scheme, storage: Storage = localStorage): void {
  if (scheme === 'system') storage.removeItem(KEY)
  else storage.setItem(KEY, scheme)
}

export function resolveScheme(preference: Scheme): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Calls `listener` whenever the operating system's preference flips. Returns the unsubscribe. */
export function watchSystemScheme(listener: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

export function applyScheme(
  preference: Scheme,
  root: HTMLElement = document.documentElement,
): 'light' | 'dark' {
  const resolved = resolveScheme(preference)
  root.classList.toggle('wa-dark', resolved === 'dark')
  root.classList.toggle('wa-light', resolved === 'light')
  return resolved
}
