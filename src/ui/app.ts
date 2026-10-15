/**
 * `<rv-app>`: the shell. Owns the current session, the loaded documents, routing, dialogs,
 * notices and sync status; the views below it get data as properties and write through the
 * store, whose change feed brings the new state back here.
 *
 * Light DOM throughout: `<wa-page>` slots, the `wa-*` utility classes and the global stylesheet
 * none cross a shadow boundary.
 */
import { html, LitElement, nothing } from 'lit'
import {
  DEFAULT_COLOURS,
  type RankingDoc,
  type SessionDoc,
  shortId,
  type TopicDoc,
  today,
} from '../data/model.js'
import type { Store } from '../data/store.js'
import {
  clearSyncSettings,
  isConfigured,
  loadSyncSettings,
  type SyncController,
  type SyncSettings,
  type SyncStatus,
  saveSyncSettings,
} from '../data/sync.js'
import {
  type ClashStrategy,
  exportSessions,
  findClashes,
  importSessions,
  parseExport,
} from '../data/transfer.js'
import './rankings-nav.js'
import './ranking-editor.js'
import './topics-view.js'
import './compare-view.js'
import './dialogs/text-dialog.js'
import './dialogs/confirm-dialog.js'
import './dialogs/ranking-dialog.js'
import './dialogs/topic-dialog.js'
import './dialogs/delete-topic-dialog.js'
import './dialogs/import-dialog.js'
import './dialogs/settings-dialog.js'
import { attempt, type DialogRequest, type Notice, notify } from './events.js'
import { downloadText, exportFileName } from './format.js'
import { navigate, parseRoute, type Route } from './router.js'
import {
  applyScheme,
  readSchemePreference,
  resolveScheme,
  type Scheme,
  saveSchemePreference,
  watchSystemScheme,
} from './scheme.js'

const SESSION_KEY = 'ranking-visualizier.session'

export class RvApp extends LitElement {
  static override properties = {
    store: { attribute: false },
    sync: { attribute: false },
    sessions: { state: true },
    sid: { state: true },
    topics: { state: true },
    rankings: { state: true },
    route: { state: true },
    compareIds: { state: true },
    dialog: { state: true },
    notice: { state: true },
    syncStatus: { state: true },
    syncBusy: { state: true },
    scheme: { state: true },
    schemePreference: { state: true },
    ready: { state: true },
  }

  store: Store | undefined
  sync: SyncController | undefined

  sessions: SessionDoc[] = []
  sid: string | undefined
  topics: TopicDoc[] = []
  rankings: RankingDoc[] = []
  route: Route = parseRoute(location.hash)
  compareIds: ReadonlySet<string> = new Set()
  dialog: DialogRequest | undefined
  notice: Notice | undefined
  syncStatus: SyncStatus = { state: 'off' }
  syncBusy = false
  schemePreference: Scheme = readSchemePreference()
  scheme: 'light' | 'dark' = resolveScheme(this.schemePreference)
  private unwatchScheme: (() => void) | undefined
  ready = false

  private unsubscribe: (() => void) | undefined
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private noticeTimer: ReturnType<typeof setTimeout> | undefined
  private syncSettings: SyncSettings = loadSyncSettings()

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('hashchange', this.onHashChange)
    this.addEventListener('rv-dialog', this.onDialogRequest as EventListener)
    this.addEventListener('rv-notice', this.onNotice as EventListener)
    this.addEventListener('rv-compare-toggle', this.onCompareToggle as EventListener)
    this.unwatchScheme = watchSystemScheme(() => {
      if (this.schemePreference === 'system') this.scheme = applyScheme('system')
    })
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this.onHashChange)
    this.unsubscribe?.()
    this.unwatchScheme?.()
    this.sync?.stop()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('store') && this.store) {
      this.unsubscribe?.()
      this.unsubscribe = this.store.subscribe(() => this.scheduleReload())
      void this.reload()
    }
    if (changed.has('sync') && this.sync) {
      this.sync.addEventListener('status', (event) => {
        this.syncStatus = (event as CustomEvent<SyncStatus>).detail
      })
      if (this.syncSettings.live && isConfigured(this.syncSettings))
        this.sync.start(this.syncSettings)
    }
  }

  // ---- loading ----------------------------------------------------------------------------

  private scheduleReload(): void {
    clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => void this.reload(), 50)
  }

  private async reload(): Promise<void> {
    if (!this.store) return
    const sessions = await this.store.listSessions()
    const ids = new Set(sessions.map((s) => shortId(s._id)))
    let sid = this.sid ?? localStorage.getItem(SESSION_KEY) ?? undefined
    if (!sid || !ids.has(sid)) sid = sessions[0] ? shortId(sessions[0]._id) : undefined
    const [topics, rankings] = sid
      ? await Promise.all([this.store.listTopics(sid), this.store.listRankings(sid)])
      : [[], []]
    this.sessions = sessions
    this.selectSession(sid)
    this.topics = topics
    this.rankings = rankings
    // Rankings that vanished (deleted here or elsewhere) leave the comparison.
    const present = new Set(rankings.map((r) => shortId(r._id)))
    this.compareIds = new Set([...this.compareIds].filter((rid) => present.has(rid)))
    this.ready = true
  }

  private selectSession(sid: string | undefined): void {
    if (sid === this.sid) return
    this.sid = sid
    if (sid) localStorage.setItem(SESSION_KEY, sid)
    else localStorage.removeItem(SESSION_KEY)
    this.compareIds = new Set()
  }

  private async switchSession(sid: string): Promise<void> {
    this.selectSession(sid)
    navigate({ view: 'home' })
    await this.reload()
  }

  // ---- events ---------------------------------------------------------------------------

  private onHashChange = (): void => {
    this.route = parseRoute(location.hash)
    if (this.route.view === 'compare') this.compareIds = new Set(this.route.rids)
  }

  private onDialogRequest = (event: CustomEvent<DialogRequest>): void => {
    this.dialog = event.detail
  }

  private onNotice = (event: CustomEvent<Notice>): void => {
    this.showNotice(event.detail)
  }

  private onCompareToggle = (event: CustomEvent<{ rid: string; checked: boolean }>): void => {
    const next = new Set(this.compareIds)
    if (event.detail.checked) next.add(event.detail.rid)
    else next.delete(event.detail.rid)
    this.compareIds = next
    if (this.route.view === 'compare') {
      const rids = this.rankings.map((r) => shortId(r._id)).filter((rid) => next.has(rid))
      if (rids.length >= 2) navigate({ view: 'compare', rids })
      else navigate({ view: 'home' })
    }
  }

  private showNotice(notice: Notice): void {
    clearTimeout(this.noticeTimer)
    this.notice = notice
    if (notice.variant !== 'danger') {
      this.noticeTimer = setTimeout(() => {
        this.notice = undefined
      }, 5000)
    }
  }

  private onSchemeMenu = (event: CustomEvent<{ item: { value: string } }>): void => {
    const value = event.detail.item.value
    if (value !== 'light' && value !== 'dark' && value !== 'system') return
    saveSchemePreference(value)
    this.schemePreference = value
    this.scheme = applyScheme(value)
  }

  // ---- sessions -------------------------------------------------------------------------

  private onSessionMenu = (event: CustomEvent<{ item: { value: string } }>): void => {
    const value = event.detail.item.value
    if (value === 'new') this.dialog = { kind: 'new-session' }
    else if (value === 'rename') this.dialog = { kind: 'rename-session' }
    else if (value === 'delete') this.dialog = { kind: 'delete-session' }
    else if (value.startsWith('session:')) void this.switchSession(value.slice('session:'.length))
  }

  private async createSession(name: string): Promise<void> {
    if (!this.store) return
    const store = this.store
    await attempt(this, async () => {
      const session = await store.createSession(name)
      await this.switchSession(shortId(session._id))
    })
  }

  // ---- export and import ----------------------------------------------------------------

  private onDataMenu = (event: CustomEvent<{ item: { value: string } }>): void => {
    const value = event.detail.item.value
    if (value === 'export-session') void this.exportData(this.sid ? [this.sid] : undefined)
    else if (value === 'export-all') void this.exportData(undefined)
    else if (value === 'import') this.querySelector<HTMLInputElement>('#rv-import-file')?.click()
    else if (value === 'settings') this.dialog = { kind: 'settings' }
  }

  private async exportData(sids: string[] | undefined): Promise<void> {
    if (!this.store) return
    const store = this.store
    await attempt(this, async () => {
      const file = await exportSessions(store, sids)
      const name =
        sids?.length === 1 ? this.sessions.find((s) => shortId(s._id) === sids[0])?.name : undefined
      downloadText(exportFileName(today(), name), JSON.stringify(file, null, 2))
    })
  }

  private onImportFile = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !this.store) return
    const store = this.store
    await attempt(this, async () => {
      const parsed = parseExport(await file.text())
      const clashes = await findClashes(store, parsed)
      this.dialog = { kind: 'import', file: parsed, clashes }
    })
  }

  private async runImport(strategy: ClashStrategy): Promise<void> {
    if (!this.store || this.dialog?.kind !== 'import') return
    const store = this.store
    const file = this.dialog.file
    await attempt(this, async () => {
      const result = await importSessions(store, file, strategy)
      if (result.imported[0] && !this.sid) await this.switchSession(result.imported[0])
      notify(this, {
        variant: 'success',
        message: `Imported ${result.imported.length} session${result.imported.length === 1 ? '' : 's'}${
          result.skipped.length ? `, skipped ${result.skipped.length}` : ''
        }.`,
      })
    })
  }

  // ---- sync -----------------------------------------------------------------------------

  private saveSync(settings: SyncSettings): void {
    this.syncSettings = settings
    saveSyncSettings(settings)
    if (!this.sync) return
    if (settings.live && isConfigured(settings)) this.sync.start(settings)
    else this.sync.stop()
  }

  private async syncNow(settings: SyncSettings): Promise<void> {
    if (!this.sync) return
    const sync = this.sync
    this.syncBusy = true
    try {
      await attempt(this, () => sync.syncOnce(settings), 'Synchronised with CouchDB.')
    } finally {
      this.syncBusy = false
    }
  }

  private disconnectSync(): void {
    this.sync?.stop()
    clearSyncSettings()
    this.syncSettings = loadSyncSettings()
    this.syncStatus = { state: 'off' }
  }

  // ---- render ---------------------------------------------------------------------------

  private get currentSession(): SessionDoc | undefined {
    return this.sessions.find((s) => shortId(s._id) === this.sid)
  }

  override render() {
    return html`
      <wa-page mobile-breakpoint="860">
        ${this.renderHeader()}
        <rv-rankings-nav
          slot="navigation"
          .rankings=${this.rankings}
          .route=${this.route}
          .compareIds=${this.compareIds}
          .topicCount=${this.topics.length}
          .hasSession=${this.sid !== undefined}
        ></rv-rankings-nav>
        <main class="rv-main wa-stack wa-gap-l">
          ${this.renderNotice()}
          ${this.renderView()}
        </main>
      </wa-page>
      <input id="rv-import-file" class="rv-hidden" type="file" accept="application/json,.json" @change=${this.onImportFile} />
      ${this.renderDialog()}
    `
  }

  private renderHeader() {
    const session = this.currentSession
    return html`
      <header slot="header" class="rv-header wa-split">
        <div class="rv-header-title wa-cluster wa-gap-s">
          <wa-button data-toggle-nav appearance="plain" size="s" class="wa-mobile-only">
            <wa-icon name="bars" label="Menu"></wa-icon>
          </wa-button>
          <a class="rv-brand wa-cluster wa-gap-xs" href="#/">
            <wa-icon name="chart-line"></wa-icon>
            <span class="rv-brand-name">Ranking Visualizer</span>
          </a>
          ${
            this.ready
              ? html`<wa-dropdown @wa-select=${this.onSessionMenu}>
                  <wa-button slot="trigger" appearance="filled" size="s" with-caret>
                    <wa-icon slot="start" name="layer-group"></wa-icon>
                    ${session?.name ?? 'No session'}
                  </wa-button>
                  ${this.sessions.map(
                    (s) =>
                      html`<wa-dropdown-item
                        type="checkbox"
                        ?checked=${shortId(s._id) === this.sid}
                        value=${`session:${shortId(s._id)}`}
                        >${s.name}</wa-dropdown-item
                      >`,
                  )}
                  ${this.sessions.length ? html`<wa-divider></wa-divider>` : nothing}
                  <wa-dropdown-item value="new"><wa-icon slot="icon" name="plus"></wa-icon>New session…</wa-dropdown-item>
                  ${
                    session
                      ? html`<wa-dropdown-item value="rename"><wa-icon slot="icon" name="pen"></wa-icon>Rename…</wa-dropdown-item>
                          <wa-dropdown-item value="delete" variant="danger"><wa-icon slot="icon" name="trash"></wa-icon>Delete session…</wa-dropdown-item>`
                      : nothing
                  }
                </wa-dropdown>`
              : nothing
          }
        </div>
        <div class="rv-header-actions wa-cluster wa-gap-xs">
          ${this.renderSyncButton()}
          <wa-dropdown placement="bottom-end" @wa-select=${this.onDataMenu}>
            <wa-button slot="trigger" appearance="plain" size="s">
              <wa-icon name="ellipsis-vertical" label="Data and settings"></wa-icon>
            </wa-button>
            <wa-dropdown-item value="export-session" ?disabled=${!this.sid}>
              <wa-icon slot="icon" name="download"></wa-icon>Export this session
            </wa-dropdown-item>
            <wa-dropdown-item value="export-all" ?disabled=${this.sessions.length === 0}>
              <wa-icon slot="icon" name="download"></wa-icon>Export all sessions
            </wa-dropdown-item>
            <wa-dropdown-item value="import"><wa-icon slot="icon" name="upload"></wa-icon>Import JSON…</wa-dropdown-item>
            <wa-divider></wa-divider>
            <wa-dropdown-item value="settings"><wa-icon slot="icon" name="gear"></wa-icon>CouchDB sync…</wa-dropdown-item>
          </wa-dropdown>
          <wa-dropdown placement="bottom-end" @wa-select=${this.onSchemeMenu}>
            <wa-button slot="trigger" appearance="plain" size="s">
              <wa-icon
                name=${this.schemePreference === 'system' ? 'circle-half-stroke' : this.scheme === 'dark' ? 'moon' : 'sun'}
                label="Appearance"
              ></wa-icon>
            </wa-button>
            <wa-dropdown-item type="checkbox" value="light" ?checked=${this.schemePreference === 'light'}>
              <wa-icon slot="icon" name="sun"></wa-icon>Light
            </wa-dropdown-item>
            <wa-dropdown-item type="checkbox" value="dark" ?checked=${this.schemePreference === 'dark'}>
              <wa-icon slot="icon" name="moon"></wa-icon>Dark
            </wa-dropdown-item>
            <wa-dropdown-item type="checkbox" value="system" ?checked=${this.schemePreference === 'system'}>
              <wa-icon slot="icon" name="circle-half-stroke"></wa-icon>System
            </wa-dropdown-item>
          </wa-dropdown>
        </div>
      </header>
    `
  }

  private renderSyncButton() {
    const { state } = this.syncStatus
    const configured = isConfigured(this.syncSettings)
    // What replication is doing wins over whether anything is configured: a one-shot sync from
    // the dialog can succeed before its settings are saved.
    const label =
      state === 'error'
        ? 'Sync error'
        : state === 'active' || state === 'connecting'
          ? 'Syncing…'
          : state === 'idle'
            ? 'Synced'
            : configured
              ? 'Sync off'
              : 'Not synced'
    const variant = state === 'error' ? 'danger' : state === 'idle' ? 'success' : 'neutral'
    return html`<wa-button
      class="rv-sync-button"
      appearance="plain"
      size="s"
      variant=${variant}
      @click=${() => {
        this.dialog = { kind: 'settings' }
      }}
    >
      <wa-icon slot="start" name=${state === 'error' ? 'triangle-exclamation' : 'cloud'}></wa-icon>
      <span class="wa-desktop-only">${label}</span>
      <span class="wa-mobile-only wa-visually-hidden">${label}</span>
    </wa-button>`
  }

  private renderNotice() {
    if (!this.notice) return nothing
    const icon =
      this.notice.variant === 'success'
        ? 'check'
        : this.notice.variant === 'danger'
          ? 'circle-exclamation'
          : 'circle-info'
    return html`<wa-callout variant=${this.notice.variant} size="s">
      <wa-icon slot="icon" name=${icon}></wa-icon>
      <div class="wa-split">
        <span>${this.notice.message}</span>
        <wa-button appearance="plain" size="s" @click=${() => {
          this.notice = undefined
        }}><wa-icon name="xmark" label="Dismiss"></wa-icon></wa-button>
      </div>
    </wa-callout>`
  }

  private renderView() {
    if (!this.ready) return nothing
    if (!this.sid) {
      return html`<div class="rv-empty wa-stack wa-gap-m wa-align-items-center">
        <wa-icon name="layer-group"></wa-icon>
        <h1 class="wa-heading-l rv-page-title">Start a session</h1>
        <p>A session holds its own topics and rankings. Create one, or import a JSON export.</p>
        <div class="wa-cluster wa-gap-s">
          <wa-button variant="brand" @click=${() => {
            this.dialog = { kind: 'new-session' }
          }}><wa-icon slot="start" name="plus"></wa-icon>New session</wa-button>
          <wa-button appearance="outlined" @click=${() => this.querySelector<HTMLInputElement>('#rv-import-file')?.click()}>
            <wa-icon slot="start" name="upload"></wa-icon>Import JSON
          </wa-button>
        </div>
      </div>`
    }
    const sid = this.sid
    const topicMap = new Map(this.topics.map((t) => [shortId(t._id), t]))
    switch (this.route.view) {
      case 'topics':
        return html`<rv-topics-view .store=${this.store} .sid=${sid} .topics=${this.topics} .rankings=${this.rankings}></rv-topics-view>`
      case 'compare': {
        const wanted = new Set(this.route.rids)
        const selected = this.rankings.filter((r) => wanted.has(shortId(r._id)))
        return html`<rv-compare-view .rankings=${selected} .topics=${topicMap} .sessionName=${this.currentSession?.name ?? ''}></rv-compare-view>`
      }
      case 'ranking': {
        const rid = this.route.rid
        const ranking = this.rankings.find((r) => shortId(r._id) === rid)
        if (!ranking) {
          return html`<wa-callout variant="warning"><wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
            That ranking is not in this session. <a href="#/">Back to the newest ranking</a>.</wa-callout>`
        }
        return html`<rv-ranking-editor .store=${this.store} .sid=${sid} .ranking=${ranking} .topics=${topicMap} .rankings=${this.rankings}></rv-ranking-editor>`
      }
      default: {
        const newest = this.rankings[0]
        if (newest) {
          return html`<rv-ranking-editor .store=${this.store} .sid=${sid} .ranking=${newest} .topics=${topicMap} .rankings=${this.rankings}></rv-ranking-editor>`
        }
        return this.renderGettingStarted()
      }
    }
  }

  private renderGettingStarted() {
    const hasTopics = this.topics.length > 0
    return html`<div class="rv-empty wa-stack wa-gap-m wa-align-items-center">
      <wa-icon name=${hasTopics ? 'list-ol' : 'tags'}></wa-icon>
      <h1 class="wa-heading-l rv-page-title">${hasTopics ? 'Create your first ranking' : 'Add some topics'}</h1>
      <p>
        ${
          hasTopics
            ? `${this.topics.length} topic${this.topics.length === 1 ? '' : 's'} ready. A ranking is a dated snapshot of their order.`
            : 'Topics are the things you rank: a title and a colour that stay the same across rankings.'
        }
      </p>
      <div class="wa-cluster wa-gap-s">
        ${
          hasTopics
            ? html`<wa-button variant="brand" @click=${() => {
                this.dialog = { kind: 'new-ranking' }
              }}><wa-icon slot="start" name="plus"></wa-icon>New ranking</wa-button>`
            : nothing
        }
        <wa-button variant=${hasTopics ? 'neutral' : 'brand'} appearance=${hasTopics ? 'outlined' : 'accent'} href="#/topics">
          <wa-icon slot="start" name="tags"></wa-icon>${hasTopics ? 'Manage topics' : 'Add topics'}
        </wa-button>
      </div>
    </div>`
  }

  private renderDialog() {
    const dialog = this.dialog
    if (!dialog || !this.store) return nothing
    const store = this.store
    const sid = this.sid
    const close = () => {
      this.dialog = undefined
    }
    switch (dialog.kind) {
      case 'new-session':
        return html`<rv-text-dialog label="New session" fieldLabel="Session name" submitLabel="Create"
          @rv-submit=${(e: CustomEvent<{ value: string }>) => void this.createSession(e.detail.value)}
          @rv-close=${close}></rv-text-dialog>`
      case 'rename-session':
        return html`<rv-text-dialog label="Rename session" fieldLabel="Session name" .value=${this.currentSession?.name ?? ''}
          @rv-submit=${(e: CustomEvent<{ value: string }>) => sid && attempt(this, () => store.renameSession(sid, e.detail.value))}
          @rv-close=${close}></rv-text-dialog>`
      case 'delete-session':
        return html`<rv-confirm-dialog label="Delete session" confirmLabel="Delete" danger
          message=${`Delete “${this.currentSession?.name ?? ''}” with its ${this.topics.length} topics and ${this.rankings.length} rankings? This cannot be undone.`}
          @rv-confirm=${() =>
            sid &&
            attempt(this, async () => {
              await store.deleteSession(sid)
              this.selectSession(undefined)
              navigate({ view: 'home' })
              await this.reload()
            })}
          @rv-close=${close}></rv-confirm-dialog>`
      case 'new-ranking':
        return html`<rv-ranking-dialog label="New ranking"
          hint=${this.rankings[0] ? `Starts as a copy of “${this.rankings[0].name}”; then drag to reorder.` : ''}
          @rv-submit=${(e: CustomEvent<{ name: string; date: string }>) =>
            sid &&
            attempt(this, async () => {
              const ranking = await store.createRanking(sid, e.detail)
              navigate({ view: 'ranking', rid: shortId(ranking._id) })
            })}
          @rv-close=${close}></rv-ranking-dialog>`
      case 'edit-ranking':
        return html`<rv-ranking-dialog label="Edit ranking" submitLabel="Save" .name=${dialog.ranking.name} .date=${dialog.ranking.date}
          @rv-submit=${(e: CustomEvent<{ name: string; date: string }>) =>
            sid &&
            attempt(this, () => store.updateRanking(sid, shortId(dialog.ranking._id), e.detail))}
          @rv-close=${close}></rv-ranking-dialog>`
      case 'delete-ranking':
        return html`<rv-confirm-dialog label="Delete ranking" confirmLabel="Delete" danger
          message=${`Delete “${dialog.ranking.name}”? Topics stay; only this snapshot of their order goes.`}
          @rv-confirm=${() =>
            sid &&
            attempt(this, async () => {
              await store.deleteRanking(sid, shortId(dialog.ranking._id))
              if (this.route.view === 'ranking' && this.route.rid === shortId(dialog.ranking._id))
                navigate({ view: 'home' })
            })}
          @rv-close=${close}></rv-confirm-dialog>`
      case 'new-topic':
        return html`<rv-topic-dialog label="New topic" ?ranked=${this.rankings.length > 0}
          .colour=${DEFAULT_COLOURS[this.topics.length % DEFAULT_COLOURS.length]}
          @rv-submit=${(e: CustomEvent<{ title: string; colour: string; description: string }>) =>
            sid && attempt(this, () => store.createTopic(sid, e.detail))}
          @rv-close=${close}></rv-topic-dialog>`
      case 'edit-topic':
        return html`<rv-topic-dialog label="Edit topic" submitLabel="Save" editing .title=${dialog.topic.title} .colour=${dialog.topic.colour}
          .description=${dialog.topic.description ?? ''}
          @rv-submit=${(e: CustomEvent<{ title: string; colour: string; description: string }>) =>
            sid && attempt(this, () => store.updateTopic(sid, shortId(dialog.topic._id), e.detail))}
          @rv-close=${close}></rv-topic-dialog>`
      case 'delete-topic':
        return html`<rv-delete-topic-dialog .topic=${dialog.topic} .ranking=${dialog.ranking}
          @rv-submit=${(e: CustomEvent<{ mode: 'retire' | 'delete' }>) =>
            sid &&
            attempt(this, () =>
              e.detail.mode === 'delete'
                ? store.deleteTopic(sid, shortId(dialog.topic._id))
                : store.retireTopic(
                    sid,
                    shortId(dialog.topic._id),
                    dialog.ranking ? shortId(dialog.ranking._id) : undefined,
                  ),
            )}
          @rv-close=${close}></rv-delete-topic-dialog>`
      case 'import':
        return html`<rv-import-dialog .file=${dialog.file} .clashes=${dialog.clashes}
          @rv-submit=${(e: CustomEvent<{ strategy: ClashStrategy }>) => void this.runImport(e.detail.strategy)}
          @rv-close=${close}></rv-import-dialog>`
      case 'settings':
        return html`<rv-settings-dialog .settings=${this.syncSettings} .status=${this.syncStatus} .busy=${this.syncBusy}
          @rv-submit=${(e: CustomEvent<{ settings: SyncSettings }>) => this.saveSync(e.detail.settings)}
          @rv-sync-now=${(e: CustomEvent<{ settings: SyncSettings }>) => void this.syncNow(e.detail.settings)}
          @rv-disconnect=${() => this.disconnectSync()}
          @rv-close=${close}></rv-settings-dialog>`
    }
  }
}

customElements.define('rv-app', RvApp)
