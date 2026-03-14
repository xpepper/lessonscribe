# Make Dev Workflow Design

Date: 2026-03-14
Status: Approved for planning
Scope: Add simple Make targets so LessonScribe can start backend and frontend with one command.

## Goal

Reduce the friction of running LessonScribe locally during development.

For this slice, the product should:

- let the developer start both backend and frontend with `make dev`
- keep separate `make backend` and `make frontend` entry points for direct use
- stop both processes cleanly when `make dev` is interrupted
- document the Make-based workflow in the README

This slice intentionally focuses on local developer convenience rather than a general process-management system.

## Current Baseline

The current project requires:

- one terminal for the backend
- one terminal for the frontend
- manual directory changes before each command

The relevant commands already exist and work:

- backend: `cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000`
- frontend: `cd frontend && npm run dev`

## Chosen Approach

Add a small top-level `Makefile` that shells out to the existing backend and frontend commands.

This approach was chosen because it:

- keeps the workflow obvious and easy to remember
- adds almost no moving parts
- avoids introducing a separate process manager for a small local app

## User Experience

### Primary Command

Developers should be able to run:

- `make dev`

and get both services started in the same terminal session.

### Secondary Commands

Developers should also be able to run:

- `make backend`
- `make frontend`

when they want just one service.

### Shutdown Behavior

When `make dev` is interrupted with `Ctrl+C`, it should stop both child processes rather than leaving one of them running in the background.

### Logs

The first implementation may keep logs in one terminal, but they should stay readable. Prefixing backend and frontend output is preferred if it can be done without making the recipe brittle.

## Implementation Design

### Makefile

Add a root `Makefile` with at least these targets:

- `dev`
- `backend`
- `frontend`

Optional setup targets such as `install` are out of scope unless they fall out naturally and remain small.

### Commands

`make backend` should run the existing backend dev command:

- `cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000`

`make frontend` should run the existing frontend dev command:

- `cd frontend && npm run dev`

`make dev` should:

- start both commands
- keep them attached to the current terminal
- trap interrupts and terminate both child processes

### Shell Strategy

Prefer a single-shell recipe using background jobs and `trap` handling instead of adding another helper script, unless the recipe becomes hard to read.

The implementation should stay transparent enough that a developer can understand it from the `Makefile` alone.

## README Changes

Update the run instructions in [README.md](/Users/pietrodibello/Documents/workspace/ai/lessonscribe/README.md) so they:

- lead with `make dev` as the easiest way to start the app
- still include the explicit backend and frontend commands as fallback
- explain that `Ctrl+C` stops the combined workflow

## Failure Handling

- If the backend command fails immediately, `make dev` should not leave the frontend orphaned.
- If the frontend command fails immediately, `make dev` should not leave the backend orphaned.
- If one child exits while the other is still running, the combined workflow should terminate rather than hanging silently.

## Testing

Add lightweight verification for:

- `make backend` starts the backend command
- `make frontend` starts the frontend command
- `make dev` starts both services together and can be interrupted cleanly

Manual verification is acceptable for process behavior in this slice if it is explicitly performed and reported.

## Out of Scope

This slice does not include:

- OS-specific terminal window automation
- Docker or container workflows
- a dedicated process manager such as `foreman`, `honcho`, or `overmind`
- environment bootstrapping for all dependencies

## Implementation Notes

- Keep the Make targets minimal and readable.
- Reuse the exact commands developers already use today.
- Avoid adding hidden indirection unless the Make recipe truly needs it.
- Prefer the simplest approach that reliably starts and stops both processes.

## Workflow Note

The brainstorming skill calls for a spec-review subagent before planning. That step is intentionally not executed here because the current session instructions do not allow spawning sub-agents unless the user explicitly requests delegated or sub-agent work.
