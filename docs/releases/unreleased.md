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

- (#1585) Completed tasks now collapse into a thin, faded marker in calendar views, placed at the time they were completed. TaskNotes records the completion time in a new `completedAt` property, and for recurring tasks in `complete_instance_times`, so each instance appears at its own completion time. Both property names can be changed in Task properties settings. Tasks completed before this change stay at their scheduled time. See [Completed Tasks](https://tasknotes.dev/views/calendar-views/#completed-tasks). Thanks to @ifrobincode for requesting completion times.

- Added per-type display options for Google Calendar working location, out of office, focus time, birthday, and Gmail events: show as a normal event, show as a faded ghost, or hide. Working location is hidden by default. See [Google event types](https://tasknotes.dev/settings/integrations/#google-event-types).

- Added a calendar picker to the connected Google Calendar and Microsoft Outlook cards in Integrations settings. Calendars are off until you turn them on, and only selected calendars are fetched, so accounts with many shared or subscribed calendars sync faster. Accounts that are connected when you update keep all of their calendars selected. See [Choosing calendars](https://tasknotes.dev/settings/integrations/#choosing-calendars).

## Changed

- ICS subscriptions, Google Calendar, and Microsoft Outlook now load independently at startup, so a slow calendar source no longer delays the others or the rest of TaskNotes' startup.

## Removed

## Fixed

- Fixed calendar and mini calendar views not showing new ICS, Google Calendar, or Microsoft Outlook events until the view was refreshed or the vault changed. Events now appear as soon as a sync finishes, including at startup and on each automatic refresh.
- Fixed connecting Google Calendar from Integrations settings not loading calendars or starting automatic refresh until Obsidian was restarted.

- Fixed Google Calendar showing only recently changed events after restarting Obsidian. TaskNotes now fetches every selected calendar in full on the first sync of each session, then uses incremental sync.

- (#2382) Fixed Kanban settings being ignored in existing `.base` files when nested under `options:` or `config:`, including empty-column hiding and pinned columns. Newly generated default files and exported v3 views now write settings directly on each view; existing files remain unchanged. See [Kanban View](https://tasknotes.dev/views/kanban-view/#configuration). Thanks to @techwiththiru for reporting this.
