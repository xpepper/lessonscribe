# LessonScribe Future Features Plan

This document captures the next product features that are intentionally out of scope for the current v1, but should shape future backend and frontend work.

## Current Baseline

The current application supports:

- importing one lecture audio file at a time
- transcribing it locally with Whisper
- storing the lecture under app-managed local storage
- viewing the transcript with segment and word timestamps
- synchronized playback with click-to-seek

The current UI is a single-lecture workspace. The app already persists lecture data on disk, but it does not yet expose a library or management UI for previously imported lectures.

## Next Feature Set

### 1. Browse old transcriptions and audio files

Goal:
- show a persistent local library of saved lectures
- allow the user to reopen previously imported lectures without re-uploading files

Expected behavior:
- the app shows a lecture list or library panel
- each lecture entry includes title, original filename, duration, created date, language, transcription status, and selected model
- the list is loaded from local app storage at startup

Implementation impact:
- backend needs a `GET /lectures` endpoint returning all saved lecture metadata
- frontend needs a library view or sidebar with lecture selection
- lecture metadata must remain lightweight so the library can load without fetching full transcript payloads

Acceptance criteria:
- a user can close and reopen the app and still see previously imported lectures
- selecting a lecture reloads its transcript and audio player state correctly

### 2. Play old transcriptions

Goal:
- allow any saved lecture to be reopened and played again from the library

Expected behavior:
- selecting an existing lecture loads its audio URL, transcript, and metadata into the workspace
- playback, highlighting, and click-to-seek work the same way as for a newly imported lecture

Implementation impact:
- frontend should separate “active lecture selection” from “new upload”
- backend current endpoints already support single-lecture retrieval, so the main addition is list-and-select behavior

Acceptance criteria:
- a saved lecture can be reopened from the library and played without re-transcribing
- transcript highlighting and word seeking still work on reopened lectures

### 3. Delete a transcription and its audio

Goal:
- let the user remove a saved lecture and all related local files

Expected behavior:
- the user can delete a lecture from the library
- the app asks for confirmation before deletion
- deletion removes:
  - source audio
  - normalized audio
  - transcript JSON
  - metadata
  - related job files if they still exist

Implementation impact:
- backend needs a `DELETE /lectures/{id}` endpoint
- storage layer needs a safe recursive lecture-delete operation
- frontend needs delete controls and optimistic or refreshed library state

Acceptance criteria:
- deleting a lecture removes it from the library immediately
- reopening the app does not show deleted lectures
- deleted lecture files are removed from app-managed storage

### 4. Select audio language, defaulting to Italian

Goal:
- allow users to set the language explicitly, while defaulting to Italian when they do not choose one

Expected behavior:
- the transcription form includes a language selector
- default selection is `Italian`
- the user can override it with other supported languages
- if the user keeps the default, the backend passes Italian to Whisper instead of auto-detect

Implementation impact:
- backend transcription request should accept an optional `language`
- lecture metadata should store the requested language separately from detected/output language if needed
- frontend should expose a language dropdown near the model selector

Recommended data shape:
- `requested_language`: the language chosen by the user, default `it`
- `detected_language`: optional backend result when available

Acceptance criteria:
- new lectures default to Italian without user action
- the user can select another language before transcription
- the selected language is saved with the lecture metadata

## Suggested Delivery Order

1. Add lecture library browsing
2. Add reopening and playback of saved lectures from the library
3. Add deletion of saved lectures
4. Add explicit language selection with Italian as the default

This order keeps the work incremental and builds on the local persistence model already in place.

## API Additions For Later

Planned future endpoints:

- `GET /lectures`
- `DELETE /lectures/{id}`

Planned request shape update:

- `POST /lectures/{id}/transcribe`
  - add optional `language`

## Open Notes

- The current storage model already supports a multi-lecture library because lectures are saved under separate directories.
- The next UI step should likely be a two-pane layout: library on the left, active lecture workspace on the right.
- If the library grows large later, add search and sorting, but that is not necessary for the next increment.
