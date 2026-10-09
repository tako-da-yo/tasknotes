# TaskNotes - Unreleased

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->

## Added

- Added context groups. In Task properties settings, group contexts (for example **Work** and **Self**) and give each one a color and an emoji. Contexts are chosen from a picker that shows each context's emoji and colored name, including the task window's **Contexts** field, and calendar events show their context's emoji in the top-right corner. In the calendar view, the context's color replaces the item's own color for tasks, timeblocks, and Google Calendar, Microsoft Outlook, and ICS events. Choose a context from a task's or calendar event's context menu, or from a timeblock's right-click menu or edit window. Contexts on calendar events are stored in TaskNotes and apply to every occurrence of a recurring event. A **Default context** setting colors items that have no context. A task's context menu now sets a single context instead of toggling several. Task cards show configured contexts with their emoji and color, and task list and Kanban views can show each task's context group through a `contextGroup` formula property. See [Context Groups](https://tasknotes.dev/settings/task-properties/#context-groups).

- (#1585) Completed tasks now collapse into a thin, faded marker in calendar views, placed at the time they were completed. TaskNotes records the completion time in a new `completedAt` property, and for recurring tasks in `complete_instance_times`, so each instance appears at its own completion time. Both property names can be changed in Task properties settings. Tasks completed before this change stay at their scheduled time. See [Completed Tasks](https://tasknotes.dev/views/calendar-views/#completed-tasks). Thanks to @ifrobincode for requesting completion times.

- Google Calendar working location, out of office, focus time, birthday, and Gmail events now each have their own style in the calendar view: working location as a faded marker (or a light tint behind other events when it has times) that can't be clicked, dragged, or edited, out of office hatched, focus time as a tinted block with a double bar, and birthdays and Gmail events with a marker before the title. Each type has a CSS class for restyling or hiding it. See [Google event types](https://tasknotes.dev/settings/integrations/#google-event-types).

- Added a calendar picker to the connected Google Calendar and Microsoft Outlook cards in Integrations settings. Calendars are off until you turn them on, and only selected calendars are fetched, so accounts with many shared or subscribed calendars sync faster. Accounts that are connected when you update keep all of their calendars selected. See [Choosing calendars](https://tasknotes.dev/settings/integrations/#choosing-calendars).

## Changed

- New installs now default to no scheduled date for new tasks, so tasks created outside the calendar are unscheduled. Tasks created from a calendar slot still use the selected date and time. Existing vaults keep their **Default scheduled date** setting in Task properties settings.

- Tasks in the calendar's time grid and all-day row now show a bar in the task's color on the leading side over a dim fill of the same color, matching the completed-task markers at full strength. Timeblocks use the same fill with dashed bars on both sides instead of a faded solid block.

- Creating a task from a calendar slot now opens the task form with detailed options already shown and the title field focused. Clicking a timed slot without dragging gives the task a 15-minute time estimate unless you have set a default time estimate in Task properties settings.

- ICS subscriptions, Google Calendar, and Microsoft Outlook now load independently at startup, so a slow calendar source no longer delays the others or the rest of TaskNotes' startup.

## Removed

## Fixed

- Fixed the custom days calendar view (for example 3 days) showing fewer days near the end of the week when weekends are hidden. It now skips weekends, so on a Thursday it shows Thursday, Friday, and Monday.

- Fixed calendar views staying on the previous day after midnight, often after the computer had been asleep: today's highlight stayed on yesterday, the custom days view still started on yesterday, and the **Today** button couldn't be clicked. When the date changes, views that were showing today now move to the new day, and views you navigated elsewhere stay where they are.

- Fixed open calendar and other TaskNotes Bases views losing Google Calendar, Microsoft Outlook, and ICS events after TaskNotes was reloaded (for example after a plugin update). Moving a task or timeblock afterwards made all calendar events disappear until the view was closed and reopened. TaskNotes now rebuilds its open Bases views when it loads.

- Fixed Make.md's "Type '/' for commands" hint showing on top of the placeholder text in the task modal's natural language, details, and time entry description editors.

- Fixed calendar and mini calendar views not showing new ICS, Google Calendar, or Microsoft Outlook events until the view was refreshed or the vault changed. Events now appear as soon as a sync finishes, including at startup and on each automatic refresh.
- Fixed connecting Google Calendar from Integrations settings not loading calendars or starting automatic refresh until Obsidian was restarted.

- Fixed Google Calendar showing only recently changed events after restarting Obsidian. TaskNotes now fetches every selected calendar in full on the first sync of each session, then uses incremental sync.

- (#2382) Fixed Kanban settings being ignored in existing `.base` files when nested under `options:` or `config:`, including empty-column hiding and pinned columns. Newly generated default files and exported v3 views now write settings directly on each view; existing files remain unchanged. See [Kanban View](https://tasknotes.dev/views/kanban-view/#configuration). Thanks to @techwiththiru for reporting this.
