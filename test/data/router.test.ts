import { describe, expect, it } from 'vitest'
import { parseRoute, type Route, routeHash } from '../../src/ui/router.js'

describe('router', () => {
  it('parses and prints every route', () => {
    const routes: Route[] = [
      { view: 'home' },
      { view: 'ranking', rid: 'r 1' },
      { view: 'compare', rids: ['a', 'b,c'] },
      { view: 'present', rids: ['a', 'b'] },
      { view: 'topics' },
    ]
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route)
    expect(routeHash({ view: 'present', rids: ['a', 'b'] })).toBe('#/present/a,b')
  })

  it('falls back to home for anything it does not know', () => {
    expect(parseRoute('#/present/')).toEqual({ view: 'home' })
    expect(parseRoute('#/present/%')).toEqual({ view: 'home' })
    expect(parseRoute('#/ranking/%E0%A4%A')).toEqual({ view: 'home' })
    expect(parseRoute('#/nope')).toEqual({ view: 'home' })
    expect(parseRoute('')).toEqual({ view: 'home' })
  })
})
