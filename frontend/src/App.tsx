import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './index.css'
import {
  downloadModel,
  fetchHealth,
  fetchJob,
  fetchLecture,
  fetchModels,
  fetchTranscript,
  importLecture,
  resolveAssetUrl,
  startTranscription,
} from './api'
import { TranscriptPanel } from './components/TranscriptPanel'
import { formatDuration, formatRelativeDate } from './lib/format'
import {
  buildSegmentViews,
  findActiveSegmentId,
  findActiveWordId,
  shouldAutoScroll,
} from './lib/transcript'
import type {
  HealthCheck,
  JobRecord,
  LectureMetadata,
  ModelInfo,
  TranscriptPayload,
  TranscriptSegmentView,
} from './types'

const CURRENT_LECTURE_KEY = 'lessonscribe.currentLectureId'

function App() {
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('turbo')
  const [lecture, setLecture] = useState<LectureMetadata | null>(null)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [transcript, setTranscript] = useState<TranscriptPayload | null>(null)
  const [segmentViews, setSegmentViews] = useState<TranscriptSegmentView[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  const activeSegmentId = transcript ? findActiveSegmentId(transcript.segments, currentTime) : null
  const activeWordId = transcript ? findActiveWordId(transcript.words, currentTime) : null
  const navigationSegments = segmentViews.slice(0, 8)
  const audioUrl = lecture ? resolveAssetUrl(lecture.audio_url) : null
  const isJobActive = job?.status === 'preparing' || job?.status === 'downloading-model' || job?.status === 'transcribing'

  useEffect(() => {
    void fetchHealth().then(setHealth).catch((error: Error) => {
      setErrorMessage(error.message)
    })
    void fetchModels().then((items) => {
      setModels(items)
      setSelectedModel((current) =>
        items.some((item) => item.name === current) || !items[0] ? current : items[0].name,
      )
    }).catch((error: Error) => {
      setErrorMessage(error.message)
    })
  }, [])

  useEffect(() => {
    const lectureId = window.localStorage.getItem(CURRENT_LECTURE_KEY)
    if (!lectureId) {
      return
    }

    void hydrateLecture(lectureId)
  }, [])

  useEffect(() => {
    if (!job || job.status === 'complete' || job.status === 'failed') {
      return
    }

    const interval = window.setInterval(() => {
      void fetchJob(job.id)
        .then((nextJob) => {
          setJob(nextJob)
          setBusyMessage(nextJob.message)
          if (nextJob.status === 'complete') {
            void hydrateLecture(nextJob.lecture_id)
            setBusyMessage(null)
          }
          if (nextJob.status === 'failed') {
            setErrorMessage(nextJob.error ?? nextJob.message)
            setBusyMessage(null)
          }
        })
        .catch((error: Error) => {
          setErrorMessage(error.message)
          setBusyMessage(null)
        })
    }, 1500)

    return () => window.clearInterval(interval)
  }, [job])

  const syncPlaybackTime = useEffectEvent(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    setCurrentTime(audio.currentTime)
    if (Number.isFinite(audio.duration)) {
      setDuration(audio.duration)
    }
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const handleTimeUpdate = () => syncPlaybackTime()
    const handleLoadedMetadata = () => syncPlaybackTime()
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [audioUrl])

  useEffect(() => {
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
  }, [audioUrl])

  useEffect(() => {
    const container = transcriptContainerRef.current
    if (!container || !activeSegmentId) {
      return
    }

    const activeElement = container.querySelector<HTMLElement>(`[data-segment-id="${activeSegmentId}"]`)
    if (!activeElement) {
      return
    }

    if (shouldAutoScroll(container.getBoundingClientRect(), activeElement.getBoundingClientRect())) {
      activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeSegmentId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    audio.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    audio.volume = volume
  }, [volume])

  async function hydrateLecture(lectureId: string) {
    try {
      const nextLecture = await fetchLecture(lectureId)
      setLecture(nextLecture)
      setSelectedModel((current) => nextLecture.selected_model ?? current)
      window.localStorage.setItem(CURRENT_LECTURE_KEY, nextLecture.id)

      if (nextLecture.has_transcript) {
        const nextTranscript = await fetchTranscript(nextLecture.id)
        setTranscript(nextTranscript)
        setSegmentViews(buildSegmentViews(nextTranscript))
      } else {
        setTranscript(null)
        setSegmentViews([])
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load lecture.'
      setErrorMessage(message)
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) {
      return
    }

    setIsImporting(true)
    setErrorMessage(null)
    setBusyMessage('Importing lecture audio...')
    try {
      const imported = await importLecture(file)
      setLecture(imported)
      setTranscript(null)
      setSegmentViews([])
      setJob(null)
      window.localStorage.setItem(CURRENT_LECTURE_KEY, imported.id)
      setBusyMessage(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import the lecture.'
      setErrorMessage(message)
      setBusyMessage(null)
    } finally {
      setIsImporting(false)
    }
  }

  async function handleTranscribe() {
    if (!lecture) {
      return
    }

    setErrorMessage(null)
    setBusyMessage('Preparing transcription job...')

    try {
      const selected = models.find((model) => model.name === selectedModel)
      if (selected && !selected.available) {
        await downloadModel(selectedModel)
        setModels((current) =>
          current.map((model) =>
            model.name === selectedModel ? { ...model, available: true } : model,
          ),
        )
      }

      const nextJob = await startTranscription(lecture.id, selectedModel)
      setJob(nextJob)
      setBusyMessage(nextJob.message)
      setLecture((current) =>
        current ? { ...current, status: nextJob.status, selected_model: selectedModel } : current,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start transcription.'
      setErrorMessage(message)
      setBusyMessage(null)
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }

  function seekTo(time: number) {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    audio.currentTime = time
    setCurrentTime(time)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LessonScribe</p>
          <h1>Transcribe lectures locally. Read them in sync.</h1>
        </div>
        <div className="setup-card">
          <p>Backend status</p>
          <strong>{health?.status === 'ok' ? 'Ready' : 'Setup needed'}</strong>
          <span>
            {health
              ? `FFmpeg ${health.ffmpeg_available ? 'found' : 'missing'} · Whisper ${health.whisper_installed ? 'installed' : 'missing'}`
              : 'Checking backend…'}
          </span>
        </div>
      </header>

      <section className="toolbar">
        <label className="upload-button">
          <input
            aria-label="Upload lecture audio"
            type="file"
            accept=".mp3,.m4a,.wav"
            disabled={isImporting}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              void handleUpload(file)
              event.currentTarget.value = ''
            }}
          />
          {isImporting ? 'Importing…' : 'Upload audio'}
        </label>

        <div className="file-chip">
          {lecture ? lecture.original_filename : 'No lecture imported yet'}
        </div>

        <label className="model-select">
          <span>Whisper model</span>
          <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
            {models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name} {model.available ? '· ready' : '· download'}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="primary-button"
          disabled={!lecture || isImporting || isJobActive}
          onClick={() => void handleTranscribe()}
        >
          {isJobActive ? 'Transcribing…' : 'Transcribe'}
        </button>
      </section>

      <main className="workspace">
        <aside className="sidebar">
          <section className="sidebar-card sidebar-card--accent">
            <p className="sidebar-label">Current lecture</p>
            <h2>{lecture?.title ?? 'Waiting for audio'}</h2>
            <p>
              {lecture
                ? `${formatDuration(lecture.duration_seconds)} · ${lecture.detected_language ?? 'language auto-detect'}`
                : 'Import an MP3, M4A, or WAV file to begin.'}
            </p>
            <div className="status-stack">
              <StatusPill label="Lecture" value={lecture?.status ?? 'uploaded'} />
              <StatusPill label="Model" value={selectedModel} subtle />
            </div>
          </section>

          <section className="sidebar-card">
            <p className="sidebar-label">Artifacts</p>
            <ul className="artifact-list">
              <li>{lecture ? lecture.stored_filename : 'source audio'}</li>
              <li>transcript.json</li>
              <li>word timestamps</li>
            </ul>
          </section>

          <section className="sidebar-card">
            <p className="sidebar-label">Jump points</p>
            {navigationSegments.length > 0 ? (
              <div className="jump-list">
                {navigationSegments.map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    className="jump-button"
                    onClick={() => seekTo(segment.start)}
                  >
                    <span>{formatDuration(segment.start)}</span>
                    <span>{segment.text}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="sidebar-muted">Timestamps appear here once the lecture is transcribed.</p>
            )}
          </section>
        </aside>

        <section className="reader-card">
          <div className="reader-header">
            <div>
              <p className="eyebrow eyebrow--muted">Transcript</p>
              <h2>{lecture?.title ?? 'Lecture transcript'}</h2>
              <p className="reader-meta">
                {lecture
                  ? `${formatRelativeDate(lecture.updated_at)} · ${lecture.original_filename}`
                  : 'Upload a lecture to generate timestamped text.'}
              </p>
            </div>
            <div className="status-panel">
              {busyMessage ? <p>{busyMessage}</p> : <p>Word-level sync and click-to-seek ready.</p>}
              {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            </div>
          </div>

          <div className="reader-scroll" ref={transcriptContainerRef}>
            <TranscriptPanel
              segments={segmentViews}
              activeSegmentId={activeSegmentId}
              activeWordId={activeWordId}
              loading={Boolean(lecture && !transcript && isJobActive)}
              emptyMessage="Start a transcription to turn the lecture into a timestamped reading view."
              onSeek={seekTo}
            />
          </div>
        </section>
      </main>

      <footer className="player-shell">
        <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" />
        <button
          type="button"
          className="play-button"
          onClick={() => void togglePlayback()}
          disabled={!audioUrl}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <div className="timeline-block">
          <div className="timeline-meta">
            <strong>{lecture?.title ?? 'No lecture selected'}</strong>
            <span>
              {formatDuration(currentTime)} / {formatDuration(duration || lecture?.duration_seconds || 0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || lecture?.duration_seconds || 0}
            step={0.01}
            value={Math.min(currentTime, duration || lecture?.duration_seconds || 0)}
            disabled={!audioUrl}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
        </div>

        <label className="player-control">
          <span>Speed</span>
          <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>

        <label className="player-control">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
      </footer>
    </div>
  )
}

function StatusPill({
  label,
  value,
  subtle = false,
}: {
  label: string
  value: string
  subtle?: boolean
}) {
  return (
    <div className={`status-pill${subtle ? ' status-pill--subtle' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
