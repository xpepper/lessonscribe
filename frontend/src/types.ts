export type JobState =
  | 'uploaded'
  | 'preparing'
  | 'downloading-model'
  | 'transcribing'
  | 'complete'
  | 'failed'

export interface ModelInfo {
  name: string
  available: boolean
}

export interface LectureMetadata {
  id: string
  title: string
  original_filename: string
  stored_filename: string
  source_extension: string
  duration_seconds: number
  status: JobState
  selected_model: string | null
  detected_language: string | null
  has_transcript: boolean
  created_at: string
  updated_at: string
  active_job_id: string | null
  audio_url: string | null
  transcript_url: string | null
}

export interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
}

export interface TranscriptWord {
  id: string
  segmentId: string
  start: number
  end: number
  text: string
}

export interface TranscriptPayload {
  text: string
  language: string | null
  segments: TranscriptSegment[]
  words: TranscriptWord[]
}

export interface TranscriptSegmentView extends TranscriptSegment {
  words: TranscriptWord[]
}

export interface JobRecord {
  id: string
  lecture_id: string
  model: string
  status: JobState
  progress: number
  message: string
  error: string | null
  created_at: string
  updated_at: string
}

export interface HealthCheck {
  status: 'ok' | 'degraded'
  ffmpeg_available: boolean
  whisper_installed: boolean
  data_dir: string
  supported_models: string[]
}

