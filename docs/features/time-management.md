# Time Management

TaskNotes includes features for time tracking and productivity, such as a time tracker and a Pomodoro timer.

## Time Tracking

TaskNotes has a time tracker to record the time spent on each task. Time tracking information is stored in the `timeEntries` array within each task's YAML frontmatter. Each time entry includes a start time and an end time.

Use **TaskNotes: Start time tracking for current task** and **TaskNotes: Stop time tracking for current task** from the Command Palette, hotkeys, or command-based plugins such as Buttons. These commands act on the currently open task note, not on a task link under the cursor, and do not open a selector. Starting an already running timer or stopping an inactive timer leaves entries unchanged and shows a notice. To track another task, use **TaskNotes: Start time tracking (select task)**.

The time tracking interface includes controls to start and stop tracking in task views and task cards. TaskNotes prevents duplicate active sessions on the same task. Active sessions on different tasks can exist at the same time, and total time spent on each task is calculated from completed sessions.

### Stop an Active Tracker Without Opening Its Note

Use **TaskNotes: Stop active time tracking**, or the square stop button beside the tracking timer in the desktop status bar. With one active tracker, the action stops it directly. With several, it opens a selector containing active tasks so you can stop one; cancelling leaves every tracker running. The selector cannot create new tasks. Other trackers keep running.

The command does not depend on the currently open note and can also be assigned a hotkey. The status bar's task title still opens the tracked note, while the stop button only stops tracking. If a task is deleted or its tracker stops before you choose it, no new time entry is created.

### Auto-Stop Time Tracking

TaskNotes can automatically stop time tracking when a task is marked as completed. This feature ensures that time tracking data accurately reflects work completion without requiring manual timer management.

The auto-stop feature works by monitoring task status changes across all views and interfaces. When a task's status changes from any non-completed state to a completed state (as defined by the custom status configuration), any active time tracking session for that task is automatically terminated.

**Configuration Options:** Configure these under `Settings -> TaskNotes -> Features` (Time Tracking section).

- **Auto-stop tracking** - Enable or disable the automatic stopping behavior (enabled by default)
- **Completion notification** - Show a notice when auto-stop occurs (disabled by default)

**Behavior:**

- Monitors all task status changes in real-time
- Stops only the specific task that was completed (other active timers continue)
- Preserves the recorded time data in the task's time entries
- Works with both standard and recurring task completions
- Functions across all task views (list, kanban, calendar, etc.)

The feature integrates with the custom status system, so completion detection respects your configured workflow statuses rather than relying on hardcoded completion states.

## Estimate Calibration

TaskNotes compares your time estimates with the time you actually tracked, so you can see how far off your estimates usually are.

Calibration uses completed tasks from the last 90 days that have both a time estimate and tracked time. For each task it divides the tracked time by the estimate, then takes the median of those ratios. A ratio of 1.5 means a task estimated at 60 minutes usually takes about 90. Ratios below 0.2 or above 10 are dropped as outliers, for example a timer left running overnight. At least 5 tasks are needed before any factor is shown.

Factors are worked out overall, for each estimate size (up to 30 minutes, 30–120 minutes and over 2 hours), and for each context that has at least 5 tasks. A task's factor comes from its first context if that context has enough tasks, otherwise from its size, otherwise from the overall factor.

- **Stats view:** the **Estimate accuracy** card shows the overall factor ("Tasks usually take 1.5× your estimate"), how many tasks it is based on, and the factor for each size and context.
- **Task modal:** when you enter an estimate and the factor differs from 1 by 15% or more, a hint below the field reads "Based on similar tasks, likely ~1h 30m". Click **Use** to put that value in the estimate field.

Estimates are never changed automatically. The hint only fills in the field when you click **Use**. **Use calibrated estimates for planning** (on by default) applies the factor to estimates when [daily capacity](#daily-capacity) adds up planned time, without changing the tasks. The window (7–365 days) and this option are under **Settings → TaskNotes → Features → Planning**.

## Daily Capacity

Daily capacity compares the time you have planned for a day with the free time you have that day.

**Free time** is your work hours for the day minus time taken by busy calendar events. For today, it counts from now until the end of your work hours. Work hours are set per weekday in **Settings → TaskNotes → Features → Planning** (Monday to Friday, 09:00–17:00 by default). Overlapping events are merged, so they are not counted twice. Events from Google Calendar, Microsoft Outlook and ICS subscriptions count as busy, and you can choose which calendars count. Declined invitations are ignored. Invitations you haven't answered, or answered with "maybe", count as busy. All-day events only count when **Count all-day events as busy** is on. Timeblocks do not reduce free time.

**Planned time** is the remaining estimate of each task scheduled for that day, or due that day if it has no scheduled date, including recurring task instances on that day. The remaining estimate is the time estimate minus time already tracked. For recurring tasks, only time tracked on that day is subtracted. When calibration is applied, the estimate is adjusted first. Tasks without an estimate use **Default estimate for tasks without one** if you set it, and are otherwise listed as unestimated. Overdue tasks from earlier days are not counted.

### Status bar

On desktop, the status bar shows `Today: 3h planned · 2h free`, with `· 1h over` added when planned time exceeds free time. It is hidden when nothing is planned for today. Click it to see today's tasks with their planned time, open the Tasks base on its Today view with **Open today view**, or, when the [inbox](task-management.md#inbox-and-triage) is enabled, use **Move some to inbox…**. Turn the status bar item off with **Show today's capacity in the status bar**.

On mobile, where there is no status bar, use the **Show today's capacity** command to open the same popover.

### Overbook notice

When you schedule a task onto a day that is already full, TaskNotes shows a notice such as "Friday is now 1h over your available time." The notice appears when you change dates in the task modals, drag or resize a task in the calendar, set dates from the batch menu, or schedule tasks in triage. Dragging a task to span several days does not trigger it. It is shown at most once per day every 5 minutes, and never for changes made through the HTTP API, MCP or webhooks. Turn it off with **Warn when a day becomes overbooked**.

## Pomodoro Timer

TaskNotes also includes a Pomodoro timer, which is a tool for time management that uses a timer to break down work into intervals, separated by short breaks. The Pomodoro timer in TaskNotes has a dedicated view with controls to start, stop, and reset the timer.

When a task is associated with a Pomodoro session, TaskNotes starts a task tracker if none is already running. Pomodoro only stops trackers it created; a pre-existing manual tracker is left running. After sleep or a delayed timer tick, a completed Pomodoro-owned tracker ends at the session's intended completion time, rather than the wake-up time.

## Productivity Analytics

The **Pomodoro Stats View** provides analytics and historical data about your Pomodoro sessions. This includes a history of completed sessions, as well as metrics like completion rates and total time spent on tasks. The data can be visualized to show productivity patterns over time.

![Task Statistics](../assets/feature-task-statistics.png)
