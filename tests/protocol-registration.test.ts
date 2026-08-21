import { describe, expect, it, vi } from 'vitest'
import { clearProtocolHandlerIfRegistered } from '../src/main/protocol-registration'

describe('protocol registration lifecycle', () => {
  it('does not unhandle a protocol before its first registration', () => {
    const unhandle = vi.fn()

    clearProtocolHandlerIfRegistered({
      isProtocolHandled: () => false,
      unhandle,
    }, 'story-asset')

    expect(unhandle).not.toHaveBeenCalled()
  })

  it('clears an existing protocol handler before window recreation', () => {
    const unhandle = vi.fn()

    clearProtocolHandlerIfRegistered({
      isProtocolHandled: () => true,
      unhandle,
    }, 'story-asset')

    expect(unhandle).toHaveBeenCalledOnce()
    expect(unhandle).toHaveBeenCalledWith('story-asset')
  })
})
