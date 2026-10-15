/**
 * Events the views send up to `<rv-app>`, which owns dialogs and notices.
 * @module
 */
import type { RankingDoc, Tier, TopicDoc } from '../data/model.js'
import type { ExportFile } from '../data/transfer.js'

export type DialogRequest =
  | { kind: 'new-session' }
  | { kind: 'rename-session' }
  | { kind: 'delete-session' }
  | { kind: 'new-ranking' }
  | { kind: 'edit-ranking'; ranking: RankingDoc }
  | { kind: 'delete-ranking'; ranking: RankingDoc }
  | { kind: 'new-topic' }
  | { kind: 'edit-topic'; topic: TopicDoc }
  | { kind: 'delete-topic'; topic: TopicDoc; ranking?: RankingDoc }
  | { kind: 'new-tier'; ranking: RankingDoc }
  | { kind: 'rename-tier'; ranking: RankingDoc; tier: Tier }
  | { kind: 'remove-tier'; ranking: RankingDoc; tier: Tier }
  | { kind: 'settings' }
  | { kind: 'import'; file: ExportFile; clashes: string[] }

/** An action just done that can be put back, offered to the user for a few seconds. */
export interface UndoOffer {
  message: string
  undo: () => Promise<void>
}

export function offerUndo(target: EventTarget, offer: UndoOffer): void {
  target.dispatchEvent(
    new CustomEvent<UndoOffer>('rv-undo', { detail: offer, bubbles: true, composed: true }),
  )
}

export interface Notice {
  variant: 'success' | 'danger' | 'warning' | 'brand'
  message: string
}

export function requestDialog(target: EventTarget, request: DialogRequest): void {
  target.dispatchEvent(
    new CustomEvent<DialogRequest>('rv-dialog', { detail: request, bubbles: true, composed: true }),
  )
}

export function notify(target: EventTarget, notice: Notice): void {
  target.dispatchEvent(
    new CustomEvent<Notice>('rv-notice', { detail: notice, bubbles: true, composed: true }),
  )
}

/** Runs a store write, turning a thrown error into a notice instead of an unhandled rejection. */
export async function attempt(
  target: EventTarget,
  action: () => Promise<unknown>,
  success?: string,
): Promise<boolean> {
  try {
    await action()
    if (success) notify(target, { variant: 'success', message: success })
    return true
  } catch (error) {
    notify(target, {
      variant: 'danger',
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
