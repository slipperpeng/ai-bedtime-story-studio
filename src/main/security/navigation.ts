export type RendererUrlPolicy = (candidateUrl: string) => boolean

export function createRendererUrlPolicy(entryUrl: string): RendererUrlPolicy {
  const entry = new URL(entryUrl)
  if (entry.protocol === 'file:') {
    return (candidateUrl) => {
      try {
        const candidate = new URL(candidateUrl)
        return candidate.protocol === 'file:'
          && candidate.host === entry.host
          && candidate.pathname === entry.pathname
      } catch {
        return false
      }
    }
  }

  return (candidateUrl) => {
    try {
      const candidate = new URL(candidateUrl)
      return candidate.protocol === entry.protocol && candidate.origin === entry.origin
    } catch {
      return false
    }
  }
}
