/**
 * The small tag that says where a topic has been heading. Shared by the ranking rows and the
 * topic cards so both read the same way.
 * @module
 */
import { html, nothing } from 'lit'
import type { Trend } from '../data/insights.js'

const LOOK: Record<
  Trend,
  { variant: 'success' | 'warning' | 'neutral'; icon: string; text: string }
> = {
  rising: { variant: 'success', icon: 'arrow-up', text: 'rising' },
  sliding: { variant: 'warning', icon: 'arrow-down', text: 'sliding' },
  steady: { variant: 'neutral', icon: 'minus', text: 'steady' },
}

/** A `wa-tag` for the trend, or nothing while there is no trend to show. */
export function trendTag(trend: Trend | undefined) {
  if (!trend) return nothing
  const look = LOOK[trend]
  return html`<wa-tag size="s" variant=${look.variant} appearance="filled-outlined" class="rv-trend">
    <wa-icon name=${look.icon}></wa-icon>${look.text}
  </wa-tag>`
}
