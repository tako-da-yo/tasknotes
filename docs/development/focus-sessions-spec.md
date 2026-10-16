# Spec: Focus sessions in the energy sidebar

Status: draft · 2026-10-16

The Pomodoro timer moves into the energy sidebar, renamed "Energy & focus", and learns to plan a whole piece of work rather than a single fixed 25-minute timer. A focus session takes the time planned for a task or timeblock, splits it into chunks with breaks when it is longer than 30 minutes, and runs the chunks in sequence while showing where you are in the whole session.

The aim is to support flow in ADHD minds: lower the cost of starting, make time visible, and match chunk length to how draining the work is.

## Decisions

- **The Pomodoro view is folded in.** Its timer, controls, task selector and stats move into the energy sidebar. The old view type stays registered only so that saved workspaces open the energy sidebar instead of an error.
- **Breaks are inside the planned time** for both tasks and timeblocks. A 90-minute estimate is 90 minutes from start to finish, breaks included.
- **Chunk targets by energy kind:** Drain 20m, Steady 25m (the Pomodoro work duration), Spark 45m.

## Planned time

| Source | Planned time |
|---|---|
| Task with an estimate | Estimate minus time already tracked on the task |
| Timeblock | End minus start; end minus now if the block has already started |
| Anything else, or no planned time left | One chunk of the Pomodoro work duration |

The energy kind comes from the item's context, as for the battery: a task's contexts, or a timeblock's context. Items without a Spark or Drain context are Steady.

A timeblock's session tracks time against its attached task when it has exactly one.

## Splitting (`src/core/focusPlan.ts`)

- Planned time of 30 minutes or less (the split threshold): one work chunk of that length.
- Otherwise, with target `t` for the energy kind and short break `b`: `n = max(1, round((planned + b) / (t + b)))` work chunks with `n − 1` breaks between them. Every `longBreakInterval`th break in the session is a long break. Work time is the planned time minus the breaks, spread evenly in whole minutes, with leftover minutes going to the earliest chunks. If that leaves a chunk under 10 minutes, use fewer chunks.

Examples with 5m short breaks: 100m Steady is 4 × 21-22m; 75m Spark is 2 × 35m; 50m Drain is 2 × 22-23m; a 10:00–12:00 Steady timeblock is 4 × 26-27m.

## Running a session

The plan is stored on the Pomodoro state (`PomodoroState.plan`) so it survives a reload, and is cleared with the session when the day changes.

- Each chunk runs as an ordinary Pomodoro work or break session, so time tracking, history, stats, webhooks and the status bar keep working.
- When a chunk ends, the next chunk starts automatically, regardless of the auto-start settings: running the plan in sequence is the point of a focus session.
- **Skip** ends the current chunk and moves to the next. **Stop** ends the whole session.
- After the last chunk, the session ends and the timer returns to the normal work duration.

## Sidebar

The focus section sits above the energy content and keeps the Pomodoro view's timer, controls, task selector and stats. During a focus session it adds:

- the item's title and energy kind, and the planned time;
- a bar for the whole session with one segment per chunk, filled as chunks complete;
- "Chunk 2 of 4" and the clock time the session ends.

## Entry points

- A ▶ button on tasks and timeblocks in the energy panel's effects list.
- **Start focus session** in the task context menu.
- The existing Pomodoro commands and ribbon button open the sidebar.

## Settings (Pomodoro section)

- **Split sessions longer than** (minutes, default 30)
- **Drain chunk length** (default 20) and **Spark chunk length** (default 45). Steady chunks use the work duration.

## Later phases

1. **Flow:** "I'm in flow (+10m)" to push a break back, a hyperfocus guard after about 90 minutes without a break, a warning two minutes before a chunk ends, and a one-line re-entry note at each break.
2. **Energy:** the session's battery cost before starting, and estimate-against-actual feedback when a session needs another chunk.
3. **Calendar:** **Start focus session** in the calendar's timeblock context menu.
