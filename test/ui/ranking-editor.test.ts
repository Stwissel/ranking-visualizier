import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/icon/icon.js'
import '@awesome.me/webawesome/dist/components/textarea/textarea.js'
import '@awesome.me/webawesome/dist/components/tag/tag.js'
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js'
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js'
import '../../src/ui/styles/app.css'
import '../../src/ui/ranking-editor.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'
import { shortId } from '../../src/data/model.js'
import type { Store } from '../../src/data/store.js'
import type { RvRankingEditor } from '../../src/ui/ranking-editor.js'
import { browserStore, until } from './support/browser-store.js'

const opened: Store[] = []

afterEach(async () => {
  document.body.replaceChildren()
  await Promise.all(opened.splice(0).map((store) => store.db.destroy()))
})

async function mount() {
  const store = browserStore()
  opened.push(store)
  const session = await store.createSession('S')
  const sid = shortId(session._id)
  const topics: TopicDoc[] = []
  for (const [title, colour] of [
    ['Alpha', '#2a78d6'],
    ['Beta', '#eb6834'],
    ['Gamma', '#1baf7a'],
  ] as const) {
    topics.push(await store.createTopic(sid, { title, colour }))
  }
  const ranking = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
  const editor = document.createElement('rv-ranking-editor') as RvRankingEditor
  editor.store = store
  editor.sid = sid
  editor.ranking = ranking
  editor.topics = new Map(topics.map((topic) => [shortId(topic._id), topic]))
  editor.rankings = [ranking]
  document.body.append(editor)
  await editor.updateComplete
  return { store, sid, editor, ranking }
}

function titles(editor: HTMLElement): string[] {
  return [...editor.querySelectorAll('.rv-rank-title')].map((el) => el.textContent?.trim() ?? '')
}

describe('<rv-ranking-editor>', () => {
  it('renders one numbered row per item in rank order with the topic colour', async () => {
    const { editor } = await mount()
    expect(titles(editor)).toEqual(['Alpha', 'Beta', 'Gamma'])
    const numbers = [...editor.querySelectorAll('.rv-rank-number')].map((el) =>
      el.textContent?.trim(),
    )
    expect(numbers).toEqual(['1', '2', '3'])
    const first = editor.querySelector<HTMLElement>('.rv-rank-item')!
    expect(first.style.getPropertyValue('--rv-colour')).toBe('#2a78d6')
    expect(editor.querySelector('.rv-rank-list')).toBeTruthy()
  })

  it('moves a topic down with the arrow button and persists the new order', async () => {
    const { store, sid, editor, ranking } = await mount()
    const down = editor
      .querySelectorAll<HTMLElement>('.rv-rank-item')[0]!
      .querySelectorAll('wa-button')[1]!
    down.click()
    let stored: RankingDoc | undefined
    await until(() => {
      void store.getRanking(sid, shortId(ranking._id)).then((doc) => {
        stored = doc
      })
      return stored?.items[0]?.topicId === ranking.items[1]?.topicId
    })
    expect(stored!.items.map((item) => item.topicId)).toEqual([
      ranking.items[1]!.topicId,
      ranking.items[0]!.topicId,
      ranking.items[2]!.topicId,
    ])
    // The app would push the new ranking back in; simulate that and check the view follows.
    editor.ranking = stored!
    await editor.updateComplete
    expect(titles(editor)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(editor.querySelector('[role=status]')?.textContent).toContain(
      'Moved Alpha to position 2 of 3',
    )
  })

  it('saves a description for this ranking only', async () => {
    const { store, sid, editor, ranking } = await mount()
    const textarea = editor.querySelector<HTMLElement & { value: string }>('wa-textarea')!
    textarea.value = 'top of the list'
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => false, 150).catch(() => undefined)
    const stored = await store.getRanking(sid, shortId(ranking._id))
    expect(stored.items[0]?.description).toBe('top of the list')
    expect(stored.items[1]?.description).toBe('')
  })
})
