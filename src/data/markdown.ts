/**
 * The comparison as Markdown: what changed between consecutive rankings, then the table of
 * ranks. Pure text, so the same function serves the export and a test in Node.
 * @module
 */
import { changesBetween, compareRows, describeChange } from './insights.js'
import type { RankingDoc, TopicDoc } from './model.js'

/** Escapes the characters that would break a table cell or start formatting. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export interface MarkdownOptions {
  /** Shown in the heading, e.g. the session name. */
  title?: string
  /** `YYYY-MM-DD` → display; defaults to the date as is. */
  formatDate?: (date: string) => string
}

export function compareToMarkdown(
  ordered: readonly RankingDoc[],
  topics: ReadonlyMap<string, TopicDoc>,
  options: MarkdownOptions = {},
): string {
  const fmt = options.formatDate ?? ((date) => date)
  const lines: string[] = []
  lines.push(`# ${options.title ? `${options.title}: ` : ''}${ordered.length} rankings compared`)
  if (ordered.length > 0) {
    lines.push('', `${fmt(ordered[0]!.date)} to ${fmt(ordered[ordered.length - 1]!.date)}.`)
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    const changes = changesBetween(previous, current).filter((change) => change.kind !== 'same')
    const unchanged = current.items.length - changes.filter((c) => c.kind !== 'gone').length
    lines.push('', `## ${previous.name} → ${current.name}`, '')
    if (changes.length === 0) lines.push('Nothing moved.')
    for (const change of changes) {
      lines.push(
        `- ${describeChange(change, topics.get(change.topicId)?.title ?? 'Unknown topic')}`,
      )
    }
    if (changes.length > 0 && unchanged > 0) lines.push(`- ${unchanged} unchanged`)
  }
  const rows = compareRows(ordered, topics)
  lines.push('', '## Ranks', '')
  lines.push(`| Topic | ${ordered.map((r) => `${cell(r.name)} (${fmt(r.date)})`).join(' | ')} |`)
  lines.push(`|---|${ordered.map(() => '---:').join('|')}|`)
  for (const row of rows) {
    const cells = row.ranks.map((rank, index) => {
      if (rank === undefined) return '—'
      const previous = index === 0 ? undefined : row.ranks[index - 1]
      if (previous === undefined || previous === rank) return String(rank)
      const delta = previous - rank
      return `${rank} (${delta > 0 ? '↑' : '↓'}${Math.abs(delta)})`
    })
    lines.push(`| ${cell(row.title)} | ${cells.join(' | ')} |`)
  }
  return `${lines.join('\n')}\n`
}
