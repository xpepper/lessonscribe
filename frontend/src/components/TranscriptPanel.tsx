import type { TranscriptSegmentView } from '../types'

interface TranscriptPanelProps {
  segments: TranscriptSegmentView[]
  activeSegmentId: string | null
  activeWordId: string | null
  emptyMessage: string
  loading: boolean
  showTimestamps: boolean
  isEditMode: boolean
  onSeek: (time: number) => void
  onEditSegment?: (segmentId: string) => void
}

export function TranscriptPanel({
  segments,
  activeSegmentId,
  activeWordId,
  emptyMessage,
  loading,
  showTimestamps,
  isEditMode,
  onSeek,
  onEditSegment,
}: TranscriptPanelProps) {
  if (loading) {
    return (
      <div className="transcript-empty">
        <div className="pulse-dot" />
        <p>Preparing the transcript surface...</p>
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="transcript-empty transcript-empty--bordered">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="transcript-list" aria-label="Transcript">
      {segments.map((segment) => (
        <article
          key={segment.id}
          className={[
            'segment-card',
            segment.id === activeSegmentId ? 'segment-card--active' : '',
            isEditMode ? 'segment-card--editable' : '',
          ].filter(Boolean).join(' ')}
          data-segment-id={segment.id}
          onClick={isEditMode ? () => onEditSegment?.(segment.id) : undefined}
          role={isEditMode ? 'button' : undefined}
          tabIndex={isEditMode ? 0 : undefined}
          onKeyDown={isEditMode ? (e) => { if (e.key === 'Enter') onEditSegment?.(segment.id) } : undefined}
        >
          {showTimestamps && (
            <button
              type="button"
              className="segment-timestamp"
              onClick={(e) => { e.stopPropagation(); onSeek(segment.start) }}
            >
              {formatTimestamp(segment.start)}
            </button>
          )}
          <p className="segment-text">
            {segment.words.length > 0
              ? segment.words.map((word) => (
                  <button
                    key={word.id}
                    type="button"
                    className={`word-chip${word.id === activeWordId ? ' word-chip--active' : ''}`}
                    onClick={() => onSeek(word.start)}
                  >
                    {word.text}
                  </button>
                ))
              : segment.text}
          </p>
        </article>
      ))}
    </div>
  )
}

function formatTimestamp(totalSeconds: number): string {
  const rounded = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

