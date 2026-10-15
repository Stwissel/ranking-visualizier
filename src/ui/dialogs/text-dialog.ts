import { html } from 'lit'
import { DialogElement, formValues } from './base.js'

/** One text field: new session, rename session. Emits `rv-submit` with `{ value }`. */
export class RvTextDialog extends DialogElement {
  static override properties = {
    label: { type: String },
    fieldLabel: { type: String },
    value: { type: String },
    submitLabel: { type: String },
  }

  label = ''
  fieldLabel = 'Name'
  value = ''
  submitLabel = 'Save'

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const { value } = formValues(event.target as HTMLFormElement)
    if (!value?.trim()) return
    this.emit('rv-submit', { value: value.trim() })
    this.close()
  }

  override render() {
    return html`
      <wa-dialog open label=${this.label} @wa-after-hide=${this.onAfterHide}>
        <form id="rv-text-form" @submit=${this.onSubmit}>
          <wa-input name="value" label=${this.fieldLabel} .value=${this.value} required autofocus></wa-input>
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-text-form">${this.submitLabel}</wa-button>
      </wa-dialog>
    `
  }
}

customElements.define('rv-text-dialog', RvTextDialog)
