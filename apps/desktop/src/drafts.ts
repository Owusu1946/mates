const storageKey = 'mates.request-drafts.v1'

export type Draft = {
  id: string
  mate: string
  text: string
  updatedAt: number
}

function isDraft(value: unknown): value is Draft {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'mate' in value && typeof value.mate === 'string'
    && 'text' in value && typeof value.text === 'string'
    && 'updatedAt' in value && typeof value.updatedAt === 'number'
    && Number.isFinite(new Date(value.updatedAt).getTime())
}

export function loadDrafts(): Draft[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(saved) ? saved.filter(isDraft) : []
  } catch {
    return []
  }
}

export function storeDrafts(drafts: Draft[]) {
  localStorage.setItem(storageKey, JSON.stringify(drafts))
}
