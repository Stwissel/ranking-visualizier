/**
 * Hash routing, so GitHub Pages needs no fallback and a URL names a ranking or a comparison.
 *
 *   #/                     overview (newest ranking, or an empty state)
 *   #/ranking/<rid>        edit one ranking
 *   #/compare/<rid>,<rid>  compare two or more rankings
 *   #/present/<rid>,<rid>  step through the comparison full screen
 *   #/topics               manage topics
 *
 * @module
 */
export type Route =
  | { view: 'home' }
  | { view: 'ranking'; rid: string }
  | { view: 'compare'; rids: string[] }
  | { view: 'present'; rids: string[] }
  | { view: 'topics' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [head, rest] = path.split('/', 2)
  if (head === 'ranking' && rest) return { view: 'ranking', rid: decodeURIComponent(rest) }
  if ((head === 'compare' || head === 'present') && rest) {
    const rids = rest.split(',').map(decodeURIComponent).filter(Boolean)
    if (rids.length > 0) return { view: head, rids }
  }
  if (head === 'topics') return { view: 'topics' }
  return { view: 'home' }
}

export function routeHash(route: Route): string {
  switch (route.view) {
    case 'home':
      return '#/'
    case 'ranking':
      return `#/ranking/${encodeURIComponent(route.rid)}`
    case 'compare':
      return `#/compare/${route.rids.map(encodeURIComponent).join(',')}`
    case 'present':
      return `#/present/${route.rids.map(encodeURIComponent).join(',')}`
    case 'topics':
      return '#/topics'
  }
}

export function navigate(route: Route): void {
  const hash = routeHash(route)
  if (location.hash === hash) return
  location.hash = hash
}
