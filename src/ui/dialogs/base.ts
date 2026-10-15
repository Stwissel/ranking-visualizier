/**
 * What every dialog here shares: light DOM, an `open` state and a `rv-close` event once the
 * closing animation finished so the parent can drop it from the tree.
 * @module
 */
import { LitElement } from 'lit'

export abstract class DialogElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this
  }

  /** Only the dialog's own hide: a nested element can fire the same event name. */
  protected onAfterHide = (event: Event): void => {
    if (event.target !== event.currentTarget) return
    this.dispatchEvent(new CustomEvent('rv-close', { bubbles: true, composed: true }))
  }

  protected close(): void {
    const dialog = this.querySelector('wa-dialog') as (HTMLElement & { open: boolean }) | null
    if (dialog) dialog.open = false
    else this.dispatchEvent(new CustomEvent('rv-close', { bubbles: true, composed: true }))
  }

  protected emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }))
  }
}

/** Reads a form's named controls as strings. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of new FormData(form)) values[key] = String(value)
  return values
}
