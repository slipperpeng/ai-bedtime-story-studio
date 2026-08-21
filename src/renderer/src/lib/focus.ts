export function focusWrapTarget<T>(items: readonly T[], active: T | null, backwards: boolean): T | undefined {
  if (!items.length) return undefined
  const activeIndex = active === null ? -1 : items.indexOf(active)
  if (backwards && activeIndex <= 0) return items[items.length - 1]
  if (!backwards && (activeIndex < 0 || activeIndex === items.length - 1)) return items[0]
  return undefined
}
