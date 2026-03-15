import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { HealthCheck, LectureMetadata, ModelInfo } from './types'

const apiMocks = vi.hoisted(() => ({
  deleteLecture: vi.fn(),
  downloadModel: vi.fn(),
  fetchHealth: vi.fn(),
  fetchJob: vi.fn(),
  fetchLecture: vi.fn(),
  fetchLectures: vi.fn(),
  fetchModels: vi.fn(),
  fetchTranscript: vi.fn(),
  importLecture: vi.fn(),
  resolveAssetUrl: vi.fn(),
  startTranscription: vi.fn(),
}))

vi.mock('./api', () => apiMocks)

const CURRENT_LECTURE_KEY = 'lessonscribe.currentLectureId'

const health: HealthCheck = {
  status: 'ok',
  ffmpeg_available: true,
  whisper_installed: true,
  cuda_available: false,
  mps_available: false,
  inference_device: 'cpu',
  data_dir: '/tmp/lessonscribe',
  supported_models: ['turbo', 'base'],
}

const models: ModelInfo[] = [{ name: 'turbo', available: true }]

function makeLecture(overrides: Partial<LectureMetadata>): LectureMetadata {
  return {
    id: 'lecture-default',
    title: 'Default Lecture',
    original_filename: 'default.wav',
    stored_filename: 'source.wav',
    source_extension: '.wav',
    duration_seconds: 180,
    status: 'uploaded',
    selected_model: null,
    detected_language: null,
    has_transcript: false,
    created_at: '2026-03-14T09:00:00+00:00',
    updated_at: '2026-03-14T09:00:00+00:00',
    active_job_id: null,
    audio_url: '/lectures/lecture-default/audio',
    transcript_url: '/lectures/lecture-default/transcript',
    ...overrides,
  }
}

describe('App', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.localStorage.removeItem(CURRENT_LECTURE_KEY)

    apiMocks.fetchHealth.mockResolvedValue(health)
    apiMocks.fetchModels.mockResolvedValue(models)
    apiMocks.fetchTranscript.mockResolvedValue({
      text: '',
      language: null,
      segments: [],
      words: [],
    })
    apiMocks.deleteLecture.mockResolvedValue(undefined)
    apiMocks.resolveAssetUrl.mockImplementation((path: string | null) => path)
    apiMocks.fetchJob.mockResolvedValue(null)
  })

  it('loads the library on startup and honors the saved lecture selection', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-13T09:00:00+00:00',
    })
    const history = makeLecture({
      id: 'lecture-history',
      title: 'Roman History',
      original_filename: 'history.wav',
      created_at: '2026-03-14T09:00:00+00:00',
    })

    apiMocks.fetchLectures.mockResolvedValue([biology, history])
    apiMocks.fetchLecture.mockImplementation(async (lectureId: string) =>
      lectureId === biology.id ? biology : history,
    )
    window.localStorage.setItem(CURRENT_LECTURE_KEY, biology.id)

    render(<App />)

    const biologyButton = await screen.findByRole('button', { name: /^Biology Lecture$/i })
    await waitFor(() => expect(biologyButton).toHaveAttribute('aria-pressed', 'true'))
    expect(apiMocks.fetchLecture).toHaveBeenCalledWith(biology.id)
  })

  it('shows bootstrap guidance when backend health reports missing setup dependencies', async () => {
    apiMocks.fetchHealth.mockResolvedValue({
      ...health,
      status: 'degraded',
      ffmpeg_available: false,
      whisper_installed: false,
    })
    apiMocks.fetchLectures.mockResolvedValue([])

    render(<App />)

    expect(await screen.findByText('Setup needed')).toBeInTheDocument()
    expect(screen.getByText(/Run the Windows bootstrap script, then restart the app\./i)).toBeInTheDocument()
    expect(screen.getByText(/FFmpeg missing · Whisper missing · Device CPU/i)).toBeInTheDocument()
  })

  it('shows backend offline guidance when the health check cannot be reached', async () => {
    apiMocks.fetchHealth.mockRejectedValue(new Error('Unable to reach the backend.'))
    apiMocks.fetchModels.mockResolvedValue(models)
    apiMocks.fetchLectures.mockResolvedValue([])

    render(<App />)

    expect(await screen.findByText('Backend offline')).toBeInTheDocument()
    expect(
      screen.getByText(/Start LessonScribe with the Windows start script, or make sure the backend is running on port 8000\./i),
    ).toBeInTheDocument()
  })

  it('hydrates the workspace when a lecture is selected from the sidebar', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-14T09:00:00+00:00',
    })
    const history = makeLecture({
      id: 'lecture-history',
      title: 'Roman History',
      original_filename: 'history.wav',
      created_at: '2026-03-13T09:00:00+00:00',
    })

    apiMocks.fetchLectures.mockResolvedValue([biology, history])
    apiMocks.fetchLecture.mockImplementation(async (lectureId: string) =>
      lectureId === biology.id ? biology : history,
    )

    render(<App />)

    const biologyButton = await screen.findByRole('button', { name: /^Biology Lecture$/i })
    await waitFor(() => expect(biologyButton).toHaveAttribute('aria-pressed', 'true'))

    const user = userEvent.setup()
    const historyButton = screen.getByRole('button', { name: /^Roman History$/i })
    await user.click(historyButton)

    await waitFor(() => expect(historyButton).toHaveAttribute('aria-pressed', 'true'))
    expect(apiMocks.fetchLecture).toHaveBeenLastCalledWith(history.id)
  })

  it('refreshes the library and selects the imported lecture', async () => {
    const existingLecture = makeLecture({
      id: 'lecture-existing',
      title: 'Existing Lecture',
      original_filename: 'existing.wav',
      created_at: '2026-03-13T09:00:00+00:00',
    })
    const newLecture = makeLecture({
      id: 'lecture-new',
      title: 'New Lecture',
      original_filename: 'new.wav',
      created_at: '2026-03-14T09:00:00+00:00',
    })

    apiMocks.fetchLectures
      .mockResolvedValueOnce([existingLecture])
      .mockResolvedValueOnce([newLecture, existingLecture])
    apiMocks.fetchLecture.mockResolvedValue(existingLecture)
    apiMocks.importLecture.mockResolvedValue(newLecture)

    render(<App />)

    const existingButton = await screen.findByRole('button', { name: /^Existing Lecture$/i })
    await waitFor(() => expect(existingButton).toHaveAttribute('aria-pressed', 'true'))

    const user = userEvent.setup()
    const fileInput = screen.getByLabelText('Upload lecture audio')
    await user.upload(fileInput, new File(['audio'], 'new.wav', { type: 'audio/wav' }))

    await waitFor(() => expect(apiMocks.importLecture).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(apiMocks.fetchLectures).toHaveBeenCalledTimes(2))

    const newLectureButton = await screen.findByRole('button', { name: /^New Lecture$/i })
    expect(newLectureButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('deletes a non-active lecture from the sidebar after confirmation', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-14T09:00:00+00:00',
    })
    const history = makeLecture({
      id: 'lecture-history',
      title: 'Roman History',
      original_filename: 'history.wav',
      created_at: '2026-03-13T09:00:00+00:00',
    })

    apiMocks.fetchLectures.mockResolvedValue([biology, history])
    apiMocks.fetchLecture.mockImplementation(async (lectureId: string) =>
      lectureId === biology.id ? biology : history,
    )

    render(<App />)

    await screen.findByRole('button', { name: /^Biology Lecture$/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /More actions for Roman History/i }))
    await user.click(screen.getByRole('menuitem', { name: /Delete lecture/i }))
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    await waitFor(() => expect(apiMocks.deleteLecture).toHaveBeenCalledWith(history.id, { force: false }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Roman History$/i })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /^Biology Lecture$/i })).toBeInTheDocument()
  })

  it('clears the workspace when the active lecture is deleted', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-14T09:00:00+00:00',
    })

    apiMocks.fetchLectures.mockResolvedValue([biology])
    apiMocks.fetchLecture.mockResolvedValue(biology)
    window.localStorage.setItem(CURRENT_LECTURE_KEY, biology.id)

    render(<App />)

    await screen.findByRole('button', { name: /^Biology Lecture$/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /More actions for Biology Lecture/i }))
    await user.click(screen.getByRole('menuitem', { name: /Delete lecture/i }))
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    await waitFor(() => expect(apiMocks.deleteLecture).toHaveBeenCalledWith(biology.id, { force: false }))
    await waitFor(() => expect(screen.getByText(/Waiting for audio/i)).toBeInTheDocument())
    expect(screen.getByText(/No lecture imported yet/i)).toBeInTheDocument()
    expect(window.localStorage.getItem(CURRENT_LECTURE_KEY)).toBeNull()
  })

  it('keeps the lecture visible and shows an error when deletion fails', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-14T09:00:00+00:00',
      status: 'complete',
      has_transcript: true,
    })

    apiMocks.fetchLectures.mockResolvedValue([biology])
    apiMocks.fetchLecture.mockResolvedValue(biology)
    apiMocks.deleteLecture.mockRejectedValue(new Error('Lecture cannot be deleted while transcription is running.'))

    render(<App />)

    await screen.findByRole('button', { name: /^Biology Lecture$/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /More actions for Biology Lecture/i }))
    await user.click(screen.getByRole('menuitem', { name: /Delete lecture/i }))
    await user.click(screen.getByRole('button', { name: /Delete permanently/i }))

    await waitFor(() =>
      expect(screen.getByText(/Lecture cannot be deleted while transcription is running\./i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /^Biology Lecture$/i })).toBeInTheDocument()
  })

  it('force-deletes a running lecture after the stronger confirmation', async () => {
    const biology = makeLecture({
      id: 'lecture-biology',
      title: 'Biology Lecture',
      original_filename: 'biology.wav',
      created_at: '2026-03-14T09:00:00+00:00',
      status: 'transcribing',
      active_job_id: 'job-123',
    })

    apiMocks.fetchLectures.mockResolvedValue([biology])
    apiMocks.fetchLecture.mockResolvedValue(biology)

    render(<App />)

    await screen.findByRole('button', { name: /^Biology Lecture$/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /More actions for Biology Lecture/i }))
    expect(screen.getByText(/Deletion will attempt cancellation first\./i)).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /Delete lecture/i }))
    expect(
      screen.getByText(/LessonScribe will first try to cancel the job, then remove the lecture/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cancel and delete/i }))

    await waitFor(() => expect(apiMocks.deleteLecture).toHaveBeenCalledWith(biology.id, { force: true }))
    await waitFor(() => expect(screen.getByText(/Waiting for audio/i)).toBeInTheDocument())
  })
})
