/**
 * Application entry point.
 *
 * Styles and components are imported here rather than linked from `index.html`, so Vite
 * bundles and fingerprints them and a missing file fails the build instead of rendering an
 * unstyled page.
 *
 * @module
 */
import '@awesome.me/webawesome/dist/styles/webawesome.css'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/callout/callout.js'
import '@awesome.me/webawesome/dist/components/card/card.js'
import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js'
import '@awesome.me/webawesome/dist/components/color-picker/color-picker.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/divider/divider.js'
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js'
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js'
import '@awesome.me/webawesome/dist/components/icon/icon.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/page/page.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/relative-time/relative-time.js'
import '@awesome.me/webawesome/dist/components/switch/switch.js'
import '@awesome.me/webawesome/dist/components/tag/tag.js'
import '@awesome.me/webawesome/dist/components/textarea/textarea.js'
import './ui/styles/app.css'
import { useBundledIcons } from './ui/icons.js'

// Before anything renders: registering replaces Web Awesome's CDN-backed default library.
useBundledIcons()

import { openLocalDatabase, openRemoteDatabase } from './data/db.js'
import { Store } from './data/store.js'
import { SyncController } from './data/sync.js'
import { applyScheme, readSchemePreference } from './ui/scheme.js'

import './ui/app.js'
import type { RvApp } from './ui/app.js'

applyScheme(readSchemePreference())

const db = openLocalDatabase()
const app = document.querySelector<RvApp>('rv-app')
if (!app) throw new Error('index.html has no <rv-app>')
app.store = new Store(db)
app.sync = new SyncController(db, openRemoteDatabase)
