import { html } from 'lit'
import { today } from '../../data/model.js'
import { DialogElement, formValues } from './base.js'

/** Name and date of a ranking, new or existing. Emits `rv-submit` with `{ name, date }`. */
export class RvRankingDialog extends DialogElement {
  static override properties = {
    label: { type: String },
    name: { type: String },
    date: { type: String },
    submitLabel: { type: String },
    hint: { type: String },
  }

  label = 'New ranking'
  name = ''
  date = today()
  submitLabel = 'Create'
  hint = ''

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const { name, date } = formValues(event.target as HTMLFormElement)
    if (!name?.trim() || !date) return
    this.emit('rv-submit', { name: name.trim(), date })
    this.close()
  }

  override render() {
    return html`
      <wa-dialog open label=${this.label} @wa-after-hide=${this.onAfterHide}>
        <form id="rv-ranking-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          ${this.hint ? html`<p class="rv-quiet">${this.hint}</p>` : ''}
          <wa-input name="name" label="Name" .value=${this.name} placeholder="Q4 priorities" required autofocus></wa-input>
          <wa-input name="date" type="date" label="Date" .value=${this.date} required></wa-input>
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-ranking-form">${this.submitLabel}</wa-button>
      </wa-dialog>
    `
  }
}

customElements.define('rv-ranking-dialog', RvRankingDialog)
