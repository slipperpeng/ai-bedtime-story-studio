import type { BedtimeApi } from '../../shared/contracts'

declare global {
  interface Window {
    bedtime: BedtimeApi
  }
}

export {}
