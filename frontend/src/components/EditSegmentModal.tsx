import { useEffect, useRef, useState } from 'react'
import type { TranscriptSegmentView } from '../types'

function formatTimestamp(totalSeconds: number): string {
  const rounded = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

interface EditSegmentModalProps {
  segment: TranscriptSegmentView
  onSave: (segmentId: string, newText: string) => void
  onClose: () => void
}

export function EditSegmentModal({ segment, onSave, onClose }: EditSegmentModalProps) {
  const [text, setText] = useState(segment.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onKeyDown={handleKeyDown}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>Edit {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}</h3>
          <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <label className="modal-label" htmlFor="segment-text">Text</label>
        <textarea
          id="segment-text"
          ref={textareaRef}
          className="modal-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={() => onSave(segment.id, text.trim())}
          disabled={text.trim() === ''}
        >
          Save changes
        </button>
      </div>
    </div>
  )
}
