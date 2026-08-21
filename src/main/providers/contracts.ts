import type { StoryPackage } from '../../shared/schemas'
import type { StoryProject, StoryStyleBible } from '../../shared/contracts'

export interface ProviderRunContext {
  signal: AbortSignal
  report(progress: number, message: string): void
}

export interface StoryProvider {
  generate(project: StoryProject, context: ProviderRunContext): Promise<StoryPackage>
}

export interface GeneratedImage {
  bytes: Buffer
  mimeType: string
  extension: string
}

export interface ImageProvider {
  generate(input: {
    title: string
    prompt: string
    alt: string
    styleBible: StoryStyleBible
    chapterIndex: number
  }, context: ProviderRunContext): Promise<GeneratedImage>
}

export interface GeneratedMusic {
  bytes: Buffer
  mimeType: 'audio/mpeg' | 'audio/wav'
  extension: 'mp3' | 'wav'
}

export interface MusicProvider {
  generate(input: {
    title: string
    prompt: string
  }, context: ProviderRunContext): Promise<GeneratedMusic>
}
