# Spec: Inbox triage, fresh start, estimate calibration, daily capacity and energy

Status: draft · 2026-10-15

Three related features. All aim to make the task list less overwhelming and the plan for a day more realistic, which matters most for users with ADHD.

- **Feature A, inbox triage and fresh start:** capture tasks without making any decisions, sort them later one at a time, and recover from a pile of overdue tasks in one reversible step.
- **Feature B, estimate calibration and daily capacity:** learn how long tasks really take compared with their estimate, and show whether the work planned for a day fits in the time available.
- **Feature C, energy ("mental battery"):** each context is marked Spark, Steady or Drain. Combined with the size of each task or event, this gives a battery level for each day. It is shown as a small indicator on each calendar day and in a widget for today.

## Design principles

1. **One decision at a time.** No screen should require looking at a long list before acting.
2. **Never destructive by default.** Bulk actions can be undone, "drop" archives rather than deletes, and stored estimates are never rewritten.
3. **No shame signals.** No streaks that reset, no growing red counters. Overload warnings are informational and never block an action.
4. **Bases first.** Each list view ships as a default `.base` view that users can inspect and edit. Plugin code is only for interaction and computation that Bases cannot express.
5. **Few settings, sensible defaults.** Everything works with no configuration once the feature is turned on.

---

## Feature A: inbox triage and fresh start

### A1. Inbox and Someday statuses

There is no inbox concept today. The default statuses are `none`, `open`, `in-progress` and `done` ([defaults.ts:28-73](../../src/settings/defaults.ts#L28-L73)). Inbox membership will be **explicit, using a status**, rather than inferred from "has no dates". Many users keep unscheduled tasks on purpose, and those should not suddenly appear in the inbox.

**New settings** (Task properties → Statuses card, [statusPropertyCard.ts](../../src/settings/tabs/taskProperties/statusPropertyCard.ts)):

| Setting | Type | Default | Notes |
|---|---|---|---|
| `triage.inboxStatus` | status value or `""` | `""` (off) | Choosing a status turns the feature on. |
| `triage.somedayStatus` | status value or `""` | `""` | Optional. If empty, the triage "Someday" action is hidden. |
| `triage.captureToInbox` | boolean | `true` | When a new task has no due date, scheduled date or explicit status, give it `inboxStatus` instead of `defaultTaskStatus`. |

**Enabling the feature:** the card has an "Enable inbox" button. If statuses with the values `inbox` and `someday` do not exist, it creates them, then fills in the two settings:

- `inbox`: `isCompleted: false`, `excludeFromCycle: true`, ordered before `open`.
- `someday`: `isCompleted: false`, `excludeFromCycle: true`.

Existing vaults are left alone until the user presses the button. For new installs, the bootstrap starter could offer the button, but that is not required for v1.

**Capture rule:** `captureToInbox` only changes the default status. It applies in `TaskCreationModal` and NLP quick capture, and to inline conversion when no status is given. A status typed in NLP text or chosen in the modal always wins. The HTTP API, MCP and CLI are unaffected unless they omit `status`; see open question Q1.

### A2. Default Bases views

Add two views to `tasks-default.base` in [templates/defaultBasesFiles.ts](../../src/templates/defaultBasesFiles.ts), next to Today, Overdue and Unscheduled (around :770-853). They are only generated when `triage.inboxStatus` is set.

- **Inbox:** `status == <inboxStatus>`, not archived, sorted by `dateCreated` ascending (oldest first).
- **Someday:** `status == <somedayStatus>`, not archived, sorted by `dateModified` ascending.

Existing users get the new views through "Update default files" ([generalTab.ts:489-530](../../src/settings/tabs/generalTab.ts#L489-L530)). These views are fully usable without the triage modal.

### A3. Triage modal

**Command:** `triage-inbox`, "Triage inbox". It is also reachable from a button in the Inbox view's toolbar if that is cheap to add, otherwise the command is enough.

**Behaviour:**

- Loads the inbox tasks (same query as the Inbox view, oldest first) and shows **one task at a time**.
- Each card shows:
  - the title
  - the first ~5 lines of details
  - its age ("captured 6 days ago")
  - projects, contexts and tags, if any
  - progress, e.g. "3 of 12"
- Actions, each with a single-key shortcut. The modal takes focus, and the keys work only while it is open.

| Key | Action | Effect |
|---|---|---|
| `1` | **Today** | `status = defaultTaskStatus`, `scheduled = today` |
| `2` | **Schedule…** | Presets: tomorrow, this weekend, next week, pick date. Reuse the preset logic from `BatchContextMenu.addDateOptions` ([BatchContextMenu.ts:293](../../src/components/BatchContextMenu.ts#L293)) and `DateTimePickerModal`. Sets `status = defaultTaskStatus`, `scheduled = date`. |
| `3` | **Someday** | `status = somedayStatus` (hidden if the setting is unset) |
| `4` | **Done already** | Mark complete via `TaskService.updateProperty(task, "status", <first completed status>)`, so `completedDate` is set as usual |
| `5` | **Drop** | `toggleArchive`. Nothing is deleted. |
| `E` | **Edit** | Opens the normal task edit modal. On save, the task returns to triage. If it is no longer in the inbox, the modal moves on to the next task. |
| `→` / `S` | **Skip** | Leave the task in the inbox and move on |
| `Z` | **Undo last** | Reverts the previous action in this session |
| `Esc` | Close | Changes so far are kept |

- Every action goes through `TaskService.updateProperty` / `updateTask` ([TaskService.ts:586](../../src/services/TaskService.ts#L586), [:1750](../../src/services/TaskService.ts#L1750)), so webhooks, calendar sync and auto-archive behave as they do for any other edit.
- **Session undo:** the modal keeps a stack of `{path, previous: Partial<TaskInfo>}`. `Z` pops the stack and restores the previous values.
- **End screen:** "Inbox clear. 9 sorted, 3 skipped." No streaks or scores.
- **Empty inbox:** shows the end screen immediately with a "Capture a task" button.
- **Recurring tasks** in the inbox are triaged like any other task. "Today" sets `scheduled`, which is the recurrence anchor in the normal way.

Implementation: a new `src/modals/InboxTriageModal.ts` extending Obsidian `Modal`, following the pattern in `ConfirmationModal` (static `tn-static-*` classes, no inline styles). The command is added to `createTaskNotesCommandDefinitions` ([taskNotesCommands.ts:9](../../src/commands/taskNotesCommands.ts#L9)). All strings go under `modals.inboxTriage.*` in all locales.

### A4. Fresh start

**Command:** `fresh-start`, "Fresh start: reset overdue tasks".

**Selection:** tasks that are not completed, not archived, **not recurring**, and have `scheduled < today` or `due < today`.

Recurring tasks are excluded because missed instances already have their own skip and complete handling (`toggleRecurringTaskSkipped`). A later version could add "skip all missed instances".

**Confirmation modal**, which shows counts before anything changes:

> 14 tasks are overdue.
> - 9 have past **scheduled** dates. These will be cleared and the tasks moved to your inbox.
> - 5 have past **due** dates. ☐ Also clear past due dates (off by default, because due dates are often real deadlines)
>
> [Fresh start] [Cancel]

**Effect for each selected task:**

- `scheduled` is cleared if it is before today.
- `due` is cleared only if it is before today and the checkbox was ticked.
- `status = inboxStatus` if the inbox is enabled. Otherwise the status is unchanged and the task lands in the existing "Unscheduled" view.
- A task with only a past due date, and the due checkbox unticked, is left completely unchanged and stays in the Overdue view.

**Undo:**

- Before writing, store a snapshot `{runAt, entries: [{path, scheduled, due, status}]}` in plugin data under `triage.lastFreshStart`. Only the most recent run is kept.
- A notice offers "Undo" for 10 seconds. A command, `undo-fresh-start` ("Undo last fresh start"), stays available while a snapshot exists.
- Undo restores each field **only if its current value still equals what fresh start wrote**. This avoids overwriting edits the user made in the meantime. Skipped tasks are counted and reported in a notice.

**Batching:** writes are sequential through `updateProperty`, as in `BatchContextMenu.batchUpdateProperty` ([:429](../../src/components/BatchContextMenu.ts#L429)), with a progress notice when there are more than 20 tasks. The fresh start and undo logic should live in a small service, `src/services/TriageService.ts`, so the HTTP API and MCP can expose it later.

**Multi-select:** `BatchContextMenu` gets a "Fresh start selected" item that applies the same effect to the selected tasks only.

### A5. Out of scope for v1

- Assigning a project or context inside triage (use Edit for now)
- An inbox count in the status bar
- AI-suggested triage

---

## Feature B: estimate calibration and daily capacity

### B1. Calibration model

**New service:** `src/services/EstimateCalibrationService.ts`. It reads the task cache (`TaskManager`) and is built in [pluginBootstrap.ts](../../src/bootstrap/pluginBootstrap.ts) next to `taskStatsService`.

**Sample:** tasks that meet all of these:

- completed, with `completedDate` within the last `calibration.windowDays` days (default 90)
- `timeEstimate > 0`
- `totalTrackedTime > 0`

Archived tasks are included.

**Per-task ratio:** `r = totalTrackedTime / timeEstimate`.

**Outlier filter:** drop samples with `r < 0.2` (usually untracked work) or `r > 10` (usually a timer left running).

**Statistics:**

- **Overall factor:** the median of `r`. The median is used because it is robust against outliers. Also report n and the interquartile range.
- **By estimate size:** buckets of ≤ 30 min, 31–120 min and > 120 min. These differ in practice: small tasks are often under-estimated by a large factor.
- **By context and by project:** only for groups with n ≥ 5.
- **Minimum data:** fewer than 5 samples overall gives `null`, shown as "Not enough tracked tasks yet (3 of 5)".

**Factor to apply to a task:** use the most specific group with n ≥ 5, in this order: context → size bucket → overall. Projects are excluded from this fallback because they are often small and noisy. They appear in the stats only.

**Caching:** results are memoised and recomputed, debounced by about 2 s, when a task changes. The computation is O(tasks) and cheap.

**API:**

```ts
interface CalibrationGroup { factor: number; n: number; p25: number; p75: number }
interface CalibrationResult {
  overall: CalibrationGroup | null;
  bySize: Record<"small" | "medium" | "large", CalibrationGroup | null>;
  byContext: Record<string, CalibrationGroup>;
  byProject: Record<string, CalibrationGroup>;
  windowDays: number;
}
getCalibration(): CalibrationResult
getFactorFor(task: TaskInfo): { factor: number; source: "context" | "size" | "overall" } | null
calibratedMinutes(task: TaskInfo): number | null // timeEstimate × factor, rounded to 5 min
```

The stored `timeEstimate` is **never** changed.

### B2. Calibration UI

1. **StatsView card "Estimate accuracy"** ([StatsView.ts](../../src/views/StatsView.ts), next to the tracked/estimated card around :667):
   - Headline: "Tasks usually take **1.6×** your estimate" (median of 23 tasks, last 90 days).
   - A small table by size bucket, and by context where there is enough data.
   - Wording stays neutral. It never says "you're bad at estimating".
2. **Hint in the task modal** under the time estimate field: "Based on similar tasks, likely ~1h 20m". Shown only when a factor exists and differs from 1.0 by at least 15%. Clicking it does **not** change the estimate. A separate small "Use" link sets the field, so changing the estimate is always deliberate.
3. **Setting `calibration.applyToPlanning`** (default **on** once there is enough data): the capacity calculation (B4) uses calibrated minutes. The calendar's estimate-based event durations ([calendarTaskEvents.ts:43](../../src/bases/calendarTaskEvents.ts#L43)) are **not** changed in v1.

### B3. Work hours

There is no availability concept today. `slotMinTime` and `slotMaxTime` only control the calendar display.

**New settings group "Planning"** in the Features tab ([featuresTab.ts](../../src/settings/tabs/featuresTab.ts)):

| Setting | Default |
|---|---|
| `planning.workHours` | Mon–Fri 09:00–17:00, Sat/Sun off. One editable start/end pair per weekday, or "off". |
| `planning.busyCalendars` | all enabled Google, Microsoft and ICS calendars. A per-calendar checklist. |
| `planning.allDayEventsBusy` | `false`. All-day events are often holidays or reminders, so they are not counted by default. |
| `planning.defaultEstimate` | `null`. If set, tasks without an estimate count as this many minutes. |
| `planning.showInStatusBar` | `true` |
| `planning.warnOnOverbook` | `true` |

### B4. Capacity calculation

**Shared collector:** the list of what is on a given day comes from `src/services/DayPlanService.ts`, which Feature C uses too.

```ts
getDayItems(date: Date): DayItem[]
getDayItemsInRange(start: Date, end: Date): Map<string, DayItem[]> // one pass for a calendar's visible range
```

```ts
interface DayItem {
  kind: "task" | "event" | "timeblock";
  ref: string;        // task path, event id or timeblock id
  minutes: number;    // the item's size (rules differ per consumer)
  start?: string;     // ISO; only for timed items
  end?: string;
  contexts: string[];
  done: boolean;      // completed task, or an event or timeblock already in the past
}
```

**New service:** `src/services/CapacityService.ts`, built on `DayPlanService`.

**Signature:** `getDayCapacity(date: Date): DayCapacity`

```ts
interface DayCapacity {
  date: string;              // YYYY-MM-DD
  availableMinutes: number;  // work window minus busy events
  plannedMinutes: number;    // remaining task estimates (calibrated if enabled)
  unestimatedCount: number;  // tasks with no estimate and no defaultEstimate
  tasks: { path: string; minutes: number; calibrated: boolean }[];
  overByMinutes: number;     // max(0, planned - available)
}
```

**Available time:**

1. Start from the work window for that weekday. For today, the window starts at `max(now, workStart)`, so the bar reflects the time actually left.
2. Collect busy intervals from the selected calendars:
   - Sources: `icsSubscriptionService.getAllEvents()`, `googleCalendarService.getAllEvents()` and `microsoftCalendarService.getAllEvents()` (see [CalendarView.ts:1904-1916](../../src/bases/CalendarView.ts#L1904-L1916)). These read the in-memory caches and make no network calls.
   - Clip each event to the window.
   - **Merge overlapping intervals** before subtracting, so double-booked meetings are not counted twice.
   - Exclude all-day events unless `allDayEventsBusy` is on.
   - Exclude events whose ICS/Google transparency is "free", if the event model exposes it (Q4).
3. **Timeblocks do not reduce availability.** They are time set aside *for* tasks, so subtracting them would count the same work twice. See Q3.

**Planned time:** incomplete, non-archived tasks that are either:

- `scheduled == date`, or
- `due == date` with no `scheduled` date, or
- recurring instances due on that date (`isDueByRRule`, [helpers.ts:438](../../src/utils/helpers.ts#L438)) that are not completed or skipped for that date.

Each task contributes its estimate minus time already tracked, floored at 0. When `applyToPlanning` is on, the remaining time is scaled by the calibration factor:

`remaining = max(0, calibratedOrRaw(timeEstimate) − totalTrackedTime)`

Tasks with no estimate use `defaultEstimate`, or are counted in `unestimatedCount`.

**Overdue tasks** are not included in today's planned time. They have their own view and fresh start (A4). Counting them would make today look permanently overbooked.

### B5. Capacity UI

1. **Status bar item:** `Today: 4h 10m planned · 3h 20m free`. It is added in [StatusBarService.ts](../../src/ui/StatusBarService.ts) after the existing tracked-task and Pomodoro items.
   - When over capacity, the text gains "· 50m over". Accent colour is used as well as text, never colour alone.
   - Clicking opens a popover listing the day's tasks with their minutes, marked "calibrated" where relevant, plus "Open Today view" and, if the inbox is enabled, "Move some to inbox…".
   - When there is no data (no work hours today, or nothing planned), the item is hidden rather than showing zeros.
2. **Warning on overbook:** when an action sets `scheduled` to a date that becomes over capacity (task modal save, calendar drag, batch menu, triage "Schedule…"), show one non-blocking notice: "Thursday is now 1h 30m over your available time." Notices are rate-limited to one per date every 5 minutes. The hook belongs in `TaskService` after a successful update of `scheduled` (or `due` with no `scheduled`). It must not fire for API, MCP or webhook-originated updates.
3. **Phase 2:** a load indicator on each day header in the calendar week view, and a `GET /api/capacity?date=` endpoint plus an MCP tool.

---

## Feature C: energy ("mental battery")

### C1. Energy on contexts

`ContextDefinition` ([types/settings.ts:95](../../src/types/settings.ts#L95)) gets one new field:

```ts
energy?: "spark" | "steady" | "drain"; // undefined = "steady"
```

- **Spark:** gives energy, e.g. a hobby, seeing friends, creative work you enjoy.
- **Steady:** roughly neutral.
- **Drain:** costs energy, e.g. admin, hard conversations, commuting.

**Settings UI:** each context row in the Context groups card ([contextGroupsCard.ts](../../src/settings/tabs/taskProperties/contextGroupsCard.ts)) gets a three-way segmented control, ⚡ Spark / ● Steady / ▼ Drain, next to the colour and emoji. Contexts with no energy set behave as Steady, so no migration is needed.

**Turning the feature on:** energy is active as soon as at least one enabled context is set to Spark or Drain. The global switch `energy.enabled` (default `true`) can turn it off entirely.

### C2. Which context an item uses

Items use the **same resolution as calendar colours**: `resolveContext` ([contextColors.ts](../../src/utils/contextColors.ts)), which takes the first configured context and falls back to `fallbackContext`. This keeps the colour you see and the energy it counts consistent.

| Item | Context comes from |
|---|---|
| Task | the task's `contexts` property |
| Timeblock | `timeblock.context` |
| External event (ICS, Google, Microsoft) | `externalEventContexts[getExternalEventContextKey(event)]` |
| Item with no context and no fallback | counts as Steady |

### C3. Size

Size is the multiplier: an item's impact is its energy weight times its duration in hours.

| Item | Size |
|---|---|
| Open task | Remaining estimate as in B4, using calibrated minutes when `calibration.applyToPlanning` is on. With no estimate, use `planning.defaultEstimate`, else 30 min. Assumed sizes are counted and shown ("2 items sized by default"). |
| Completed task | Tracked time if there is any, otherwise its estimate |
| Timed event or timeblock | Its duration. It is **not** clipped to work hours: an evening event drains or sparks too. |
| All-day event | Counted only if its context is Spark or Drain, as `energy.allDayMinutes` (default 240). Otherwise ignored. |

**No double counting:**
- A timeblock **with** a context counts, and tasks attached to it are skipped for energy, because the timeblock stands for them.
- A timeblock **without** a context does not count, and its attached tasks count on their own.

**Which items appear on a day:**
- **Tasks:** the B4 rules (scheduled that day, due that day with no scheduled date, or a recurring instance that day). Overdue tasks are excluded.
- **Completed tasks:** counted on their `completedDate`.
- **External events:** come from all enabled calendars, not just the `planning.busyCalendars` used for capacity.

### C4. Battery model

The battery level is a percentage from 0 to 100.

```
level = clamp(0, 100, baseline + Σ weight(item) × hours(item) × rate(item))
weight: spark = +1, steady = 0, drain = −1
```

| Setting | Default | Notes |
|---|---|---|
| `energy.baseline` | 70 | "Morning charge." It is below 100 so that sparks can visibly raise the level. |
| `energy.sparkPerHour` | 10 | Points gained per hour of Spark. |
| `energy.drainPerHour` | 10 | Points lost per hour of Drain. |
| `energy.steadyPerHour` | 0 | Points lost per hour of Steady. Setting it to e.g. 2 makes long Steady days slowly drain. See Q6. |
| `energy.lowThreshold` | 25 | Below this the day is shown as low. |
| `energy.allDayMinutes` | 240 | Size of an all-day Spark or Drain event. |

**Example:** a day with 3 h of Drain meetings, 4 h of Steady work and 1 h of Spark ends at 70 − 30 + 0 + 10 = **50%**.

**Order is ignored in v1.** The sum is clamped once at the end. A chronological curve, where a morning spark is used before the afternoon drain, is left for phase 2 (Q8).

**Values reported for each day:**

```ts
interface DayEnergy {
  date: string;
  projected: number;     // end-of-day level including everything planned
  now?: number;          // today only: level counting only done items (completed tasks, past events)
  hours: { spark: number; steady: number; drain: number };
  topDrains: DayItem[];  // the three largest drain contributors, used for suggestions
  assumedSizeCount: number;
  level: "low" | "ok" | "high"; // low < lowThreshold ≤ ok < 70 ≤ high
}
```

**New service:** `src/services/EnergyService.ts`, with `getDayEnergy(date)` and `getEnergyInRange(start, end)`. It is built on `DayPlanService` and recalculates with the same debounced invalidation as capacity: on task changes, calendar refreshes, daily-note timeblock edits and settings changes.

### C5. Calendar day indicator

A small battery glyph is drawn on each day in the Bases calendar view ([CalendarView.ts](../../src/bases/CalendarView.ts)):

- **Placement:** in the day-cell corner in month view, and in the day header in week and day views. It uses the FullCalendar `dayCellDidMount` / `dayHeaderDidMount` hooks.
- **Data:** values come from `getEnergyInRange` for the visible range, in one pass per render.
- **Appearance:** the fill height shows the projected level, so the shape alone carries the information. A colour token is added on top: `--tn-energy-low`, `--tn-energy-ok` or `--tn-energy-high`, defined for both light and dark themes.
- **Tooltip and aria-label:** "Projected battery 45%. 3h drain, 1h spark, 4h steady."
- **Hidden** on days with no Spark or Drain items, so empty days stay uncluttered.
- **View option:** `showEnergy` in [calendarViewOptions.ts](../../src/bases/calendarViewOptions.ts) (default on), so each `.base` calendar can switch it off.
- **Clicking the indicator** opens the energy widget for that date.
- The mini calendar is left for phase 2.

### C6. Widget for today

**New view:** `EnergyView`, an Obsidian `ItemView` with type `tasknotes-energy`, opened by the command "Open energy panel".

- **Default placement:** the right sidebar. Because it is a normal view, it also works on mobile.
- **Date:** shows today by default. Arrows move to other days, and a calendar click (C5) opens it on a chosen date.

**Contents, top to bottom:**

1. **Battery gauge.** A horizontal bar with two markers: **now** (filled) and **projected end of day** (outline). Labelled, e.g., "Now 62% → Tonight 40%".
2. **Mix.** Hours of Spark, Steady and Drain, split into done and planned, e.g. "Drain 3h (1h done)".
3. **Biggest effects.** The items with the largest impact, drains first, each showing its contribution ("Quarterly report −15"). Clicking an item opens it.
4. **Capacity line** from B5, if work hours are configured: "4h 10m planned · 3h 20m free".
5. **Low-battery suggestion.** Shown when `projected < lowThreshold`: "Low battery forecast. Move a drain task, or add something that sparks." It offers two buttons:
   - "Show drain tasks": a reschedule list using the Schedule presets from A3.
   - "Find a spark": open tasks in Spark contexts that have no date.

   The suggestion is never shown as an error and never blocks anything.
6. **Empty state** when no context has energy set: a short explanation and a link to the Context groups settings.

**Embedding the widget:** a `tasknotes-energy` markdown code block renders the same component inside a note, for example a daily note or dashboard. It takes an optional `date: YYYY-MM-DD` and defaults to the note's daily-note date, or today.

```tasknotes-energy
date: 2026-10-15
```

The code block is cheap because it reuses the panel component, so it is in scope for v1.

**Status bar:** when capacity is shown (B5), a battery glyph and the projected level are added to the same item, e.g. `🔋40% · 4h 10m planned · 3h 20m free`. The popover shows the gauge from item 1.

### C7. Out of scope for v1

- Energy overrides on a single task (a frontmatter `energy:` property). See Q7.
- Logging how you actually felt to calibrate the rates.
- A chronological battery curve.
- Exposing energy as a TaskNotes property in Bases, for grouping or sorting by Spark or Drain. This is phase 2: energy lives in settings, so Bases cannot see it without a computed property in `PropertyMappingService`.

---

## Cross-cutting

- **i18n:** all new strings are added to every locale in `src/i18n/resources/*` according to I18N_GUIDE.md, with real translations rather than English placeholders.
- **Docs:**
  - `docs/features/task-management.md`: an inbox and triage section
  - `docs/features/time-management.md`: calibration and capacity
  - `docs/settings/*`: the new settings
  - `docs/releases/unreleased.md`
- **Settings migration:** new keys get defaults through `settingsPersistence` merging. The feature stays off until `inboxStatus` is set or work hours are saved, which work hours default to.
- **Accessibility:** the triage modal is fully keyboard-operable, with visible focus, buttons labelled with their shortcut key, and an aria-live progress line.
- **Mobile:** the triage modal uses large tap targets, and shortcuts are optional. The status bar does not exist on mobile, so capacity there is reached through the command "Show today's capacity", which opens the same popover as a modal.

## Testing

**Unit (Jest):**

- Interval merging and clipping: overlapping, nested and spanning-midnight events, and today's window starting at the current time.
- Calibration: median and quartiles, outlier filter, the minimum-n threshold, the fallback order, and the bucket boundaries at exactly 30 and 120 min.
- Inbox membership and `captureToInbox`: an explicit status always wins.
- Fresh start selection, which excludes recurring, completed and archived tasks; the due-date checkbox; and undo's "only restore if unchanged" rule.
- Triage session undo stack.
- Energy:
  - context resolution, including the fallback context and no-context-as-Steady
  - sizing rules: completed vs open tasks, all-day events, and the timeblock-with-attachments double-count rule
  - clamping at 0 and 100
  - level thresholds
  - "now" vs "projected" for today

**E2E (isolated instance, `e2e/obsidian.ts`):**

- Enable the inbox → capture 3 tasks → triage them with keys 1/3/5 → check the frontmatter and the Inbox view.
- Fresh start on seeded overdue tasks → undo → check the frontmatter is restored.
- With seeded estimates, tracked time and an ICS fixture, the status bar shows the expected planned and free time.
- Mark contexts Spark and Drain, seed tasks and an ICS event with those contexts → the calendar week view shows battery glyphs with the expected aria-labels → the energy panel shows the expected now and projected levels.

## Phasing

1. **A1–A3:** statuses, views and the triage modal. This is the smallest piece that is useful on its own.
2. **A4:** fresh start and undo.
3. **B1–B2:** the calibration service, stats card and modal hint. Needs no new settings beyond the window.
4. **B3–B5:** work hours, `DayPlanService`, capacity service, status bar and overbook notice.
5. **C1–C6:** energy on contexts, `EnergyService`, the calendar indicator, the energy panel and the code block.
   - Energy needs no work hours or calibration, so it can ship before step 4 if `DayPlanService` is built first.
   - Calibrated sizes are used automatically once B1 exists.
6. **Phase 2:** a chronological battery curve, energy as a Bases property, an energy indicator in the mini calendar, plus calendar day-header load, API and MCP endpoints, and a "skip missed recurring instances" option for fresh start.

## Open questions

- **Q1.** Should `captureToInbox` also apply to tasks created through the HTTP API, MCP or CLI without a status? Proposal: yes. Those are mostly quick-capture integrations too.
- **Q2.** "Drop" archives the task. Should there also be an optional `droppedStatus`, so dropped and finished tasks can be told apart in stats? Proposal: no for v1, because archive is enough and can be undone.
- **Q3.** Some users put non-task timeblocks (lunch, gym) in daily notes. Should a timeblock with no attachments count as busy? Proposal: add a per-timeblock "busy" flag later rather than guessing.
- **Q4.** Does `ICSEvent` carry transparency/free-busy information from Google, Microsoft and ICS? If not, should we add it in the calendar services? This needs checking against `types.ts:833` and each provider's mapping.
- **Q5.** Should calibration only count time from tracked sessions, or also Pomodoro sessions that were not linked to time entries? Check whether Pomodoro sessions always produce `timeEntries`.
- **Q6.** With Steady at 0, a 10-hour day of Steady work shows the battery at its baseline. Should Steady cost a little by default (e.g. 2 points per hour) so long days register? Proposal: keep 0 as designed, but expose the setting and mention it in the docs.
- **Q7.** Should a single task be able to override its context's energy? For example, a "Work" task that is actually fun. Proposal: phase 2, as an optional `energy` frontmatter property that takes precedence over the context.
- **Q8.** Should the battery be computed in chronological order, so a 0% midday dip is visible even if sparks later recover it? This is more accurate, but untimed tasks have no position in the day. Proposal: phase 2, placing untimed tasks evenly across the work window.
- **Q9.** Should items without a context use the fallback context's energy, as proposed for consistency with colour, or always count as Steady? Using the fallback means a Drain fallback context makes every uncategorised item drain.
