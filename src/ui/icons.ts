/**
 * `<wa-icon>` resolved from bundled Font Awesome Free files instead of Font Awesome's CDN.
 *
 * Explicit imports rather than a glob over the 2,000-icon directory: Vite fingerprints each
 * file as an asset and the bundle carries one short URL per icon actually used.
 *
 * @module
 */

import { registerIconLibrary } from '@awesome.me/webawesome/dist/webawesome.js'
import arrowDown from '@fortawesome/fontawesome-free/svgs/solid/arrow-down.svg?url'
import arrowRightArrowLeft from '@fortawesome/fontawesome-free/svgs/solid/arrow-right-arrow-left.svg?url'
import arrowUp from '@fortawesome/fontawesome-free/svgs/solid/arrow-up.svg?url'
import bars from '@fortawesome/fontawesome-free/svgs/solid/bars.svg?url'
import chartLine from '@fortawesome/fontawesome-free/svgs/solid/chart-line.svg?url'
import check from '@fortawesome/fontawesome-free/svgs/solid/check.svg?url'
import circleExclamation from '@fortawesome/fontawesome-free/svgs/solid/circle-exclamation.svg?url'
import circleHalfStroke from '@fortawesome/fontawesome-free/svgs/solid/circle-half-stroke.svg?url'
import circleInfo from '@fortawesome/fontawesome-free/svgs/solid/circle-info.svg?url'
import cloud from '@fortawesome/fontawesome-free/svgs/solid/cloud.svg?url'
import download from '@fortawesome/fontawesome-free/svgs/solid/download.svg?url'
import ellipsisVertical from '@fortawesome/fontawesome-free/svgs/solid/ellipsis-vertical.svg?url'
import gear from '@fortawesome/fontawesome-free/svgs/solid/gear.svg?url'
import gripVertical from '@fortawesome/fontawesome-free/svgs/solid/grip-vertical.svg?url'
import layerGroup from '@fortawesome/fontawesome-free/svgs/solid/layer-group.svg?url'
import listOl from '@fortawesome/fontawesome-free/svgs/solid/list-ol.svg?url'
import minus from '@fortawesome/fontawesome-free/svgs/solid/minus.svg?url'
import moon from '@fortawesome/fontawesome-free/svgs/solid/moon.svg?url'
import pen from '@fortawesome/fontawesome-free/svgs/solid/pen.svg?url'
import plus from '@fortawesome/fontawesome-free/svgs/solid/plus.svg?url'
import rotate from '@fortawesome/fontawesome-free/svgs/solid/rotate.svg?url'
import sun from '@fortawesome/fontawesome-free/svgs/solid/sun.svg?url'
import tags from '@fortawesome/fontawesome-free/svgs/solid/tags.svg?url'
import trash from '@fortawesome/fontawesome-free/svgs/solid/trash.svg?url'
import triangleExclamation from '@fortawesome/fontawesome-free/svgs/solid/triangle-exclamation.svg?url'
import upload from '@fortawesome/fontawesome-free/svgs/solid/upload.svg?url'
import xmark from '@fortawesome/fontawesome-free/svgs/solid/xmark.svg?url'

export const ICONS: Readonly<Record<string, string>> = {
  'arrow-down': arrowDown,
  'arrow-right-arrow-left': arrowRightArrowLeft,
  'arrow-up': arrowUp,
  bars,
  'chart-line': chartLine,
  check,
  'circle-exclamation': circleExclamation,
  'circle-half-stroke': circleHalfStroke,
  'circle-info': circleInfo,
  cloud,
  download,
  'ellipsis-vertical': ellipsisVertical,
  gear,
  'grip-vertical': gripVertical,
  'layer-group': layerGroup,
  'list-ol': listOl,
  minus,
  moon,
  pen,
  plus,
  rotate,
  sun,
  tags,
  trash,
  'triangle-exclamation': triangleExclamation,
  upload,
  xmark,
}

/** Inert and same-origin: a missing icon must not become a network request. */
const NOTHING = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'

export function useBundledIcons(): void {
  registerIconLibrary('default', {
    resolver: (name) => {
      const url = ICONS[name]
      if (url === undefined) {
        console.error(`No bundled icon named "${name}"; add it to src/ui/icons.ts`)
        return NOTHING
      }
      return url
    },
    mutator: (svg) => {
      if (!svg.hasAttribute('fill')) svg.setAttribute('fill', 'currentColor')
    },
  })
}
