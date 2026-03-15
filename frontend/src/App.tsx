import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './index.css'
import {
  deleteLecture,
  downloadModel,
  fetchHealth,
  fetchJob,
  fetchLecture,
  fetchLectures,
  fetchModels,
  fetchTranscript,
  importLecture,
  resolveAssetUrl,
  startTranscription,
  updateTranscript,
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
const ACTIVE_TRANSCRIPTION_STATUSES = new Set(['preparing', 'downloading-model', 'transcribing'])

function sortLectures(items: LectureMetadata[]): LectureMetadata[] {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))
}

function lectureIsRunning(lecture: LectureMetadata): boolean {
  return lecture.active_job_id !== null && ACTIVE_TRANSCRIPTION_STATUSES.has(lecture.status)
}

function buildSetupCardState(health: HealthCheck | null, healthError: string | null) {
  if (!health) {
    return {
      title: healthError ? 'Backend offline' : 'Checking backend…',
      details: 'Status card updates after the API responds.',
      guidance: healthError
        ? 'Start LessonScribe with the Windows start script, or make sure the backend is running on port 8000.'
        : 'Waiting for the local API health check.',
    }
  }

  const details = `FFmpeg ${health.ffmpeg_available ? 'found' : 'missing'} · Whisper ${health.whisper_installed ? 'installed' : 'missing'} · Device ${health.inference_device.toUpperCase()}`

  if (health.status === 'ok') {
    return {
      title: 'Ready',
      details,
      guidance: 'Upload audio and choose a model to start transcribing.',
    }
  }

  if (!health.ffmpeg_available && !health.whisper_installed) {
    return {
      title: 'Setup needed',
      details,
      guidance: 'Run the Windows bootstrap script, then restart the app.',
    }
  }

  if (!health.ffmpeg_available) {
    return {
      title: 'Setup needed',
      details,
      guidance: 'FFmpeg is missing. Re-run the bootstrap script or install FFmpeg, then restart the app.',
    }
  }

  return {
    title: 'Setup needed',
    details,
    guidance: 'Whisper dependencies are missing. Re-run backend setup, then restart the app.',
  }
}

function App() {
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('turbo')
  const [lectures, setLectures] = useState<LectureMetadata[]>([])
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
  const [libraryErrorMessage, setLibraryErrorMessage] = useState<string | null>(null)
  const [isLibraryLoading, setIsLibraryLoading] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftSegments, setDraftSegments] = useState<TranscriptSegmentView[]>([])
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [isSavingTranscript, setIsSavingTranscript] = useState(false)
  const [openLectureActionsId, setOpenLectureActionsId] = useState<string | null>(null)
  const [pendingDeletionLecture, setPendingDeletionLecture] = useState<LectureMetadata | null>(null)
  const [isDeletingLecture, setIsDeletingLecture] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  const activeSegmentId = transcript ? findActiveSegmentId(transcript.segments, currentTime) : null
  const activeWordId = transcript ? findActiveWordId(transcript.words, currentTime) : null
  const navigationSegments = segmentViews.slice(0, 8)
  const audioUrl = lecture ? resolveAssetUrl(lecture.audio_url) : null
  const isJobActive = job?.status === 'preparing' || job?.status === 'downloading-model' || job?.status === 'transcribing'
  const setupCard = buildSetupCardState(health, health ? null : errorMessage)

  useEffect(() => {
    let cancelled = false

    async function initializeApp() {
      setIsLibraryLoading(true)
      const savedLectureId = window.localStorage.getItem(CURRENT_LECTURE_KEY)
      const [healthResult, modelsResult, lecturesResult] = await Promise.allSettled([
        fetchHealth(),
        fetchModels(),
        fetchLectures(),
      ])

      if (cancelled) {
        return
      }

      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value)
      } else {
        setErrorMessage(healthResult.reason instanceof Error ? healthResult.reason.message : 'Unable to reach the backend.')
      }

      if (modelsResult.status === 'fulfilled') {
        const nextModels = modelsResult.value
        setModels(nextModels)
        setSelectedModel((current) =>
          nextModels.some((item) => item.name === current) || !nextModels[0] ? current : nextModels[0].name,
        )
      } else {
        setErrorMessage(modelsResult.reason instanceof Error ? modelsResult.reason.message : 'Unable to load Whisper models.')
      }

      let initialLectureId = savedLectureId
      if (lecturesResult.status === 'fulfilled') {
        const nextLectures = sortLectures(lecturesResult.value)
        setLectures(nextLectures)
        setLibraryErrorMessage(null)
        const savedLectureStillExists = savedLectureId
          ? nextLectures.some((item) => item.id === savedLectureId)
          : false
        if (savedLectureId && !savedLectureStillExists) {
          window.localStorage.removeItem(CURRENT_LECTURE_KEY)
          initialLectureId = nextLectures[0]?.id ?? null
        } else if (!savedLectureId) {
          initialLectureId = nextLectures[0]?.id ?? null
        }
      } else {
        setLibraryErrorMessage(
          lecturesResult.reason instanceof Error ? lecturesResult.reason.message : 'Unable to load saved lectures.',
        )
      }

      setIsLibraryLoading(false)

      if (initialLectureId) {
        await hydrateLecture(initialLectureId)
      }
    }

    // `hydrateLecture` intentionally stays outside the dependency list so startup
    // does not re-run when ordinary render-time state changes.
    void initializeApp()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!job || job.status === 'complete' || job.status === 'failed' || job.status === 'canceled') {
      return
    }

    const interval = window.setInterval(() => {
      void fetchJob(job.id)
        .then((nextJob) => {
          setJob(nextJob)
          setBusyMessage(nextJob.message)
          syncLectureState(nextJob.lecture_id, {
            active_job_id:
              nextJob.status === 'complete' || nextJob.status === 'failed' || nextJob.status === 'canceled'
                ? null
                : nextJob.id,
            status: nextJob.status,
          })
          if (nextJob.status === 'complete') {
            void hydrateLecture(nextJob.lecture_id)
            setBusyMessage(null)
          }
          if (nextJob.status === 'canceled') {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function clearActiveLectureWorkspace(lectureId: string) {
    setLecture(null)
    setTranscript(null)
    setSegmentViews([])
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setBusyMessage(null)
    setErrorMessage(null)
    setJob((current) => (current?.lecture_id === lectureId ? null : current))
    window.localStorage.removeItem(CURRENT_LECTURE_KEY)
  }

  function mergeLectureIntoList(nextLecture: LectureMetadata) {
    setLectures((current) => sortLectures([nextLecture, ...current.filter((item) => item.id !== nextLecture.id)]))
  }

  function removeLectureFromList(lectureId: string) {
    setLectures((current) => current.filter((item) => item.id !== lectureId))
  }

  function syncLectureState(lectureId: string, updates: Partial<LectureMetadata>) {
    setLecture((current) => (current?.id === lectureId ? { ...current, ...updates } : current))
    setLectures((current) =>
      sortLectures(current.map((item) => (item.id === lectureId ? { ...item, ...updates } : item))),
    )
  }

  async function refreshLectures() {
    try {
      const nextLectures = sortLectures(await fetchLectures())
      setLectures(nextLectures)
      setLibraryErrorMessage(null)
      return nextLectures
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load saved lectures.'
      setLibraryErrorMessage(message)
      return null
    } finally {
      setIsLibraryLoading(false)
    }
  }

  async function hydrateLecture(lectureId: string) {
    try {
      setErrorMessage(null)
      setOpenLectureActionsId(null)
      const nextLecture = await fetchLecture(lectureId)
      setLecture(nextLecture)
      mergeLectureIntoList(nextLecture)
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
    setOpenLectureActionsId(null)
    setBusyMessage('Importing lecture audio...')
    try {
      const imported = await importLecture(file)
      setLecture(imported)
      mergeLectureIntoList(imported)
      setTranscript(null)
      setSegmentViews([])
      setJob(null)
      window.localStorage.setItem(CURRENT_LECTURE_KEY, imported.id)
      await refreshLectures()
      setBusyMessage(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import the lecture.'
      setErrorMessage(message)
      setBusyMessage(null)
    } finally {
      setIsImporting(false)
    }
  }

  async function handleDeleteLecture() {
    if (!pendingDeletionLecture) {
      return
    }

    setIsDeletingLecture(true)
    setDeleteErrorMessage(null)

    try {
      const forceDelete = lectureIsRunning(pendingDeletionLecture)
      await deleteLecture(pendingDeletionLecture.id, { force: forceDelete })
      removeLectureFromList(pendingDeletionLecture.id)
      setJob((current) => (current?.lecture_id === pendingDeletionLecture.id ? null : current))
      if (pendingDeletionLecture.id === lecture?.id) {
        clearActiveLectureWorkspace(pendingDeletionLecture.id)
      }
      setPendingDeletionLecture(null)
      setOpenLectureActionsId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete the lecture.'
      setDeleteErrorMessage(message)
    } finally {
      setIsDeletingLecture(false)
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
      syncLectureState(lecture.id, {
        active_job_id: nextJob.id,
        selected_model: selectedModel,
        status: nextJob.status,
      })
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

  function enterEditMode() {
    setDraftSegments(segmentViews.map((s) => ({ ...s, words: [...s.words] })))
    setIsEditMode(true)
  }

  function discardEdits() {
    setDraftSegments([])
    setEditingSegmentId(null)
    setIsEditMode(false)
  }

  function saveSegmentEdit(segmentId: string, newText: string) {
    setDraftSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId
          ? { ...s, text: newText, words: [] }
          : s,
      ),
    )
    setEditingSegmentId(null)
  }

  async function commitEdits() {
    if (!lecture || !transcript) return
    setIsSavingTranscript(true)
    try {
      const updatedText = draftSegments.map((s) => s.text).join(' ')
      const updatedPayload: TranscriptPayload = {
        ...transcript,
        text: updatedText,
        segments: draftSegments.map(({ words: _words, ...seg }) => seg),
        words: draftSegments.flatMap((s) => s.words),
      }
      const saved = await updateTranscript(lecture.id, updatedPayload)
      setTranscript(saved)
      setSegmentViews(buildSegmentViews(saved))
      setIsEditMode(false)
      setDraftSegments([])
      setEditingSegmentId(null)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save edits.')
    } finally {
      setIsSavingTranscript(false)
    }
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
          <strong>{setupCard.title}</strong>
          <span>{setupCard.details}</span>
          <span className="setup-card__hint">{setupCard.guidance}</span>
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
          <section className="sidebar-card">
            <div className="library-header">
              <div>
                <p className="sidebar-label">Library</p>
                <h2>Saved lectures</h2>
              </div>
              <span className="library-count">{lectures.length}</span>
            </div>

            {isLibraryLoading ? (
              <p className="sidebar-muted">Loading saved lectures…</p>
            ) : lectures.length > 0 ? (
              <div className="library-list" aria-label="Saved lectures">
                {lectures.map((item) => {
                  const isActive = item.id === lecture?.id
                  const isActionMenuOpen = openLectureActionsId === item.id
                  const language = item.detected_language ?? 'pending'
                  const model = item.selected_model ?? 'not started'
                  return (
                    <div
                      key={item.id}
                      className={`library-item${isActive ? ' library-item--active' : ''}`}
                    >
                      <button
                        type="button"
                        className="library-item__select"
                        aria-label={item.title}
                        aria-pressed={isActive}
                        onClick={() => void hydrateLecture(item.id)}
                      >
                        <span className="library-item__title">{item.title}</span>
                        <span className="library-item__meta">{item.original_filename}</span>
                        <span className="library-item__meta">
                          {formatDuration(item.duration_seconds)} · {language} · {item.status}
                        </span>
                        <span className="library-item__meta">
                          Imported {formatRelativeDate(item.created_at)} · {model}
                        </span>
                      </button>

                      <div className="library-item__actions">
                        <button
                          type="button"
                          className="library-action-button"
                          aria-label={`More actions for ${item.title}`}
                          aria-expanded={isActionMenuOpen}
                          onClick={() =>
                            setOpenLectureActionsId((current) => (current === item.id ? null : item.id))
                          }
                        >
                          •••
                        </button>

                        {isActionMenuOpen ? (
                          <div className="library-action-menu" role="menu" aria-label={`Actions for ${item.title}`}>
                            <button
                              type="button"
                              role="menuitem"
                              className="library-action-menu__item library-action-menu__item--danger"
                              onClick={() => {
                                setPendingDeletionLecture(item)
                                setDeleteErrorMessage(null)
                                setOpenLectureActionsId(null)
                              }}
                            >
                              Delete lecture
                            </button>
                            {lectureIsRunning(item) ? (
                              <p className="library-action-menu__hint">
                                This lecture is still transcribing. Deletion will attempt cancellation first.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="sidebar-muted">No saved lectures yet. Import an MP3, M4A, or WAV file to begin.</p>
            )}

            {libraryErrorMessage ? <p className="sidebar-error">{libraryErrorMessage}</p> : null}
          </section>

          <section className="sidebar-card sidebar-card--accent">
            <p className="sidebar-label">Current lecture</p>
            <h2>{lecture?.title ?? 'Waiting for audio'}</h2>
            <p>
              {lecture
                ? `${formatDuration(lecture.duration_seconds)} · ${lecture.detected_language ?? 'language pending'}`
                : 'Import an MP3, M4A, or WAV file to begin.'}
            </p>
            <div className="status-stack">
              <StatusPill label="Lecture" value={lecture?.status ?? 'uploaded'} />
              <StatusPill label="Model" value={lecture?.selected_model ?? selectedModel} subtle />
            </div>
            <p className="sidebar-summary">
              {lecture
                ? `${lecture.original_filename} · imported ${formatRelativeDate(lecture.created_at)}`
                : 'Select a lecture from the library or import a new file.'}
            </p>
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
            <button
              type="button"
              className="btn-ghost"
              aria-pressed={showTimestamps}
              onClick={() => setShowTimestamps((v) => !v)}
              disabled={segmentViews.length === 0}
            >
              {showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
            </button>
          </div>

          <div className="reader-scroll" ref={transcriptContainerRef}>
            <TranscriptPanel
              segments={segmentViews}
              activeSegmentId={activeSegmentId}
              activeWordId={activeWordId}
              loading={Boolean(lecture && !transcript && isJobActive)}
              emptyMessage="Start a transcription to turn the lecture into a timestamped reading view."
              showTimestamps={showTimestamps}
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

      {pendingDeletionLecture ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (isDeletingLecture) {
              return
            }
            setPendingDeletionLecture(null)
            setDeleteErrorMessage(null)
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-lecture-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="sidebar-label">Delete lecture</p>
            <h2 id="delete-lecture-title">{pendingDeletionLecture.title}</h2>
            <p className="modal-copy">
              {lectureIsRunning(pendingDeletionLecture)
                ? 'This lecture is still transcribing. LessonScribe will first try to cancel the job, then remove the lecture and its local artifacts even if cancellation is not perfectly clean.'
                : 'This removes the saved lecture, its uploaded audio, and any transcript artifacts from local storage.'}
            </p>
            {deleteErrorMessage ? <p className="error-text modal-error">{deleteErrorMessage}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isDeletingLecture}
                onClick={() => {
                  setPendingDeletionLecture(null)
                  setDeleteErrorMessage(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                disabled={isDeletingLecture}
                onClick={() => void handleDeleteLecture()}
              >
                {isDeletingLecture
                  ? 'Deleting…'
                  : lectureIsRunning(pendingDeletionLecture)
                    ? 'Cancel and delete'
                    : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
