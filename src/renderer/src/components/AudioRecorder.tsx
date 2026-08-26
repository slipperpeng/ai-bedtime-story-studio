import { Check, Mic, RotateCcw, Square, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  AudioLimitError,
  blobToMonoWav,
  guidedSampleIssue,
  guidedSegmentIssue,
  mergePreparedAudio,
  recordedAudioIssue,
  type PreparedAudio,
} from '../lib/audio'
import {
  RecordingSessionGate,
  RecordingSignalDetector,
  type RecordingPhase,
} from '../lib/recording-session'

interface AudioRecorderProps {
  value?: PreparedAudio
  onChange(value?: PreparedAudio): void
  maxSeconds?: number
  acceptLabel?: string
  guided?: boolean
  language?: 'zh' | 'en'
}

type GuidedStatus = 'pending' | 'starting' | 'recording' | 'processing' | 'ready' | 'error'
type StopReason = 'manual' | 'automatic' | 'limit' | 'no-input' | 'device-ended' | 'device-muted' | 'recorder-error'

interface GuidedSegment {
  status: GuidedStatus
  audio?: PreparedAudio
  error?: string
}

interface CaptureSession {
  token: number
  stream: MediaStream
  track: MediaStreamTrack
  recorder: MediaRecorder
  chunks: Blob[]
  segmentIndex?: number
  startedAt: number
  context?: AudioContext
  detector?: RecordingSignalDetector
  animationId?: number
  timerId?: number
  stopTimerId?: number
  muteTimerId?: number
  stopReason?: StopReason
  trackEndedListener: () => void
  trackMuteListener: () => void
  trackUnmuteListener: () => void
}

export const GUIDED_CHINESE_SCRIPTS = [
  { title: '自然讲述', text: '傍晚，我看见星星从云后露出来。' },
  { title: '问答与回应', text: '“树叶为什么笑？”我说：“晚风来啦。”' },
  { title: '安静收束', text: '关好小灯，互道晚安，故事慢慢停下。' },
] as const

export const GUIDED_CHINESE_REFERENCE_TEXT = GUIDED_CHINESE_SCRIPTS.map((script) => script.text).join(' ')

export const GUIDED_ENGLISH_SCRIPTS = [
  { title: 'Natural narration', text: 'At dusk, I watched the first star peek out from behind a silver cloud.' },
  { title: 'Question and answer', text: '“Why are the leaves laughing?” I asked. “The evening breeze is here.”' },
  { title: 'A quiet goodnight', text: 'We dimmed the little lamp, said goodnight, and let the story drift to sleep.' },
] as const

export const GUIDED_ENGLISH_REFERENCE_TEXT = GUIDED_ENGLISH_SCRIPTS.map((script) => script.text).join(' ')

const SEGMENT_GAP_MS = 250
const GUIDED_SEGMENT_MAX_MS = 9_800

export function AudioRecorder({
  value,
  onChange,
  maxSeconds = 30,
  acceptLabel = 'WAV、MP3、M4A 或 WebM',
  guided: guidedOption,
  language = guidedOption === false ? 'en' : 'zh',
}: AudioRecorderProps) {
  const isEn = language === 'en'
  const guided = guidedOption ?? maxSeconds <= 30
  const guidedScripts = isEn ? GUIDED_ENGLISH_SCRIPTS : GUIDED_CHINESE_SCRIPTS
  const guidedReferenceText = isEn ? GUIDED_ENGLISH_REFERENCE_TEXT : GUIDED_CHINESE_REFERENCE_TEXT
  const [phase, setPhase] = useState<RecordingPhase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [signalLabel, setSignalLabel] = useState(isEn ? 'Checking microphone…' : '正在检测麦克风声音…')
  const [error, setError] = useState('')
  const [activeSegment, setActiveSegment] = useState<number>()
  const [segments, setSegments] = useState<GuidedSegment[]>(() => createGuidedSegments(guidedScripts.length))
  const gateRef = useRef(new RecordingSessionGate())
  const sessionRef = useRef<CaptureSession | undefined>(undefined)
  const segmentsRef = useRef(segments)
  const mountedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const previousValueRef = useRef(value)
  const internallyClearedValueRef = useRef<PreparedAudio | undefined>(undefined)

  onChangeRef.current = onChange

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      gateRef.current.cancel()
      if (sessionRef.current) disposeCapture(sessionRef.current, true)
      revokeSegmentPreviews(segmentsRef.current)
    }
  }, [])

  useEffect(() => {
    const previousValue = previousValueRef.current
    previousValueRef.current = value
    if (!guided || previousValue === undefined) return
    if (value !== undefined) {
      if (internallyClearedValueRef.current && value !== internallyClearedValueRef.current) {
        internallyClearedValueRef.current = undefined
      }
      return
    }
    if (internallyClearedValueRef.current === previousValue) {
      internallyClearedValueRef.current = undefined
      return
    }
    internallyClearedValueRef.current = undefined
    revokeSegmentPreviews(segmentsRef.current)
    const reset = createGuidedSegments(guidedScripts.length)
    segmentsRef.current = reset
    setSegments(reset)
  }, [guided, guidedScripts.length, value])

  const commitSegments = (update: (current: GuidedSegment[]) => GuidedSegment[]): GuidedSegment[] => {
    const next = update(segmentsRef.current)
    segmentsRef.current = next
    if (mountedRef.current) setSegments(next)
    return next
  }

  const startCapture = async (segmentIndex?: number) => {
    const token = gateRef.current.begin()
    if (token === undefined || (guided && segmentIndex === undefined)) return
    setPhase('starting')
    setActiveSegment(segmentIndex)
    setError('')
    setSignalLabel(isEn ? 'Connecting to microphone…' : '正在连接麦克风…')
    if (segmentIndex !== undefined) {
      commitSegments((current) => current.map((segment, index) => index === segmentIndex
        ? { ...segment, status: 'starting', error: undefined }
        : segment))
      if (value) {
        internallyClearedValueRef.current = value
        onChangeRef.current(undefined)
      }
    }

    let stream: MediaStream | undefined
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Microphone API unavailable', 'NotSupportedError')
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      if (!gateRef.current.isCurrent(token)) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const track = stream.getAudioTracks()[0]
      if (!track || track.readyState === 'ended') throw new DOMException('No live microphone track', 'NotFoundError')
      const recorder = createMediaRecorder(stream)
      const startedAt = performance.now()
      const session: CaptureSession = {
        token,
        stream,
        track,
        recorder,
        chunks: [],
        segmentIndex,
        startedAt,
        trackEndedListener: () => requestSessionStop(session, 'device-ended'),
        trackMuteListener: () => scheduleMutedDeviceCheck(session),
        trackUnmuteListener: () => clearMutedDeviceCheck(session),
      }
      sessionRef.current = session
      track.addEventListener('ended', session.trackEndedListener)
      track.addEventListener('mute', session.trackMuteListener)
      track.addEventListener('unmute', session.trackUnmuteListener)
      recorder.ondataavailable = (event) => {
        if (event.data.size) session.chunks.push(event.data)
      }
      recorder.onerror = () => requestSessionStop(session, 'recorder-error')
      recorder.onstop = () => void processStoppedCapture(session)
      recorder.start(250)
      if (!gateRef.current.transition(token, 'recording')) {
        disposeCapture(session, true)
        return
      }

      if (segmentIndex !== undefined) {
        commitSegments((current) => current.map((segment, index) => index === segmentIndex
          ? { ...segment, status: 'recording', error: undefined }
          : segment))
      }

      setSeconds(0)
      setLevel(0)
      setSignalLabel(isEn ? 'Start speaking; the meter will move when sound is detected.' : '请开始朗读，检测到声音后电平会跳动')
      setPhase('recording')
      startMeter(session)
      session.timerId = window.setInterval(() => {
        if (mountedRef.current) setSeconds(Math.floor((performance.now() - session.startedAt) / 1_000))
      }, 250)
      const captureLimitMs = guided ? guidedSegmentLimitMs(maxSeconds) : maxSeconds * 1_000
      session.stopTimerId = window.setTimeout(() => requestSessionStop(session, 'limit'), captureLimitMs)
      if (track.muted) scheduleMutedDeviceCheck(session)
    } catch (reason) {
      if (sessionRef.current?.token === token) disposeCapture(sessionRef.current, true)
      else stream?.getTracks().forEach((track) => track.stop())
      const message = microphoneErrorMessage(reason, language)
      if (gateRef.current.release(token) && mountedRef.current) {
        setPhase('idle')
        setActiveSegment(undefined)
        if (segmentIndex !== undefined) {
          const next = commitSegments((current) => current.map((segment, index) => index === segmentIndex
            ? segmentFailure(segment, message, language)
            : segment))
          publishGuidedSample(next)
        } else {
          setError(message)
        }
      }
    }
  }

  const processStoppedCapture = async (session: CaptureSession) => {
    if (!gateRef.current.transition(session.token, 'processing')) {
      disposeCapture(session, false)
      return
    }
    const guidedLimitMs = session.segmentIndex === undefined ? undefined : guidedSegmentLimitMs(maxSeconds)
    const failure = stopFailureMessage(session.stopReason, guidedLimitMs, language)
    disposeCapture(session, false)
    if (mountedRef.current) {
      setPhase('processing')
      setLevel(0)
      setSignalLabel(isEn ? 'Checking this recording…' : '正在检查这段录音…')
      if (session.segmentIndex !== undefined) {
        commitSegments((current) => current.map((segment, index) => index === session.segmentIndex
          ? { ...segment, status: 'processing', error: undefined }
          : segment))
      }
    }

    try {
      if (failure) throw new AudioLimitError(failure)
      if (session.chunks.length === 0) throw new AudioLimitError(isEn ? 'No recording data was received. Please try again.' : '没有收到录音数据，请重新录制。')
      const captureLimitSeconds = guided ? guidedSegmentLimitMs(maxSeconds) / 1_000 + 0.25 : maxSeconds
      const prepared = await blobToMonoWav(new Blob(session.chunks, { type: session.recorder.mimeType }), {
        maxSeconds: captureLimitSeconds,
        language,
      })
      if (!gateRef.current.isCurrent(session.token)) {
        URL.revokeObjectURL(prepared.previewUrl)
        return
      }

      if (session.segmentIndex === undefined) {
        const issue = recordedAudioIssue(prepared, language)
        if (issue) {
          URL.revokeObjectURL(prepared.previewUrl)
          throw new AudioLimitError(issue)
        }
        onChangeRef.current(prepared)
      } else {
        const issue = guidedSegmentIssue(prepared, language)
        if (issue) {
          URL.revokeObjectURL(prepared.previewUrl)
          throw new AudioLimitError(issue)
        }
        const previousAudio = segmentsRef.current[session.segmentIndex]?.audio
        const next = commitSegments((current) => current.map((segment, index) => index === session.segmentIndex
          ? { status: 'ready', audio: prepared }
          : segment))
        if (previousAudio && previousAudio.previewUrl !== prepared.previewUrl) URL.revokeObjectURL(previousAudio.previewUrl)
        publishGuidedSample(next)
      }
    } catch (reason) {
      const message = reason instanceof AudioLimitError ? reason.message : (isEn ? 'This recording could not be read. Please try again.' : '无法读取这段录音，请重新录制。')
      if (gateRef.current.isCurrent(session.token) && mountedRef.current) {
        if (session.segmentIndex !== undefined) {
          const next = commitSegments((current) => current.map((segment, index) => index === session.segmentIndex
            ? segmentFailure(segment, message, language)
            : segment))
          publishGuidedSample(next)
        } else {
          setError(message)
        }
      }
    } finally {
      if (gateRef.current.release(session.token) && mountedRef.current) {
        setPhase('idle')
        setActiveSegment(undefined)
        setSeconds(0)
      }
    }
  }

  const publishGuidedSample = (next: GuidedSegment[]) => {
    const recordings = next.map((segment) => segment.audio).filter((audio): audio is PreparedAudio => audio !== undefined)
    if (recordings.length !== guidedScripts.length) {
      setError('')
      return
    }
    const combined = mergePreparedAudio(recordings, SEGMENT_GAP_MS, guidedReferenceText)
    const issue = guidedSampleIssue(combined, maxSeconds * 1_000, language)
    if (issue) {
      URL.revokeObjectURL(combined.previewUrl)
      setError(issue)
      return
    }
    setError('')
    onChangeRef.current(combined)
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    const token = gateRef.current.begin()
    if (token === undefined) return
    gateRef.current.transition(token, 'processing')
    setPhase('processing')
    setError('')
    try {
      const maxBytes = maxSeconds > 30 ? 60 * 1024 * 1024 : 30 * 1024 * 1024
      const prepared = await blobToMonoWav(file, { maxSeconds, maxBytes, language })
      if (!gateRef.current.isCurrent(token)) {
        URL.revokeObjectURL(prepared.previewUrl)
        return
      }
      const issue = guided ? guidedSampleIssue(prepared, maxSeconds * 1_000, language) : recordedAudioIssue(prepared, language)
      if (issue) {
        URL.revokeObjectURL(prepared.previewUrl)
        throw new AudioLimitError(issue)
      }
      if (guided) {
        revokeSegmentPreviews(segmentsRef.current)
        const reset = createGuidedSegments(guidedScripts.length)
        segmentsRef.current = reset
        setSegments(reset)
      }
      onChangeRef.current(prepared)
    } catch (reason) {
      if (gateRef.current.isCurrent(token) && mountedRef.current) {
        setError(reason instanceof AudioLimitError ? reason.message : (isEn ? `The audio must play correctly and be no longer than ${maxSeconds} seconds.` : `音频需要能正常播放，且不超过 ${maxSeconds} 秒。`))
      }
    } finally {
      if (gateRef.current.release(token) && mountedRef.current) setPhase('idle')
      if (mountedRef.current && inputRef.current) inputRef.current.value = ''
    }
  }

  const clear = () => {
    internallyClearedValueRef.current = undefined
    if (guided) {
      revokeSegmentPreviews(segmentsRef.current)
      const reset = createGuidedSegments(guidedScripts.length)
      segmentsRef.current = reset
      setSegments(reset)
    }
    setError('')
    onChangeRef.current(undefined)
  }

  const startMeter = (session: CaptureSession) => {
    const context = new AudioContext()
    session.context = context
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(session.stream).connect(analyser)
    const values = new Float32Array(analyser.fftSize)
    const detector = new RecordingSignalDetector(performance.now())
    session.detector = detector
    void context.resume().catch(() => requestSessionStop(session, 'recorder-error'))

    const draw = () => {
      if (sessionRef.current !== session || !gateRef.current.isCurrent(session.token)) return
      analyser.getFloatTimeDomainData(values)
      let squares = 0
      for (const sample of values) squares += sample * sample
      const observation = detector.observe(Math.sqrt(squares / values.length), performance.now())
      if (mountedRef.current) {
        setLevel(observation.levelPercent)
        setSignalLabel(observation.heardSpeech
          ? guided
            ? (isEn ? 'Sound detected. Finish the line, then pause for about 2 seconds.' : '声音输入正常，读完后停顿约 2 秒即可完成')
            : (isEn ? 'Sound detected. Click stop when you finish.' : '声音输入正常，录制完成后请点击停止')
          : (isEn ? 'No voice detected yet. Move closer to the microphone.' : '尚未检测到声音，请靠近麦克风开始朗读'))
      }
      if (observation.action === 'no-input') requestSessionStop(session, 'no-input')
      else if (observation.action === 'complete' && guided) requestSessionStop(session, 'automatic')
      else session.animationId = requestAnimationFrame(draw)
    }
    draw()
  }

  function requestSessionStop(session: CaptureSession, reason: StopReason) {
    if (sessionRef.current !== session || session.stopReason) return
    session.stopReason = reason
    if (session.recorder.state !== 'inactive') session.recorder.stop()
  }

  function scheduleMutedDeviceCheck(session: CaptureSession) {
    clearMutedDeviceCheck(session)
    session.muteTimerId = window.setTimeout(() => {
      if (session.track.muted) requestSessionStop(session, 'device-muted')
    }, 1_500)
  }

  function clearMutedDeviceCheck(session: CaptureSession) {
    if (session.muteTimerId !== undefined) window.clearTimeout(session.muteTimerId)
    session.muteTimerId = undefined
  }

  function disposeCapture(session: CaptureSession, stopRecorder: boolean) {
    if (session.timerId !== undefined) window.clearInterval(session.timerId)
    if (session.stopTimerId !== undefined) window.clearTimeout(session.stopTimerId)
    if (session.animationId !== undefined) cancelAnimationFrame(session.animationId)
    clearMutedDeviceCheck(session)
    session.track.removeEventListener('ended', session.trackEndedListener)
    session.track.removeEventListener('mute', session.trackMuteListener)
    session.track.removeEventListener('unmute', session.trackUnmuteListener)
    session.recorder.onerror = null
    if (stopRecorder && session.recorder.state !== 'inactive') {
      session.recorder.ondataavailable = null
      session.recorder.onstop = null
      session.recorder.stop()
    }
    session.stream.getTracks().forEach((track) => track.stop())
    if (session.context && session.context.state !== 'closed') void session.context.close()
    if (sessionRef.current === session) sessionRef.current = undefined
    if (mountedRef.current) setLevel(0)
  }

  const recording = phase === 'recording'
  const busy = phase === 'starting' || phase === 'processing'

  if (!guided) {
    return <div className="audio-recorder">
      <div className="recorder-actions">
        {recording
          ? <button className="button danger" type="button" onClick={() => sessionRef.current && requestSessionStop(sessionRef.current, 'manual')}><Square size={17} />{isEn ? 'Stop recording' : '停止录音'} <span className="tabular">{formatTime(seconds)}</span></button>
          : <button className="button secondary" type="button" onClick={() => void startCapture()} disabled={phase !== 'idle'}><Mic size={17} />{phase === 'starting' ? (isEn ? 'Connecting…' : '正在连接…') : (isEn ? 'Start recording' : '开始录音')}</button>}
        <button className="icon-button" type="button" title={isEn ? 'Upload audio' : '上传音频'} aria-label={isEn ? 'Upload audio' : '上传音频'} onClick={() => inputRef.current?.click()} disabled={phase !== 'idle'}><Upload size={18} /></button>
        <input ref={inputRef} type="file" hidden accept="audio/*,.wav,.mp3,.m4a,.webm" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <span className="recorder-hint">{phase === 'starting' ? (isEn ? 'Requesting microphone permission…' : '正在请求麦克风权限…') : busy ? (isEn ? 'Processing audio…' : '正在处理音频…') : (isEn ? 'WAV, MP3, M4A, or WebM' : acceptLabel)}</span>
      </div>
      {recording && <MicrophoneMeter level={level} label={signalLabel} language={language} />}
      {value && <AudioPreview value={value} onClear={clear} label={isEn ? 'Recording preview' : '录音预览'} disabled={phase !== 'idle'} language={language} />}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  }

  const readyCount = segments.filter((segment) => segment.audio).length
  const uploadedSample = Boolean(value) && !segments.some((segment) => segment.audio)
  const completed = Boolean(value)

  return <div className="audio-recorder guided-recorder">
    <div className="guided-recorder-head">
      <div><strong>{isEn ? 'Three short recordings make a steadier voice' : '分三段建立更稳定的音色'}</strong><p>{isEn ? 'Read each line naturally and slowly as the same adult. Finish the line, then pause for about 2 seconds. A segment near 10 seconds is not saved; please record it again.' : '请由同一位成年人自然慢读每段短句，完整读完后停顿约 2 秒。单段达到约 10 秒时不会保存，请直接重录。'}</p></div>
      <span className={completed ? 'complete' : ''}>{completed ? <Check size={15} /> : null}{completed ? (isEn ? 'Sample ready' : '样本达标') : `${readyCount} / 3`}</span>
    </div>
    <div className="guided-progress" role="progressbar" aria-label={isEn ? 'Voice sample progress' : '音色样本录制进度'} aria-valuemin={0} aria-valuemax={3} aria-valuenow={completed ? 3 : readyCount}>
      <span style={{ width: `${completed ? 100 : (readyCount / 3) * 100}%` }} />
    </div>
    {!uploadedSample && <ol className="sample-script-list">
      {guidedScripts.map((script, index) => {
        const segment = segments[index]
        const isActive = activeSegment === index
        return <li className={`sample-script ${segment.status}`} key={script.title}>
          <div className="sample-index" aria-hidden="true">{segment.audio ? <Check size={14} /> : index + 1}</div>
          <div className="sample-content">
            <div className="sample-title"><strong>{script.title}</strong><span className="sample-status" aria-hidden="true">{guidedStatusLabel(segment.status, isActive ? seconds : undefined, guidedSegmentLimitMs(maxSeconds), language)}</span><span className="sr-only" role="status">{guidedStatusLabel(segment.status, undefined, undefined, language)}</span></div>
            <p id={`voice-script-${index}`}>{script.text}</p>
            <div className="sample-actions">
              {isActive && recording
                ? <button className="button danger compact" type="button" onClick={() => sessionRef.current && requestSessionStop(sessionRef.current, 'manual')}><Square size={15} />{isEn ? 'Finish segment' : '结束这一段'}</button>
                : <button className="button secondary compact" type="button" disabled={phase !== 'idle'} aria-describedby={`voice-script-${index}`} onClick={() => void startCapture(index)}>
                  {segment.status === 'ready' ? <RotateCcw size={15} /> : <Mic size={15} />}{segment.status === 'ready' ? (isEn ? 'Record again' : '重新录制') : segment.status === 'error' ? (isEn ? 'Try again' : '再试一次') : (isEn ? 'Record segment' : '录制这一段')}
                </button>}
              {segment.audio && !(isActive && phase !== 'idle') && <audio controls preload="metadata" src={segment.audio.previewUrl} aria-label={isEn ? `Preview recording ${index + 1}` : `试听第 ${index + 1} 段录音`} />}
              {segment.audio && !(isActive && phase !== 'idle') && <span className="sample-duration">{(segment.audio.durationMs / 1_000).toFixed(1)} {isEn ? 's' : '秒'}</span>}
            </div>
            {isActive && recording && <MicrophoneMeter level={level} label={signalLabel} language={language} />}
            {segment.error && <p className="sample-error" role="alert">{segment.error}</p>}
          </div>
        </li>
      })}
    </ol>}
    {value && <AudioPreview value={value} onClear={clear} label={uploadedSample ? (isEn ? 'Uploaded voice sample' : '上传的音色样本') : (isEn ? 'Complete merged voice sample' : '三段合并后的完整音色样本')} disabled={phase !== 'idle'} language={language} />}
    <div className="guided-upload">
      <button className="button ghost compact" type="button" onClick={() => inputRef.current?.click()} disabled={phase !== 'idle'}><Upload size={15} />{isEn ? 'Have a complete sample? Upload audio' : '已有完整样本？上传音频'}</button>
      <span>{phase === 'starting' ? (isEn ? 'Requesting microphone permission…' : '正在请求麦克风权限…') : busy ? (isEn ? 'Processing audio…' : '正在处理音频…') : (isEn ? 'The sample needs at least 9 seconds of clear speech' : '上传样本需含至少 9 秒清晰人声')}</span>
      <input ref={inputRef} type="file" hidden accept="audio/*,.wav,.mp3,.m4a,.webm" onChange={(event) => void handleFile(event.target.files?.[0])} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
}

function MicrophoneMeter({ level, label, language = 'zh' }: { level: number; label: string; language?: 'zh' | 'en' }) {
  const audible = level >= 5
  return <div className="microphone-check" role="status">
    <div className="level-track" role="meter" aria-label={language === 'en' ? 'Microphone input level' : '麦克风输入音量'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
      <span style={{ width: `${Math.max(2, level)}%` }} />
    </div>
    <div className={audible ? 'signal-ok' : 'signal-waiting'}>{audible ? <Volume2 size={14} /> : <VolumeX size={14} />}<span>{label}</span></div>
  </div>
}

function AudioPreview({ value, onClear, label, disabled = false, language = 'zh' }: { value: PreparedAudio; onClear(): void; label: string; disabled?: boolean; language?: 'zh' | 'en' }) {
  return <div className="audio-preview">
    <audio controls src={value.previewUrl} aria-label={label} />
    <span>{(value.durationMs / 1_000).toFixed(1)} {language === 'en' ? 's' : '秒'} · {language === 'en' ? 'clear speech' : '有效声音'} {(value.speechMs / 1_000).toFixed(1)} {language === 'en' ? 's' : '秒'}</span>
    <button className="icon-button small" type="button" title={language === 'en' ? 'Remove recording' : '移除录音'} aria-label={language === 'en' ? 'Remove recording' : '移除录音'} onClick={onClear} disabled={disabled}><X size={16} /></button>
  </div>
}

function createGuidedSegments(count: number): GuidedSegment[] {
  return Array.from({ length: count }, () => ({ status: 'pending' }))
}

function segmentFailure(segment: GuidedSegment, message: string, language: 'zh' | 'en' = 'zh'): GuidedSegment {
  return {
    ...segment,
    status: 'error',
    error: segment.audio ? `${message}${language === 'en' ? ' The previous valid recording is kept.' : ' 已保留上一段有效录音。'}` : message,
  }
}

function revokeSegmentPreviews(segments: GuidedSegment[]) {
  segments.forEach((segment) => {
    if (segment.audio?.previewUrl) URL.revokeObjectURL(segment.audio.previewUrl)
  })
}

function createMediaRecorder(stream: MediaStream): MediaRecorder {
  const preferredMimeType = 'audio/webm;codecs=opus'
  return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(preferredMimeType)
    ? new MediaRecorder(stream, { mimeType: preferredMimeType })
    : new MediaRecorder(stream)
}

export function guidedSegmentLimitMs(maxSeconds: number): number {
  const availableMs = Math.max(3_000, maxSeconds * 1_000 - SEGMENT_GAP_MS * (GUIDED_CHINESE_SCRIPTS.length - 1))
  return Math.min(GUIDED_SEGMENT_MAX_MS, Math.floor(availableMs / GUIDED_CHINESE_SCRIPTS.length))
}

function microphoneErrorMessage(reason: unknown, language: 'zh' | 'en' = 'zh'): string {
  const name = reason instanceof DOMException ? reason.name : reason instanceof Error ? reason.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return language === 'en' ? 'Microphone permission was denied. Allow access in system settings and try again.' : '麦克风权限被拒绝。请在系统设置中允许本应用使用麦克风后再试。'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return language === 'en' ? 'No microphone was detected. Connect an input device and try again.' : '没有检测到可用麦克风，请连接输入设备后再试。'
  if (name === 'NotReadableError' || name === 'AbortError') return language === 'en' ? 'The microphone is unavailable, possibly because another app is using it.' : '麦克风暂时无法使用，可能正被其他应用占用。'
  if (name === 'NotSupportedError') return language === 'en' ? 'This environment does not support microphone recording. Upload an audio file instead.' : '当前环境不支持麦克风录音，请改用上传音频。'
  return language === 'en' ? 'The microphone could not be used. Check the device and system permissions.' : '无法使用麦克风，请检查设备连接与系统权限。'
}

export function stopFailureMessage(reason?: StopReason, guidedLimitMs?: number, language: 'zh' | 'en' = 'zh'): string | undefined {
  if (reason === 'limit' && guidedLimitMs !== undefined) {
    return language === 'en' ? `This segment reached its ${Math.round(guidedLimitMs / 1_000)}-second limit and may be incomplete, so it was not saved. Read slowly and finish the line, then pause or click “Finish segment”.` : `本段已达到约 ${Math.round(guidedLimitMs / 1_000)} 秒上限，可能没有完整读完，因此没有保存。请自然慢读屏幕短句，完整读完后停顿或点击“结束这一段”。`
  }
  if (reason === 'no-input') return language === 'en' ? 'No clear voice was detected for a while, so this segment stopped. Check the microphone and try again.' : '长时间没有检测到足够的清晰人声，本段已停止。请检查麦克风后重新录制。'
  if (reason === 'device-ended') return language === 'en' ? 'The microphone was disconnected and this segment was not saved. Reconnect it and try again.' : '麦克风已断开，本段录音未保存。请重新连接设备。'
  if (reason === 'device-muted') return language === 'en' ? 'The microphone stopped providing sound and this segment was not saved. Check its mute switch.' : '麦克风没有继续提供声音，本段录音未保存。请检查设备静音开关。'
  if (reason === 'recorder-error') return language === 'en' ? 'The recording device reported an error and this segment was not saved.' : '录音设备发生错误，本段录音未保存。'
  return undefined
}

function guidedStatusLabel(status: GuidedStatus, seconds?: number, limitMs?: number, language: 'zh' | 'en' = 'zh'): string {
  if (status === 'starting') return language === 'en' ? 'Connecting to microphone' : '正在连接麦克风'
  if (status === 'recording') return seconds === undefined
    ? (language === 'en' ? 'Recording' : '正在录制')
    : language === 'en' ? `Recording ${formatTime(seconds)} / about ${formatTime(Math.round((limitMs ?? 0) / 1_000))}` : `录制中 ${formatTime(seconds)} / 约 ${formatTime(Math.round((limitMs ?? 0) / 1_000))}`
  if (status === 'processing') return language === 'en' ? 'Checking audio' : '正在检查声音'
  if (status === 'ready') return language === 'en' ? 'Ready; preview available' : '已完成，可试听'
  if (status === 'error') return language === 'en' ? 'Record again' : '需要重录'
  return language === 'en' ? 'Not recorded' : '待录制'
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
