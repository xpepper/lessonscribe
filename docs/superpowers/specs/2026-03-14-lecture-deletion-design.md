# Lecture Deletion Design

Date: 2026-03-14
Status: Approved for planning
Scope: Allow users to delete an entire saved lecture, including its uploaded audio and any generated transcript artifacts.

## Goal

Extend the new library sidebar so users can remove lectures they no longer want to keep in local storage.

For this slice, the product should:

- let the user trigger deletion from a per-lecture action in the sidebar
- require explicit confirmation before removing data
- delete the entire saved lecture from local app storage
- clear the workspace to the existing empty state when the active lecture is deleted

This slice intentionally removes the whole lecture record rather than supporting transcript-only deletion.

## Current Baseline

The current application:

- stores each lecture in its own directory under app-managed local storage
- exposes lecture listing, metadata, transcript, and audio endpoints
- renders a saved-lecture library in the left sidebar
- hydrates one active lecture into the transcript and player workspace
- persists the selected lecture ID in `CURRENT_LECTURE_KEY`

The backend storage model is already lecture-directory based, so whole-lecture deletion fits the existing persistence boundary cleanly.

## Chosen Approach

Add a per-lecture actions trigger to each sidebar item and route destructive removal through a custom confirmation dialog.

This approach was chosen because it:

- keeps the sidebar visually clean
- reduces accidental clicks compared with a permanently visible delete button
- creates a reusable place for future lecture actions without redesigning the list

## User Experience

### Sidebar Action

Each lecture row shows a compact actions trigger.

Opening that trigger exposes:

- `Delete lecture`

No bulk-delete or library management mode is included in this slice.

### Confirmation

Choosing `Delete lecture` opens a confirmation dialog that:

- names the lecture being deleted
- states that local audio and transcript data will be removed
- offers cancel and confirm actions

The destructive action should be visually distinct from ordinary controls.

### Successful Deletion

If the user confirms and deletion succeeds:

- the lecture disappears from the sidebar
- if the lecture was not active, the current workspace remains unchanged
- if the lecture was active, the app clears the active lecture and returns to the existing empty workspace state
- `CURRENT_LECTURE_KEY` is removed when the active lecture is deleted

### Cancelled Deletion

If the user cancels:

- the dialog closes
- no lecture state changes

## Backend Design

### API

Add:

- `DELETE /lectures/{lecture_id}`

Responses:

- `204 No Content` when deletion succeeds
- `404 Not Found` when the lecture does not exist
- `409 Conflict` when the lecture has an active transcription job and cannot be deleted safely

### Storage

`LectureStore` should gain a method that:

- verifies the lecture exists via its directory or metadata
- removes the entire lecture directory from app-managed storage
- leaves unrelated lecture directories untouched

Deleting the lecture directory removes:

- metadata
- uploaded source audio
- normalized audio artifacts
- transcript artifacts

### Job Safety

Deletion must not race against an in-flight transcription job.

For this slice, the backend should reject deletion when the lecture metadata points to an `active_job_id` whose job state is still running:

- `preparing`
- `downloading-model`
- `transcribing`

Finished jobs do not block deletion.

## Frontend Design

### State

Keep existing:

- `lecture`
- `lectures`
- `job`
- `transcript`
- player state

Add:

- state for the lecture pending deletion
- a small delete-in-progress state for the dialog confirm button
- an error surface for deletion failures

### Data Flow

Add a frontend API helper:

- `deleteLecture(lectureId): Promise<void>`

Deletion flow:

1. open actions menu for a lecture
2. choose `Delete lecture`
3. show confirmation dialog
4. call `DELETE /lectures/{lecture_id}` on confirm
5. update local library state or refresh the library list
6. if the deleted lecture is active, clear the workspace and persisted selection key

### Workspace Clearing

When the active lecture is deleted, the frontend should clear:

- active lecture metadata
- transcript payload
- segment views
- current job for that lecture
- playback time and duration
- current audio source derived from the lecture

The result should match the app's existing empty workspace behavior rather than auto-selecting another lecture.

### UI Structure

This slice adds:

- a compact per-item actions trigger in the sidebar
- a reusable confirmation modal for destructive lecture deletion

The existing library layout, transcript reader, and player structure stay unchanged.

## Failure Handling

- If a delete request returns `404`, the frontend should stop the deletion flow and show a clear message.
- If a delete request returns `409`, the frontend should explain that the lecture cannot be deleted while transcription is running.
- If the delete request fails for any other reason, the lecture should remain in the list and the user should see a non-silent error.
- If the deleted lecture is already gone from `CURRENT_LECTURE_KEY` resolution on a later startup, existing missing-selection fallback rules remain valid.

## Testing

### Backend

Add tests for:

- successful lecture deletion removes the lecture from storage and from `GET /lectures`
- deleting an unknown lecture returns `404`
- deleting a lecture with an active job returns `409`

### Frontend

Add tests for:

- opening lecture actions and showing the delete confirmation dialog
- confirming deletion removes a non-active lecture from the sidebar
- confirming deletion of the active lecture clears the workspace and persisted selection key
- a failed delete request leaves the lecture visible and surfaces an error

## Out of Scope

This slice does not include:

- transcript-only deletion
- soft delete or trash/restore behavior
- bulk deletion
- auto-selecting another lecture after deleting the active one
- extra lecture actions beyond deletion

## Implementation Notes

- Keep deletion scoped to the existing library sidebar instead of adding a separate management screen.
- Prefer checking active-job conflict on the backend rather than trusting frontend state.
- Reuse the app's existing empty-state rendering when the active lecture is removed.
- Do not mix search, sorting, or transcript management work into this slice.

## Workflow Note

The brainstorming skill calls for a spec-review subagent before planning. That step is intentionally not executed here because the current session instructions do not allow spawning sub-agents unless the user explicitly requests delegated or sub-agent work.
