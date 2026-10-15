import { html } from 'lit'
import type { RankingDoc, TopicDoc } from '../../data/model.js'
import { formatDate } from '../format.js'
import { DialogElement, formValues } from './base.js'

export type DeleteTopicMode = 'retire' | 'delete'

/**
 * The two ways a topic can go: out of this ranking and the later ones (history kept), or out
 * of everything. Emits `rv-submit` with `{ mode }`.
 */
export class RvDeleteTopicDialog extends DialogElement {
  static override properties = {
    topic: { attribute: false },
    ranking: { attribute: false },
  }

  topic!: TopicDoc
  /** The ranking the user is looking at; without one the newest ranking is "this one". */
  ranking: RankingDoc | undefined

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const { mode } = formValues(event.target as HTMLFormElement)
    if (mode !== 'retire' && mode !== 'delete') return
    this.emit('rv-submit', { mode })
    this.close()
  }

  override render() {
    const scope = this.ranking
      ? html`<strong>${this.ranking.name}</strong> (${formatDate(this.ranking.date)}) and every later ranking`
      : html`the newest ranking and every later one`
    return html`
      <wa-dialog open label=${`Remove “${this.topic.title}”`} @wa-after-hide=${this.onAfterHide}>
        <form id="rv-delete-topic-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          <wa-radio-group name="mode" label="How far should this go?" value="retire">
            <wa-radio value="retire">
              Remove from ${scope}
              <span class="rv-radio-hint">Earlier rankings keep it, so history and charts still show where it stood.</span>
            </wa-radio>
            <wa-radio value="delete">
              Delete completely
              <span class="rv-radio-hint">Removes the topic and its place in every ranking. This cannot be undone.</span>
            </wa-radio>
          </wa-radio-group>
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="danger" type="submit" form="rv-delete-topic-form">Remove</wa-button>
      </wa-dialog>
    `
  }
}

customElements.define('rv-delete-topic-dialog', RvDeleteTopicDialog)
