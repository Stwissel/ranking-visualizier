import { html, nothing } from 'lit'
import { DEFAULT_COLOURS, parseTopicLines } from '../../data/model.js'
import { DialogElement, formValues } from './base.js'

/**
 * Title, colour and description of a topic. Emits `rv-submit` with
 * `{ title, colour, description }`.
 */
export class RvTopicDialog extends DialogElement {
  static override properties = {
    label: { type: String },
    title: { type: String },
    colour: { type: String },
    description: { type: String },
    /** Whether a newest ranking exists that the description goes into right away. */
    ranked: { type: Boolean },
    editing: { type: Boolean },
    submitLabel: { type: String },
    many: { state: true },
  }

  label = 'New topic'
  override title = ''
  colour = DEFAULT_COLOURS[0] ?? '#2563eb'
  description = ''
  ranked = false
  editing = false
  submitLabel = 'Create'
  /** Several topics at once, one per line. Only offered when creating. */
  many = false

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const values = formValues(event.target as HTMLFormElement)
    if (this.many) {
      const lines = parseTopicLines(values.lines ?? '')
      if (lines.length === 0) return
      this.emit('rv-submit-many', { lines })
      this.close()
      return
    }
    const { title, colour, description } = values
    if (!title?.trim() || !colour) return
    this.emit('rv-submit', { title: title.trim(), colour, description: description ?? '' })
    this.close()
  }

  override render() {
    return html`
      <wa-dialog open label=${this.label} @wa-after-hide=${this.onAfterHide}>
        <form id="rv-topic-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          ${
            this.editing
              ? nothing
              : html`<wa-switch
                  ?checked=${this.many}
                  @change=${(e: Event) => {
                    this.many = (e.target as HTMLInputElement).checked
                  }}
                  >Several at once</wa-switch
                >`
          }
          ${this.many ? this.renderMany() : this.renderOne()}
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-topic-form">${this.submitLabel}</wa-button>
      </wa-dialog>
    `
  }

  private renderMany() {
    return html`<wa-textarea
      name="lines"
      label="Topics"
      hint="One per line. Add a description after a pipe: Title | why it matters. Colours are assigned in order."
      rows="6"
      resize="auto"
      placeholder="Platform reliability | keeps the lights on&#10;Mobile app&#10;Billing revamp"
      required
      autofocus
    ></wa-textarea>`
  }

  private renderOne() {
    return html`<wa-input name="title" label="Title" .value=${this.title} required autofocus></wa-input>
          <wa-color-picker
            name="colour"
            label="Colour"
            format="hex"
            without-format-toggle
            .value=${this.colour}
            .swatches=${[...DEFAULT_COLOURS]}
          ></wa-color-picker>
          <wa-textarea
            name="description"
            label="Description"
            hint=${
              this.editing
                ? 'Only used when the topic next enters a ranking; rankings keep their own text.'
                : this.ranked
                  ? 'Goes into the newest ranking now. Each ranking keeps its own copy from then on.'
                  : 'Used when the topic enters its first ranking.'
            }
            rows="2"
            resize="auto"
            .value=${this.description}
          ></wa-textarea>`
  }
}

customElements.define('rv-topic-dialog', RvTopicDialog)
