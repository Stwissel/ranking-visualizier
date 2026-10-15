import { html } from 'lit'
import { DialogElement } from './base.js'

/** A yes/no question. Emits `rv-confirm` when confirmed. */
export class RvConfirmDialog extends DialogElement {
  static override properties = {
    label: { type: String },
    message: { type: String },
    confirmLabel: { type: String },
    danger: { type: Boolean },
  }

  label = 'Are you sure?'
  message = ''
  confirmLabel = 'Confirm'
  danger = false

  private onConfirm = (): void => {
    this.emit('rv-confirm', undefined)
    this.close()
  }

  override render() {
    return html`
      <wa-dialog open label=${this.label} @wa-after-hide=${this.onAfterHide}>
        <p>${this.message}</p>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant=${this.danger ? 'danger' : 'brand'} @click=${this.onConfirm}
          >${this.confirmLabel}</wa-button
        >
      </wa-dialog>
    `
  }
}

customElements.define('rv-confirm-dialog', RvConfirmDialog)
