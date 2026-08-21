export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }

    let settled = false
    const settle = (operation: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      operation()
    }
    const onAbort = () => settle(() => reject(abortError()))
    const timer = setTimeout(() => settle(resolve), ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError(): DOMException {
  return new DOMException('Cancelled', 'AbortError')
}
