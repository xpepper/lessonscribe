import { useEffect, useRef, useState } from 'react'
import type { TranscriptSegmentView } from '../types'

interface TranscriptPanelProps {
  segments: TranscriptSegmentView[]
  activeSegmentId: string | null
  activeWordId: string | null
  emptyMessage: string
  loading: boolean
  showTimestamps: boolean
  isEditMode: boolean
  editingSegmentId: string | null
  onSeek: (time: number) => void
  onEditSegment?: (segmentId: string) => void
  onSaveSegmentEdit?: (segmentId: string, newText: string) => void
  onCancelSegmentEdit?: () => void
}

export function TranscriptPanel({
  segments,
  activeSegmentId,
  activeWordId,
  emptyMessage,
  loading,
  showTimestamps,
  isEditMode,
  editingSegmentId,
  onSeek,
  onEditSegment,
  onSaveSegmentEdit,
  onCancelSegmentEdit,
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
          onClick={isEditMode && editingSegmentId !== segment.id ? () => onEditSegment?.(segment.id) : undefined}
          role={isEditMode && editingSegmentId !== segment.id ? 'button' : undefined}
          tabIndex={isEditMode && editingSegmentId !== segment.id ? 0 : undefined}
          onKeyDown={isEditMode && editingSegmentId !== segment.id ? (e) => { if (e.key === 'Enter') onEditSegment?.(segment.id) } : undefined}
        >
          {isEditMode && editingSegmentId === segment.id ? (
            <SegmentInlineEditor
              segment={segment}
              onSave={onSaveSegmentEdit}
              onCancel={onCancelSegmentEdit}
            />
          ) : (
            <>
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
                  : (
                    // No word-level timing (e.g. manually edited segment) — make whole text seek to segment start
                    <span
                      className="segment-text-seekable"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onSeek(segment.start) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSeek(segment.start) }}
                    >
                      {segment.text}
                    </span>
                  )}
              </p>
            </>
          )}
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

function SegmentInlineEditor({
  segment,
  onSave,
  onCancel,
}: {
  segment: TranscriptSegmentView
  onSave?: (segmentId: string, newText: string) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState(segment.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    // put cursor at end
    const len = segment.text.length
    textareaRef.current?.setSelectionRange(len, len)
  }, [segment.text])

  return (
    <div className="segment-edit-inline" onKeyDown={(e) => { if (e.key === 'Escape') onCancel?.() }}>
      <textarea
        ref={textareaRef}
        className="segment-edit-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      <div className="segment-edit-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary btn-small"
          disabled={text.trim() === ''}
          onClick={() => onSave?.(segment.id, text.trim())}
        >
          Save
        </button>
      </div>
    </div>
  )
}
