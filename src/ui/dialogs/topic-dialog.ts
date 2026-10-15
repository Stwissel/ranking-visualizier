import { html } from 'lit'
import { DEFAULT_COLOURS } from '../../data/model.js'
import { DialogElement, formValues } from './base.js'

/**
 * Title and colour of a topic, plus the description for the newest ranking when creating.
 * Emits `rv-submit` with `{ title, colour, description }`.
 */
export class RvTopicDialog extends DialogElement {
  static override properties = {
    label: { type: String },
    title: { type: String },
    colour: { type: String },
    withDescription: { type: Boolean },
    submitLabel: { type: String },
  }

  label = 'New topic'
  override title = ''
  colour = DEFAULT_COLOURS[0] ?? '#2563eb'
  withDescription = false
  submitLabel = 'Create'

  private onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    const { title, colour, description } = formValues(event.target as HTMLFormElement)
    if (!title?.trim() || !colour) return
    this.emit('rv-submit', { title: title.trim(), colour, description: description ?? '' })
    this.close()
  }

  override render() {
    return html`
      <wa-dialog open label=${this.label} @wa-after-hide=${this.onAfterHide}>
        <form id="rv-topic-form" class="wa-stack wa-gap-m" @submit=${this.onSubmit}>
          <wa-input name="title" label="Title" .value=${this.title} required autofocus></wa-input>
          <wa-color-picker
            name="colour"
            label="Colour"
            format="hex"
            without-format-toggle
            .value=${this.colour}
            .swatches=${[...DEFAULT_COLOURS]}
          ></wa-color-picker>
          ${
            this.withDescription
              ? html`<wa-textarea
                  name="description"
                  label="Description in the current ranking"
                  hint="Descriptions belong to a ranking; title and colour are shared."
                  rows="2"
                  resize="auto"
                ></wa-textarea>`
              : ''
          }
        </form>
        <wa-button slot="footer" appearance="plain" data-dialog="close">Cancel</wa-button>
        <wa-button slot="footer" variant="brand" type="submit" form="rv-topic-form">${this.submitLabel}</wa-button>
      </wa-dialog>
    `
  }
}

customElements.define('rv-topic-dialog', RvTopicDialog)
