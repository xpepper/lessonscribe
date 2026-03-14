# Force Delete Running Lecture Design

Date: 2026-03-14
Status: Approved for planning
Scope: Allow users to force-delete a lecture that is still transcribing by attempting cancellation first and then removing the lecture even if cancellation is imperfect.

## Goal

Extend lecture deletion so a user can remove a lecture that is currently in `preparing`, `downloading-model`, or `transcribing`.

For this slice, the product should:

- let the user force-delete a running lecture from the existing sidebar actions flow
- attempt to cancel the active transcription job first
- proceed with lecture deletion even if cancellation is not perfectly graceful
- keep the backend and worker thread from recreating or mutating a deleted lecture after removal

This slice intentionally preserves ordinary delete semantics for non-running lectures.

## Current Baseline

The current application:

- stores lecture metadata with `active_job_id` on the lecture record
- runs transcription in a background thread managed by `JobManager`
- blocks deletion with `409 Conflict` when the lecture still has an active job
- shows running lectures in the sidebar but currently prevents deletion in the UI

The current job system has no cancellation API, so force delete requires a small job-lifecycle extension rather than only a UI change.

## Chosen Approach

Add a force-delete backend path on the existing lecture delete endpoint and make job cancellation a cooperative backend concern.

This approach was chosen because it:

- keeps destructive behavior centralized on the backend
- avoids splitting cancellation and deletion across fragile client-side retries
- gives the clearest contract for future job-control work

## User Experience

### Running Lecture Action

Running lectures keep the same sidebar actions entry point.

For a lecture in:

- `preparing`
- `downloading-model`
- `transcribing`

the delete action should still be available, but the confirmation copy must clearly state that LessonScribe will first try to cancel the transcription job and then remove the lecture.

### Confirmation

The force-delete confirmation dialog should:

- name the lecture
- state that transcription is currently running
- explain that the app will first attempt cancellation
- explain that the lecture and its local artifacts will still be removed even if cancellation is not clean

This is a stronger destructive confirmation than the standard completed-lecture deletion copy.

### Successful Force Delete

If the user confirms and the backend removes the lecture:

- the lecture disappears from the sidebar
- if the lecture was active, the workspace clears to the existing empty state
- any local active-job state for that lecture is cleared
- no replacement lecture is auto-selected

## Backend Design

### API

Extend:

- `DELETE /lectures/{lecture_id}`

with a force-delete option, for example:

- `DELETE /lectures/{lecture_id}?force=true`

Behavior:

- normal delete on a running lecture still returns `409 Conflict`
- force delete on a running lecture attempts cancellation first, then deletes the lecture
- successful storage removal still returns `204 No Content`

### Job Cancellation

`JobManager` should gain cooperative cancellation support:

- record cancellation requests by job ID
- expose `cancel_job(job_id)` for the delete path
- let the worker thread check for cancellation at safe checkpoints

The worker does not need hard thread termination. Cooperative exit is sufficient.

### Force Delete Flow

When `force=true` is requested and the lecture has an active running job, the backend should:

1. load lecture metadata
2. resolve the active job
3. request cancellation for that job
4. mark the job as `canceled` if the system can do so immediately, or mark cancellation intent in a way the worker can observe
5. clear lecture `active_job_id`
6. delete the lecture directory

If cancellation signaling itself encounters an internal failure, deletion should still continue as long as the lecture can be removed.

### Job State

Add a terminal `canceled` job state to distinguish user cancellation from ordinary failure.

This state is useful for:

- clear backend semantics
- future UI messaging
- avoiding misleading `failed` statuses after explicit user action

### Worker Safety

After force deletion, a worker thread may still wake up briefly.

The worker must handle two conditions safely:

- cancellation has been requested
- lecture storage or metadata is now missing

In either case, the worker should exit without:

- recreating lecture metadata
- rewriting lecture status to `failed`
- writing transcript output for a deleted lecture

## Frontend Design

### State

Keep:

- lecture deletion within the existing sidebar action flow
- ordinary delete path for completed and idle lectures

Add:

- detection for running-lecture deletion
- stronger confirmation copy for force delete
- force-delete request path for running lectures

### Data Flow

The frontend deletion helper should support force delete, for example through a boolean option.

Deletion behavior:

- running lecture: call force delete
- non-running lecture: call normal delete

On successful force delete:

- remove the lecture from `lectures`
- clear `lecture`, `transcript`, and playback state if it was active
- clear `job` if it belongs to the deleted lecture

### UI Structure

No new management screen is added.

The only UI expansion is:

- stronger confirmation text when the selected lecture is still running

The sidebar action surface remains the same.

## Failure Handling

- normal delete without force on a running lecture continues to return `409`
- force delete should only fail if lecture lookup or lecture removal itself fails in a material way
- if a force-delete request succeeds, the frontend should treat the lecture as removed even if the underlying job needed to unwind asynchronously
- if force delete fails, the lecture stays visible and the user sees a clear error

## Testing

### Backend

Add tests for:

- ordinary delete still returns `409` for a running lecture
- force delete on a running lecture returns `204` and removes lecture storage
- force delete clears lecture linkage to the active job
- canceled workers encountering a missing lecture exit safely without recreating metadata
- canceled jobs are represented with the new `canceled` state

### Frontend

Add tests for:

- running lectures show force-delete confirmation copy
- confirming force delete calls the force-delete path
- force-deleting the active running lecture clears the workspace
- force-delete failure leaves the lecture visible and surfaces an error

## Out of Scope

This slice does not include:

- a general pause/resume job-control UI
- multi-job concurrency redesign
- hard thread termination
- restoring canceled lectures
- bulk force delete

## Implementation Notes

- Keep cancellation best-effort but explicit; do not pretend it is instantaneous thread termination.
- Backend logic should own the cancellation-plus-delete sequence so the client does not coordinate multiple unsafe calls.
- The worker must treat missing lecture storage as an expected condition after force delete, not as a recoverable failure that rewrites deleted state.
- Preserve the current empty-workspace behavior after deleting the active lecture.

## Workflow Note

The brainstorming skill calls for a spec-review subagent before planning. That step is intentionally not executed here because the current session instructions do not allow spawning sub-agents unless the user explicitly requests delegated or sub-agent work.
