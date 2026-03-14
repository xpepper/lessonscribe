# Library Sidebar Implementation Plan

Date: 2026-03-14
Spec: `docs/superpowers/specs/2026-03-14-library-sidebar-design.md`
Scope: Implement a persistent lecture library sidebar with selectable lectures that load into the existing workspace.

## End State

LessonScribe loads saved lectures at startup, shows them in a left sidebar, highlights the active lecture, and lets the user click any saved lecture to hydrate the current workspace without re-importing or re-transcribing it.

## Delivery Strategy

This work is not a breaking migration, so it does not need expand-contract. The safest path is a vertical slice:

1. add backend lecture listing
2. expose it through frontend API/state
3. replace the sidebar UI with a selectable library
4. verify upload and hydration flows still work

Each step below is intended to fit inside roughly 1-3 hours and produce a verifiable outcome.

## Phase 1: Backend Listing

### Step 1. Add store support for listing lectures

Type: Earning
Goal: Return lecture metadata from storage without requiring transcript files.

Tasks:

- add a `list_lectures()` method to `LectureStore`
- scan lecture directories under `settings.lectures_dir`
- read `metadata.json` when present
- skip malformed or incomplete entries safely
- sort by `created_at` descending before returning

Done when:

- a direct store call returns all saved lectures newest first
- lectures without transcripts still appear

### Step 2. Add `GET /lectures`

Type: Earning
Goal: Expose the library over HTTP using existing `LectureMetadata`.

Tasks:

- add `GET /lectures` to `backend/app/main.py`
- return `list[LectureMetadata]`
- preserve existing behavior for all current endpoints

Done when:

- `GET /lectures` returns `200` and metadata-only payloads
- existing import, lecture, transcript, and audio endpoints still behave unchanged

### Step 3. Add backend tests for the library endpoint

Type: Earning
Goal: Lock down sorting and transcript-independent listing behavior.

Tasks:

- add API tests for `GET /lectures`
- verify imported lectures are returned
- verify newest-first ordering
- verify non-transcribed lectures are listed

Done when:

- backend test suite passes with the new endpoint covered

## Phase 2: Frontend Data Flow

### Step 4. Add a frontend library API helper

Type: Earning
Goal: Fetch lecture lists without disturbing current single-lecture helpers.

Tasks:

- add `fetchLectures()` to `frontend/src/api.ts`
- reuse existing response parsing
- keep `LectureMetadata` as the shared type

Done when:

- the frontend can fetch the list in isolation from the browser/devtools or tests

### Step 5. Introduce library state in `App`

Type: Earning
Goal: Track sidebar data separately from the active lecture.

Tasks:

- add `lectures` state
- add library loading and non-blocking error handling
- fetch lectures during startup alongside health and models
- resolve the initial lecture selection from `CURRENT_LECTURE_KEY` or newest lecture fallback

Done when:

- the app can boot with zero lectures, one lecture, or many lectures without crashing
- an invalid stored lecture ID falls back cleanly

### Step 6. Refresh the library after import

Type: Earning
Goal: Keep the sidebar and active workspace aligned after a new upload.

Tasks:

- refresh the lecture list after successful `importLecture`
- select the imported lecture immediately
- preserve existing reset behavior for transcript and job state

Done when:

- importing a lecture causes the new item to appear in the library and become active

## Phase 3: Sidebar UI

### Step 7. Replace the current sidebar sections with a library list

Type: Earning
Goal: Make the left pane show saved lectures instead of only the current-lecture detail cards.

Tasks:

- introduce a sidebar list layout in `frontend/src/App.tsx`
- render lecture title, filename, duration, created date, language, status, and model
- visually highlight the active lecture
- preserve the current visual style and transcript-first hierarchy

Done when:

- the left pane clearly shows the lecture library
- the active lecture is visually obvious

### Step 8. Wire lecture selection to workspace hydration

Type: Earning
Goal: Reuse the existing active-lecture flow instead of creating a second loading path.

Tasks:

- make lecture items clickable
- call `hydrateLecture(lectureId)` on selection
- update `CURRENT_LECTURE_KEY`
- ensure audio source, transcript, and player reset follow the selected lecture

Done when:

- clicking a library item updates the reader and player to that lecture
- a lecture with no transcript still loads audio/metadata and shows the existing empty transcript state

### Step 9. Add responsive handling for narrower screens

Type: Earning
Goal: Preserve library access without breaking the workspace.

Tasks:

- adjust CSS so the library stacks above or compresses appropriately on smaller widths
- avoid hiding selection affordances
- keep transcript and player usable on mobile-width layouts

Done when:

- the library remains visible and selectable on narrow screens

## Phase 4: Frontend Tests and Verification

### Step 10. Add frontend behavior tests

Type: Earning
Goal: Protect the new startup and selection flows.

Tasks:

- add tests for startup library loading and active lecture resolution
- add tests for clicking a lecture to hydrate the workspace
- add tests for post-import library refresh and selection

Done when:

- frontend tests cover the new list/select behavior

### Step 11. Run full verification

Type: Earning
Goal: Confirm the feature without hand-waving.

Tasks:

- run backend tests
- run frontend tests
- run frontend build
- smoke-test the app manually if time permits

Suggested commands:

- `cd backend && pytest`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run build`

Done when:

- automated checks pass
- the sidebar can load and switch lectures in the running app

## Recommended Execution Order

1. Steps 1-3: backend endpoint and tests
2. Steps 4-6: frontend library state and startup/import flow
3. Steps 7-9: sidebar UI and responsive behavior
4. Steps 10-11: tests and verification

## Rollback Strategy

If frontend integration becomes unstable, revert to a temporary state where:

- `GET /lectures` remains in place
- the frontend still hydrates a single active lecture
- the sidebar rendering change is isolated behind the `lectures` state work

This keeps the backend addition useful and limits recovery cost.

## Notes for Implementation

- Favor a small helper like `refreshLectures()` rather than duplicating fetch logic in startup and upload paths.
- Keep `hydrateLecture()` as the one place that loads full lecture data.
- Avoid fetching transcript payloads as part of the library list.
- Do not mix deletion or language-selection work into this slice.
