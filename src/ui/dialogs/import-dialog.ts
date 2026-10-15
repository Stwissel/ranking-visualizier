import { html } from 'lit'
import type { ExportFile } from '../../data/transfer.js'
import { DialogElement, formValues } from './base.js'

/**
 * Shows what a parsed export contains and, when some of its sessions already exist here, asks
 * how to treat them. Emits `rv-submit` with `{ strategy }`.
 */
export class RvImportDialog extends DialogElement {
  static override properties = {
    file: { attribute: false },
    clashes: { attribute: false },
  }

  file!: ExportFile
  clashes: string[] = []

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const { strategy } = formValues(event.target as HTMLFormElement)
    this.emit('rv-submit', { strategy: strategy || 'copy' })
    this.close()
  }

  override render() {
    const clashing = new Set(this.clashes)
    return html`
      <wa-dialog open label="Import sessions" @wa-after-hide=${this.onAfterHide}>
        <form id="rv-import-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          <p class="rv-quiet">
            ${this.file.sessions.length} session${this.file.sessions.length === 1 ? '' : 's'}${
              this.file.exportedAt
                ? html`, exported <wa-relative-time date=${this.file.exportedAt}></wa-relative-time>`
                : ''
            }.
          </p>
          <ul class="wa-stack wa-gap-2xs">
            ${this.file.sessions.map(
              (entry) => html`<li>
                <strong>${entry.session.name}</strong>
                <span class="rv-quiet"
                  >· ${entry.topics.length} topics, ${entry.rankings.length} rankings</span
                >
                ${clashing.has(entry.session._id.slice('session:'.length)) ? html`<wa-tag size="s" variant="warning">already here</wa-tag>` : ''}
              </li>`,
            )}
          </ul>
          ${
            this.clashes.length > 0
              ? html`<wa-radio-group name="strategy" label="Sessions that already exist" value="copy">
                  <wa-radio value="copy">Import as a copy<span slot="hint">Keeps both; the copy gets new ids.</span></wa-radio>
                  <wa-radio value="replace">Replace<span slot="hint">Deletes the local session and its rankings first.</span></wa-radio>
                  <wa-radio value="skip">Skip<span slot="hint">Imports only the sessions that are new here.</span></wa-radio>
                </wa-radio-group>`
              : ''
          }
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-import-form">Import</wa-button>
      </wa-dialog>
    `
  }
}

customElements.define('rv-import-dialog', RvImportDialog)
