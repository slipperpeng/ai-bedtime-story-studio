export type FailureContext = 'local-voice' | 'online-voice' | 'system-voice-preview' | 'story'

const WINDOWS_LINK_ERROR = /winerror\s*1314|required privilege is not held|客户端没有所需的特权|symbolic link|symlink/i
const NETWORK_ERROR = /timed?\s*out|timeout|connection(?:error|refused|reset)?|name resolution|network error|无法连接|网络连接|下载(?:失败|中断|超时)/i
const TECHNICAL_DETAIL = /traceback|(?:^|\s)file\s+["']|[a-z]:\\|\/(?:users|home|tmp|private|opt)\/|\.py\b|winerror|errno|huggingface|exception|(?:runtime|os|value|type|import|module_?not_?found)error|localhost:\d+|\bsk-[a-z0-9_-]+/i
const CHINESE_TEXT = /[\u3400-\u9fff]/

export function neutralizeProviderBrand(message: string): string {
  return message
    .replace(/MiniMax-M\d+/g, '在线模型')
    .replace(/MiniMax\s*API Key/g, '在线服务 API Key')
    .replace(/MiniMax\s*TTS/g, '在线语音服务')
    .replace(/MiniMax\s*在线音色/g, '在线音色')
    .replace(/MiniMax\s*在线语音/g, '在线语音')
    .replace(/MiniMax\s*内置中文音色/g, '内置中文音色')
    .replace(/MiniMax\s*内置音色/g, '内置音色')
    .replace(/MiniMax\s*音色/g, '在线音色')
    .replace(/MiniMax\s*故事/g, '在线故事')
    .replace(/MiniMax\s*插图/g, '插图')
    .replace(/MiniMax\s*账户/g, '在线服务账户')
    .replace(/MiniMax\s*服务/g, '在线服务')
    .replace(/MiniMax\s*设置/g, '生成设置')
    .replace(/MiniMax\s*密钥/g, 'API Key')
    .replace(/MiniMax\s*返回/g, '在线服务返回')
    .replace(/\s*MiniMax\s*/g, '在线服务')
}

export function userFacingFailure(error: unknown, context: FailureContext): string {
  const message = typeof error === 'string'
    ? error.trim()
    : error instanceof Error ? error.message.trim() : ''

  if (context === 'local-voice') {
    if (WINDOWS_LINK_ERROR.test(message)) {
      return '已经下载的内容会保留。请先完全退出应用，再重新打开并重试；重试时会继续复用现有内容。如果仍出现相同错误，可在 Windows“设置 > 系统 > 开发者选项”中开启“开发人员模式”，或在应用设置中导入离线模型套装。'
    }
    if (NETWORK_ERROR.test(message)) {
      return '模型下载没有完成。请检查网络后重试；已下载的内容会保留，并从现有缓存继续。也可以在设置中导入离线模型套装。'
    }
    if (!message || TECHNICAL_DETAIL.test(message) || !CHINESE_TEXT.test(message)) {
      return '本机音色准备失败。请重新打开应用后重试；已下载的模型缓存会保留。若仍失败，可以在设置中导入离线模型套装。'
    }
  }

  if (context === 'online-voice' && (!message || TECHNICAL_DETAIL.test(message) || !CHINESE_TEXT.test(message))) {
    return '在线音色复刻失败。请检查网络、API Key、账户权限和余额后重试。'
  }

  if (context === 'system-voice-preview' && (!message || TECHNICAL_DETAIL.test(message) || !CHINESE_TEXT.test(message))) {
    return '内置音色试听失败。请检查网络、API Key、账户语音权限和余额后重试。'
  }

  if (context === 'story' && (!message || TECHNICAL_DETAIL.test(message) || !CHINESE_TEXT.test(message))) {
    return '本次制作没有完成。请检查模型设置和网络后重试；已经完成的步骤会保留。'
  }

  return neutralizeProviderBrand(message || '任务没有完成，请稍后重试。')
}
