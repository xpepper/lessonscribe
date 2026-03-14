# Library Sidebar Design

Date: 2026-03-14
Status: Approved for planning
Scope: Add a persistent saved-lectures sidebar that lists existing lectures and lets the user load one into the current workspace.

## Goal

Extend LessonScribe from a single-active-lecture UI into a lightweight multi-lecture local workspace.

For this slice, the product should:

- show a persistent library of saved lectures
- load that library at startup from local app storage
- let the user click a lecture in the sidebar to load it into the existing transcript and player workspace

This slice intentionally includes lecture selection because a read-only list would add UI without delivering the main user value.

## Current Baseline

The current application:

- imports one lecture audio file at a time
- stores each lecture under app-managed local storage
- hydrates a single lecture from `CURRENT_LECTURE_KEY`
- fetches individual lecture metadata, transcript, and audio by lecture ID
- renders a workspace with a left sidebar for lecture details and a main transcript reader

The backend already stores lectures in separate directories, so the persistence model is compatible with a library view.

## Chosen Approach

Use a persistent left sidebar library inside the existing workspace and make each lecture item selectable.

This approach was chosen because it:

- matches the product direction in `docs/future-features-plan.md`
- preserves the existing transcript-first workspace instead of introducing a new navigation model
- gives the cleanest path into later "reopen", "delete", and search/sort work

## User Experience

### Startup

On app startup, the frontend should:

1. Fetch the library with `GET /lectures`
2. Check `CURRENT_LECTURE_KEY`
3. If the stored lecture ID still exists, hydrate that lecture
4. Otherwise, hydrate the newest saved lecture if one exists
5. If no lectures exist, show the empty workspace state

### Sidebar

The left side of the workspace becomes a lecture library panel.

Each lecture entry shows lightweight metadata:

- title
- original filename
- duration
- created date
- language
- transcription status
- selected model

The currently active lecture is visually highlighted.

### Selection

Clicking a lecture entry:

- updates `CURRENT_LECTURE_KEY`
- loads lecture metadata into the workspace
- loads the transcript if one exists
- updates the audio source to the selected lecture
- preserves the current player/transcript behaviors already used for imported lectures

### Upload Flow

Importing a new lecture should:

- create the lecture as today
- refresh the library list
- select the newly imported lecture automatically
- keep the transcription flow unchanged

## Backend Design

### API

Add:

- `GET /lectures`

Response shape:

- `LectureMetadata[]`

No transcript content is included in the list response.

### Storage

`LectureStore` should gain a method that:

- scans lecture directories under the configured lectures root
- reads each `metadata.json`
- ignores transcript presence as a requirement for listing
- returns all lectures sorted by `created_at` descending

The existing `LectureMetadata` schema is currently lightweight enough for the list response, so no separate summary DTO is required in this slice.

### Error behavior

- Missing or invalid lecture directories should not crash the entire list request if they can be skipped safely
- If the active lecture is later requested by ID and not found, existing 404 handling still applies

## Frontend Design

### State

Keep:

- `lecture` as the active lecture in the workspace
- `transcript`, `job`, and player state as they exist today

Add:

- `lectures` for the sidebar collection
- a small library loading/error state if needed

Keep `CURRENT_LECTURE_KEY` as the persisted selection key.

### Data flow

Add a frontend API helper:

- `fetchLectures(): Promise<LectureMetadata[]>`

Startup flow:

- load health and models as today
- also load the lecture list
- resolve the active lecture ID
- call the existing `hydrateLecture(lectureId)` path for the selected lecture

Selection flow:

- clicking a library item calls `hydrateLecture(lectureId)`
- the active lecture highlight follows the current `lecture.id`

Upload flow:

- after successful import, refresh the list
- set the imported lecture as active
- keep transcript/job reset behavior the same as today

### UI structure

Replace the current sidebar content with:

- a `Library` section containing the selectable lecture list
- optionally a compact active-lecture summary card beneath it if the layout needs a stronger detail anchor

Keep the main transcript reader and bottom player structure unchanged.

The visual design should stay aligned with the existing app style:

- glassy cards
- strong type hierarchy
- transcript workspace as the visual focus

## Failure Handling

- If `GET /lectures` fails, keep uploads usable and show a non-blocking sidebar error
- If `CURRENT_LECTURE_KEY` points to a missing lecture, clear it and fall back to the newest available lecture
- If a selected lecture has no transcript yet, show the existing empty transcript state while still loading metadata and audio
- If no lectures exist, show the current empty-state experience

## Responsive Behavior

On narrower screens, the library should collapse above the workspace rather than disappear.

The first implementation can use a stacked section or a horizontally scrollable list, but it must preserve:

- visibility of saved lectures
- lecture selection behavior
- access to the main transcript workspace

## Testing

### Backend

Add tests for:

- `GET /lectures` returns imported lectures
- lectures are sorted newest first
- lectures without transcripts are still listed

### Frontend

Add tests for:

- startup loads the library and resolves the active lecture
- clicking a lecture item hydrates the workspace with that lecture
- importing a lecture refreshes the sidebar and selects the new lecture

## Out of Scope

This slice does not include:

- lecture deletion
- language selection on transcription
- search or sorting controls beyond newest-first default
- a separate dedicated library screen

## Implementation Notes

- Reuse the existing `hydrateLecture()` path instead of creating a second selection-specific loading path
- Keep list payloads metadata-only to avoid pulling transcript JSON on startup
- Avoid turning this into a router/navigation rewrite; the selected lecture should remain a workspace state concern

## Workflow Note

The brainstorming skill calls for a spec-review subagent before planning. That step is intentionally not executed here because the current session instructions do not allow spawning sub-agents unless the user explicitly requests delegated/sub-agent work.
