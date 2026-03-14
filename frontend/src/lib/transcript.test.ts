import { describe, expect, it } from 'vitest'
import {
  buildSegmentViews,
  findActiveSegmentId,
  findActiveWordId,
  shouldAutoScroll,
} from './transcript'

const transcript = {
  text: 'ciao mondo',
  language: 'it',
  segments: [
    { id: 'segment-0', start: 0, end: 4, text: 'ciao' },
    { id: 'segment-1', start: 5, end: 8, text: 'mondo' },
  ],
  words: [
    { id: 'word-0', segmentId: 'segment-0', start: 0, end: 1.5, text: 'ciao' },
    { id: 'word-1', segmentId: 'segment-1', start: 5, end: 6, text: 'mondo' },
  ],
}

describe('transcript helpers', () => {
  it('builds segment views with grouped words', () => {
    const views = buildSegmentViews(transcript)
    expect(views[0].words).toHaveLength(1)
    expect(views[1].words[0].text).toBe('mondo')
  })

  it('finds the active segment and word for a playback time', () => {
    expect(findActiveSegmentId(transcript.segments, 0.8)).toBe('segment-0')
    expect(findActiveWordId(transcript.words, 5.4)).toBe('word-1')
    expect(findActiveSegmentId(transcript.segments, 4.5)).toBeNull()
  })

  it('detects when the active element is outside the comfort zone', () => {
    expect(shouldAutoScroll({ top: 0, bottom: 300 } as DOMRect, { top: 280, bottom: 340 } as DOMRect)).toBe(true)
    expect(shouldAutoScroll({ top: 0, bottom: 300 } as DOMRect, { top: 90, bottom: 190 } as DOMRect)).toBe(false)
  })
})

