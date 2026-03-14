import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TranscriptPanel } from './TranscriptPanel'

const segments = [
  {
    id: 'segment-0',
    start: 0,
    end: 4,
    text: 'ciao mondo',
    words: [
      { id: 'word-0', segmentId: 'segment-0', start: 0, end: 1, text: 'ciao' },
      { id: 'word-1', segmentId: 'segment-0', start: 1, end: 2, text: 'mondo' },
    ],
  },
]

describe('TranscriptPanel', () => {
  it('calls onSeek when a word is clicked', () => {
    const onSeek = vi.fn()
    render(
      <TranscriptPanel
        segments={segments}
        activeSegmentId="segment-0"
        activeWordId="word-1"
        emptyMessage="empty"
        loading={false}
        onSeek={onSeek}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'mondo' }))
    expect(onSeek).toHaveBeenCalledWith(1)
  })
})
