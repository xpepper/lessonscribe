import type {
  HealthCheck,
  JobRecord,
  LectureMetadata,
  ModelInfo,
  TranscriptPayload,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path
  }
  return new URL(path, API_BASE_URL).toString()
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = 'Request failed.'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) {
        message = payload.detail
      }
    } catch {
      message = response.statusText || message
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

async function expectOk(response: Response): Promise<void> {
  if (!response.ok) {
    let message = 'Request failed.'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) {
        message = payload.detail
      }
    } catch {
      message = response.statusText || message
    }
    throw new Error(message)
  }
}

export function resolveAssetUrl(path: string | null): string | null {
  if (!path) {
    return null
  }
  return apiUrl(path)
}

export async function fetchHealth(): Promise<HealthCheck> {
  return parseResponse<HealthCheck>(await fetch(apiUrl('/health')))
}

export async function fetchModels(): Promise<ModelInfo[]> {
  return parseResponse<ModelInfo[]>(await fetch(apiUrl('/models')))
}

export async function downloadModel(name: string): Promise<ModelInfo> {
  return parseResponse<ModelInfo>(
    await fetch(apiUrl('/models/download'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
}

export async function importLecture(file: File): Promise<LectureMetadata> {
  const formData = new FormData()
  formData.append('file', file)

  return parseResponse<LectureMetadata>(
    await fetch(apiUrl('/lectures/import'), {
      method: 'POST',
      body: formData,
    }),
  )
}

export async function fetchLectures(): Promise<LectureMetadata[]> {
  return parseResponse<LectureMetadata[]>(await fetch(apiUrl('/lectures')))
}

export async function fetchLecture(lectureId: string): Promise<LectureMetadata> {
  return parseResponse<LectureMetadata>(await fetch(apiUrl(`/lectures/${lectureId}`)))
}

export async function deleteLecture(lectureId: string, options?: { force?: boolean }): Promise<void> {
  const path = options?.force ? `/lectures/${lectureId}?force=true` : `/lectures/${lectureId}`
  await expectOk(
    await fetch(apiUrl(path), {
      method: 'DELETE',
    }),
  )
}

export async function startTranscription(
  lectureId: string,
  model: string,
): Promise<JobRecord> {
  return parseResponse<JobRecord>(
    await fetch(apiUrl(`/lectures/${lectureId}/transcribe`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }),
  )
}

export async function fetchJob(jobId: string): Promise<JobRecord> {
  return parseResponse<JobRecord>(await fetch(apiUrl(`/jobs/${jobId}`)))
}

export async function fetchTranscript(lectureId: string): Promise<TranscriptPayload> {
  return parseResponse<TranscriptPayload>(await fetch(apiUrl(`/lectures/${lectureId}/transcript`)))
}

export async function updateTranscript(
  lectureId: string,
  payload: TranscriptPayload,
): Promise<TranscriptPayload> {
  const response = await fetch(apiUrl(`/lectures/${lectureId}/transcript`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseResponse<TranscriptPayload>(response)
}
