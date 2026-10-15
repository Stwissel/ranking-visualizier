/**
 * The bump chart as a file. The chart on screen gets its colours and fonts from `app.css`
 * through `--wa-*` tokens; a file has neither, so every property the chart rules set is
 * resolved and written onto the elements, in the light scheme whatever the page shows.
 * @module
 */

/** Properties that `app.css` sets on chart elements, written inline on export. */
const INLINED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-weight',
  'opacity',
] as const

/**
 * A standalone SVG document of the chart. The clone is styled inside a light-scheme container
 * attached to the document so computed values are real, then detached again.
 */
export function serialiseChart(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const stage = document.createElement('div')
  stage.className = 'wa-light rv-chart-export-stage'
  stage.append(clone)
  document.body.append(stage)
  try {
    clone.removeAttribute('data-focus')
    for (const hit of clone.querySelectorAll('.topic-hit')) hit.remove()
    const stageStyle = getComputedStyle(stage)
    const surface = stageStyle.getPropertyValue('--wa-color-surface-default').trim() || '#ffffff'
    // Read every computed value first; stripping a class changes what the descendants compute.
    const elements = [clone, ...clone.querySelectorAll<SVGElement>('*')]
    const resolved = elements.map((element) => {
      const computed = getComputedStyle(element)
      return INLINED.map((property) => [property, computed.getPropertyValue(property)] as const)
    })
    elements.forEach((element, index) => {
      for (const [property, value] of resolved[index]!) {
        if (value && !(property === 'opacity' && value === '1'))
          element.setAttribute(property, value)
      }
      element.removeAttribute('tabindex')
      element.removeAttribute('class')
      element.removeAttribute('style')
    })
    const viewBox = clone.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 800, 400]
    const width = viewBox[2] ?? 800
    const height = viewBox[3] ?? 400
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('width', String(width))
    background.setAttribute('height', String(height))
    background.setAttribute('fill', surface)
    clone.prepend(background)
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
  } finally {
    stage.remove()
  }
}

/** Draws the SVG text onto a canvas at `scale` and returns a PNG. */
export function rasterise(svgText: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }))
    image.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas is not available'))
        return
      }
      context.scale(scale, scale)
      context.drawImage(image, 0, 0)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
        'image/png',
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The chart could not be rendered as an image'))
    }
    image.src = url
  })
}
