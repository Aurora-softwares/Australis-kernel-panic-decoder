import { contextLabels, normaliseContext } from './recovery.js'

export function safeContextBlock(context) {
  const c = normaliseContext(context)
  const labels = contextLabels(c)
  return ['### Additional context (optional)',
    `- When did it happen? ${labels.stage}`,
    `- What were you doing? ${labels.activity}`,
    `- Has it happened before? ${labels.recurrence}`,
  ].join('\n')
}
