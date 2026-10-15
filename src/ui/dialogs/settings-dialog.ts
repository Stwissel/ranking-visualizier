import { html } from 'lit'
import { isConfigured, type SyncSettings, type SyncStatus } from '../../data/sync.js'
import { DialogElement, formValues } from './base.js'

/**
 * CouchDB connection. Emits `rv-submit` with `{ settings }` on save, `rv-sync-now` with
 * `{ settings }` for a one-shot round trip, and `rv-disconnect` to forget everything.
 */
export class RvSettingsDialog extends DialogElement {
  static override properties = {
    settings: { attribute: false },
    status: { attribute: false },
    busy: { type: Boolean },
  }

  settings!: SyncSettings
  status: SyncStatus = { state: 'off' }
  busy = false

  private read(): SyncSettings {
    const form = this.querySelector<HTMLFormElement>('#rv-settings-form')!
    const values = formValues(form)
    return {
      url: values.url?.trim() ?? '',
      database: values.database?.trim() || 'ranking-visualizier',
      username: values.username ?? '',
      password: values.password ?? '',
      live: values.live === 'on',
    }
  }

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    this.emit('rv-submit', { settings: this.read() })
    this.close()
  }

  private onSyncNow = (): void => {
    this.emit('rv-sync-now', { settings: this.read() })
  }

  private onDisconnect = (): void => {
    this.emit('rv-disconnect', undefined)
    this.close()
  }

  override render() {
    const s = this.settings
    return html`
      <wa-dialog open label="CouchDB sync" @wa-after-hide=${this.onAfterHide}>
        <form id="rv-settings-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          <p class="rv-quiet">
            Replicates this browser's data with a CouchDB database, both ways. Settings stay in this
            browser only and are never synced. The server must allow CORS for this origin.
          </p>
          <wa-input name="url" type="url" label="CouchDB URL" placeholder="https://couch.example.org" .value=${s.url} autofocus></wa-input>
          <wa-input name="database" label="Database" .value=${s.database} required></wa-input>
          <div class="wa-grid rv-form-row">
            <wa-input name="username" label="Username" autocomplete="username" .value=${s.username}></wa-input>
            <wa-input name="password" type="password" label="Password" autocomplete="current-password" password-toggle .value=${s.password}></wa-input>
          </div>
          <wa-switch name="live" ?checked=${s.live} hint="Keep replicating while the app is open.">Live sync</wa-switch>
          ${this.renderStatus()}
        </form>
        <wa-button slot="footer" appearance="plain" variant="danger" ?disabled=${!isConfigured(s)} @click=${this.onDisconnect}>Forget</wa-button>
        <wa-button slot="footer" appearance="outlined" ?loading=${this.busy} @click=${this.onSyncNow}>
          <wa-icon slot="start" name="rotate"></wa-icon>Sync now
        </wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-settings-form">Save</wa-button>
      </wa-dialog>
    `
  }

  private renderStatus() {
    const { state, error, lastSyncedAt } = this.status
    if (state === 'error') {
      return html`<wa-callout variant="danger" size="s">
        <wa-icon slot="icon" name="circle-exclamation"></wa-icon>${error}
      </wa-callout>`
    }
    if (state === 'idle' && lastSyncedAt) {
      return html`<wa-callout variant="success" size="s">
        <wa-icon slot="icon" name="check"></wa-icon>In sync, last change
        <wa-relative-time date=${lastSyncedAt}></wa-relative-time>.
      </wa-callout>`
    }
    if (state === 'active' || state === 'connecting') {
      return html`<wa-callout variant="brand" size="s">
        <wa-icon slot="icon" name="rotate"></wa-icon>Replicating…
      </wa-callout>`
    }
    return ''
  }
}

customElements.define('rv-settings-dialog', RvSettingsDialog)
