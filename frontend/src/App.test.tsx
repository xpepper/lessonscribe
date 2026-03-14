import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { HealthCheck, LectureMetadata, ModelInfo } from './types'

const apiMocks = vi.hoisted(() => ({
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

    const biologyButton = await screen.findByRole('button', { name: /Biology Lecture/i })
    await waitFor(() => expect(biologyButton).toHaveAttribute('aria-pressed', 'true'))
    expect(apiMocks.fetchLecture).toHaveBeenCalledWith(biology.id)
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

    const biologyButton = await screen.findByRole('button', { name: /Biology Lecture/i })
    await waitFor(() => expect(biologyButton).toHaveAttribute('aria-pressed', 'true'))

    const user = userEvent.setup()
    const historyButton = screen.getByRole('button', { name: /Roman History/i })
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

    const existingButton = await screen.findByRole('button', { name: /Existing Lecture/i })
    await waitFor(() => expect(existingButton).toHaveAttribute('aria-pressed', 'true'))

    const user = userEvent.setup()
    const fileInput = screen.getByLabelText('Upload lecture audio')
    await user.upload(fileInput, new File(['audio'], 'new.wav', { type: 'audio/wav' }))

    await waitFor(() => expect(apiMocks.importLecture).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(apiMocks.fetchLectures).toHaveBeenCalledTimes(2))

    const newLectureButton = await screen.findByRole('button', { name: /New Lecture/i })
    expect(newLectureButton).toHaveAttribute('aria-pressed', 'true')
  })
})
