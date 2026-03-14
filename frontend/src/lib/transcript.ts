import type {
  TranscriptPayload,
  TranscriptSegment,
  TranscriptSegmentView,
  TranscriptWord,
} from '../types'

export function buildSegmentViews(transcript: TranscriptPayload): TranscriptSegmentView[] {
  const groupedWords = new Map<string, TranscriptWord[]>()
  for (const word of transcript.words) {
    const existing = groupedWords.get(word.segmentId)
    if (existing) {
      existing.push(word)
    } else {
      groupedWords.set(word.segmentId, [word])
    }
  }

  return transcript.segments.map((segment) => ({
    ...segment,
    words: groupedWords.get(segment.id) ?? [],
  }))
}

function findActiveIndex<T extends { start: number; end: number }>(
  items: T[],
  currentTime: number,
): number {
  let low = 0
  let high = items.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const item = items[mid]
    if (currentTime < item.start) {
      high = mid - 1
    } else if (currentTime > item.end) {
      low = mid + 1
    } else {
      return mid
    }
  }

  return -1
}

export function findActiveSegmentId(
  segments: TranscriptSegment[],
  currentTime: number,
): string | null {
  const index = findActiveIndex(segments, currentTime)
  return index === -1 ? null : segments[index].id
}

export function findActiveWordId(words: TranscriptWord[], currentTime: number): string | null {
  const index = findActiveIndex(words, currentTime)
  return index === -1 ? null : words[index].id
}

export function shouldAutoScroll(
  containerRect: Pick<DOMRect, 'top' | 'bottom'>,
  elementRect: Pick<DOMRect, 'top' | 'bottom'>,
): boolean {
  return elementRect.top < containerRect.top + 48 || elementRect.bottom > containerRect.bottom - 48
}

