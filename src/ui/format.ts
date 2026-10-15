/**
 * Small formatting helpers shared by the views.
 * @module
 */

/**
 * Formats a `YYYY-MM-DD` string in the user's locale. Built from parts rather than
 * `Date.parse`, which reads a bare date as UTC midnight and shows the previous day west of
 * Greenwich.
 */
export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day))
}

/** A readable file name for an export, e.g. `ranking-visualizier-2026-10-15.json`. */
export function exportFileName(date: string, sessionName?: string): string {
  const slug = sessionName
    ? `-${sessionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`
    : ''
  return `ranking-visualizier${slug}-${date}.json`
}

/** Triggers a download of `text` as a file. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  downloadBlob(fileName, new Blob([text], { type }))
}

/** Triggers a download of a blob. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
