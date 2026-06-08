// Catalog driving the docs left sidebar and per-model spec pages.
// One entry per documented model; the spec UI is shared across all entries
// in the same category (OpenAI-compatible chat = one schema, async-task
// image / video = another schema).

export type DocCategory = 'overview' | 'chat' | 'image' | 'video'

export type DocItem = {
  slug: string
  name: string
  /** Optional i18n key for the sidebar label. Falls back to `name` when absent. */
  nameKey?: string
  family?: string
  category: DocCategory
  badge?: 'new' | 'beta'
  short?: string
}

export type DocSection = {
  id: DocCategory
  /** i18n key for the section heading */
  titleKey: string
  items: DocItem[]
}

export const DOCS: DocSection[] = [
  {
    id: 'overview',
    titleKey: 'docs.sidebar.overview',
    items: [
      { slug: 'quickstart', name: 'Quickstart', nameKey: 'docs.sidebar.items.quickstart', category: 'overview' },
      { slug: 'authentication', name: 'Authentication', nameKey: 'docs.sidebar.items.authentication', category: 'overview' },
      { slug: 'errors', name: 'Errors', nameKey: 'docs.sidebar.items.errors', category: 'overview' },
      { slug: 'rate-limits', name: 'Rate limits', nameKey: 'docs.sidebar.items.rateLimits', category: 'overview' },
    ],
  },
  {
    id: 'chat',
    titleKey: 'docs.sidebar.chat',
    items: [
      { slug: 'gpt-5-2', name: 'gpt-5.2', family: 'OpenAI', category: 'chat', badge: 'new' },
      { slug: 'claude-opus-4-6', name: 'claude-opus-4-6', family: 'Anthropic', category: 'chat' },
      { slug: 'gemini-2-5-pro', name: 'gemini-2.5-pro', family: 'Google', category: 'chat' },
      { slug: 'deepseek-v4', name: 'deepseek-v4', family: 'DeepSeek', category: 'chat' },
      { slug: 'qwen-3-max', name: 'qwen-3-max', family: 'Alibaba', category: 'chat' },
    ],
  },
  {
    id: 'image',
    titleKey: 'docs.sidebar.image',
    items: [
      { slug: 'flux-1-1-pro', name: 'flux-1.1-pro', family: 'Black Forest Labs', category: 'image' },
      { slug: 'gpt-image-2', name: 'gpt-image-2', family: 'OpenAI', category: 'image' },
      { slug: 'sd-3-5', name: 'sd-3.5', family: 'Stability AI', category: 'image' },
    ],
  },
  {
    id: 'video',
    titleKey: 'docs.sidebar.video',
    items: [
      { slug: 'veo-3-1', name: 'veo-3.1', family: 'Google', category: 'video', badge: 'new' },
      { slug: 'sora-2', name: 'sora-2', family: 'OpenAI', category: 'video' },
      { slug: 'kling-2-5', name: 'kling-2.5', family: 'Kuaishou', category: 'video' },
    ],
  },
]

export function findChatModel(slug: string): DocItem | undefined {
  return DOCS.find((s) => s.id === 'chat')?.items.find((i) => i.slug === slug)
}

export function categoryLabel(c: DocCategory): string {
  return c === 'overview' ? 'Overview' : c === 'chat' ? 'Chat' : c === 'image' ? 'Image' : 'Video'
}
