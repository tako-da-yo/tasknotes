# Task Management


This page covers task creation, properties, projects, dependencies, recurring tasks, and reminders. For the underlying architecture, see [Core Concepts](../core-concepts.md).

Use this page as the operational overview: how tasks are captured, how they are structured, and how relationships/automation behave. Detailed reference content for recurrence and reminders is split into dedicated pages linked near the end.

## Creating and Editing Tasks

You can create and edit tasks in a variety of ways. The primary method is through the **Task Creation Modal**, which can be accessed via the "Create new task" command or by clicking on dates or time slots in the calendar views. This modal provides an interface for setting all available task properties, including title, status, priority, and due dates.

![Task creation modal](../assets/feature-task-modal-filled.png)

TaskNotes keeps a storage title and a filename-safe title separate. When **Store title in filename** is enabled, forbidden filename characters are removed from the filename while the task title is preserved whenever it cannot be represented exactly by that filename. With another filename format, such as timestamp or UUID, the full title is stored in frontmatter.

For existing tasks, the **Quick actions for current task** command opens a keyboard-searchable action palette. It includes status, priority, time-tracking, archive, edit, and date actions, including built-in due and scheduled date presets such as today, tomorrow, this weekend, next week, and next month.

TaskNotes also supports **Natural Language Creation**, which allows you to create tasks by typing descriptions in plain English. The built-in parser can extract structured data from phrases like "Buy groceries tomorrow at 3pm @home #errands high priority."

In most workflows, users combine both approaches: fast capture with natural language, then occasional structured edits in the modal when more precision is needed.

### Auto-Suggestions in Natural Language Input

The natural language input field includes auto-suggestion functionality that activates when typing specific trigger characters:

- **@** - Shows available contexts from existing tasks
- **#** - Shows available tags from existing tasks
- **+** - Shows files from your vault as project suggestions
- **\*** - Shows available status options (configurable trigger in Settings → Features)

In task creation and edit fields, focusing the tags or contexts input also opens the available suggestions immediately, so you can pick from the current vocabulary without typing a first character.

#### Project Suggestions

When typing `+` in the natural language input, you'll see up to 20 suggestions from your vault's markdown files. The suggestions display additional information to help identify files:

```
project-alpha [title: Alpha Project Development | aliases: alpha, proj-alpha]
meeting-notes [title: Weekly Team Meeting Notes]
simple-project
work-file [aliases: work, office-tasks]
```

Project suggestions search across:
- File names (basename without extension)
- Frontmatter titles (using your configured field mapping)
- Frontmatter aliases
- Optional filtering by required tags, folders, and a specific frontmatter property/value defined in Settings → Appearance & UI → Project Autosuggest

Selecting a project suggestion inserts it as `+[[filename]]`, creating a wikilink to the file while maintaining the `+` project marker that the natural language parser recognizes.


#### Enhanced Project Auto‑suggester (configurable cards)

Project suggestions can display configurable multi‑row cards and support smarter search. Configure up to 3 rows using a simple token syntax in Settings → Appearance & UI → Project Autosuggest.

- Properties: file.basename, file.name, file.path, file.parent, title, aliases, and any frontmatter key
- Flags:
  - n or n(Label) → show the field name/label before the value
  - s → include this field in + search (in addition to defaults)
- Literals: you can mix in fixed text or emojis between tokens

Examples

- "{title|n(Title)}" → Title: Alpha Project
- "🔖 {aliases|n(Aliases)}" → 🔖 Aliases: alpha, proj-alpha
- "{file.path|n(Path)|s}" → include path in + search as well as display it

Search behavior

- Defaults: + search always includes file basename, title (via your field mapping), and aliases
- |s flag: add more searchable fields on top of the defaults (e.g., file.path or a custom frontmatter key like customer)
- Fuzzy: optional fuzzy matching can be enabled in settings for broader, multi‑word matches

Performance tips

- Keep rows to three or fewer for clarity and performance (the UI supports up to 3)
- Prefer specific searchable fields with |s on large vaults

Demo

![Autosuggest projects with spaces](../assets/autosuggest_project_names_with_space.gif)

![Enhanced project autosuggester](../assets/enhanced-project-auto-suggester.gif)


#### Status Suggestions

When typing the status trigger character (default `*`) in the natural language input, you'll see suggestions for all configured status options:

![Status Auto-Suggestion](../assets/auto-suggest-status.gif)

Status suggestions allow quick selection of statuses when creating tasks. For example, typing `*in` shows "In Progress" as a suggestion if that's one of your configured statuses.

Clicking a task card's status indicator cycles through statuses in the order configured under **Settings → Task Properties → Status**. A status can optionally define a specific **Next status** for forward cycling; otherwise TaskNotes uses the configured order. Statuses marked **Skip when cycling** are left out of the ordered click cycle, but remain available through menus, suggestions, direct edits, and explicit next-status jumps.

Additionally, you can convert any line type in your notes to TaskNotes using the **Instant Conversion** feature. This works with checkboxes, bullet points, numbered lists, blockquotes, headers, and plain text lines.

## Task Properties

Tasks store their data in YAML frontmatter with properties for status, priority, dates, contexts, projects, tags, time estimates, recurrence, and reminders. Custom fields can extend this structure.

This frontmatter-first design keeps task data editable and portable while supporting consistent behavior across views and widgets.

For property types and examples, see [Core Concepts](../core-concepts.md#yaml-frontmatter). For configuration options, see [Task Properties Settings](../settings/task-properties.md).

## Projects

TaskNotes supports organizing tasks into projects using note-based linking. Projects are represented as links to actual notes in your vault, allowing you to leverage Obsidian's linking and backlinking features for project management.

This model avoids creating a separate project database. Any note can become a project anchor, and task/project relationships remain visible through normal Obsidian link tooling.

### Project Assignment

Tasks can be assigned to one or more projects through the task creation or editing interface. When creating or editing a task, click the "Add Project" button to open the project selection modal. This modal provides fuzzy search functionality to quickly find and select project notes from your vault.

### Project Links

Projects are stored as wikilinks in the task's frontmatter (e.g., `projects: ["[[Project A]]", "[[Project B]]"]`). These links are clickable in the task interface and will navigate directly to the project notes when clicked. Any note in your vault can serve as a project note simply by being linked from a task's projects field.

### Organization and Filtering

Tasks can be filtered and grouped by their associated projects in all Bases-driven task views. Use the Bases filter editor to add `note.projects` conditions, and configure the grouping menu to organize Task List or Kanban boards by project. Tasks assigned to multiple projects will appear in each relevant project group, providing flexibility in project-based organization.

### Project Indicators

TaskCards display visual indicators when tasks are used as projects. These indicators help identify which tasks have other tasks linked to them as subtasks, making project hierarchy visible at a glance.

### Subtask Creation

Tasks can have subtasks created directly from their context menu. When viewing a task that serves as a project, you can select "Create subtask" to create a new task automatically linked to the current project.

## Dependencies

Task dependencies capture prerequisite work using RFC&nbsp;9253 terminology. Dependencies are stored in frontmatter as structured objects:

```yaml
blockedBy:
  - uid: "[[Operations/Order hardware]]"
    reltype: FINISHTOSTART
    gap: P1D
```

- `uid` references the blocking task, typically through an Obsidian wikilink.
- `reltype` is stored with each dependency and defaults to `FINISHTOSTART` for dependencies created in the UI.
- `gap` is optional and uses ISO&nbsp;8601 duration syntax (for example `PT4H` or `P2D`).

TaskNotes stores each dependency in the dependent task’s `blockedBy` field and derives the reverse “Blocking” relationship from it. For example, if Task B is blocked by Task A, B stores a reference to A; A does not need a separate `blocking` frontmatter property. Editing “Blocking” updates the selected dependent tasks’ `blockedBy` fields. Removing a dependency also removes the derived reverse relationship.

Dependencies are separate from project/subtask membership: adding a blocker does not require adding either task to the other’s `projects` field. To view tasks blocked by the current note, use the Relationships widget’s **Blocking** view, which finds them through Bases without a stored `blocking` property.

### Selecting dependencies in the UI

- The task creation and edit modals expose “Blocked by” and “Blocking” buttons that launch a fuzzy task selector. The picker only offers valid tasks, excludes the current note, and prevents duplicate entries.
- The task context menu provides the same selector, enabling dependency management directly from the Task List, Kanban, and calendar views.
- Task cards show a fork icon whenever a task blocks other work. Clicking it expands an inline list of downstream tasks without triggering the parent card’s modal, so you can inspect dependents in place.

These controls currently create and manage finish-to-start style blockers. Advanced `reltype` values and `gap` data are preserved in frontmatter, but blocking evaluation is currently based on whether unresolved dependencies exist rather than relationship-type-specific scheduling rules.

![Task context menu](../assets/feature-task-context-menu.png)

## Inbox and triage

The inbox is an optional status for tasks you have captured but not yet decided on. New tasks with no date land there, and the **Triage inbox** command lets you sort them one at a time. The inbox is off until you turn it on.

### Turning on the inbox

Open **Settings → Task properties**, expand the **Status** card and find the **Inbox** card under the status values. Select **Enable inbox**. TaskNotes adds an `inbox` status and a `someday` status if they don't exist yet, and selects them as the **Inbox status** and **Someday status**. You can also pick any existing status in either dropdown. Leaving **Someday status** set to **None** hides the Someday action.

To add the Inbox and Someday views to your task base, use **Update default files** in **Settings → General** afterwards.

### Capture to inbox

With **Capture to inbox** on (the default once an inbox status is set), a new task goes to the inbox when it has no status and no due or scheduled date. This applies to tasks created from the task creation modal, quick-create in the task selector and inline checkbox conversion. A task you give a status or a date keeps it. Tasks created through the HTTP API, MCP or the CLI are not affected.

The **Default scheduled date** and **Default due date** settings count as real dates. If either is set to anything other than **None**, new tasks get that date and skip the inbox. In that case the Inbox card shows a note and a **Set to none** button that sets those defaults to **None**.

### Triage inbox

Run the **Triage inbox** command to go through the inbox one task at a time, oldest first. Each task shows its title, the start of its details, its projects, contexts and tags, and how long ago it was captured. Pick an action with the buttons or the keyboard:

| Key | Action | Result |
|-----|--------|--------|
| `1` | Today | Sets the scheduled date to today and the status to your default status |
| `2` | Schedule… | Offers **Tomorrow**, **This weekend**, **Next week** and **Pick date…**, then sets the scheduled date and the default status |
| `3` | Someday | Sets the status to your someday status (only when one is set) |
| `4` | Done already | Sets the status to a completed status |
| `5` | Drop | Archives the task. Nothing is deleted |
| `E` | Edit | Opens the task in the edit modal. If you move it out of the inbox there, it counts as sorted |
| `→` or `S` | Skip | Leaves the task in the inbox and moves to the next one |
| `Z` | Undo | Reverts the last action in this session |

Press `Esc` to close the modal at any time. Changes you have made so far are kept. When the queue is finished, TaskNotes shows how many tasks you sorted and skipped.

### Fresh start

When overdue tasks pile up, run **Fresh start: reset overdue tasks**. A confirmation window shows how many tasks are overdue, how many have a past scheduled date and how many have a past due date. When you confirm:

- Past scheduled dates are cleared and those tasks move to the inbox. Without an inbox status, their status stays the same.
- Past due dates stay unless you turn on **Also clear past due dates**. It is off by default because due dates are often real deadlines.
- Recurring, completed and archived tasks are left alone.

A notice with an **Undo** link stays for 10 seconds. After that, run **Undo last fresh start**, which is available while the last fresh start can still be undone. Undo restores the dates and statuses that fresh start changed, but skips any field you have changed since, and reports how many tasks it restored and skipped.

To reset only some tasks, select them in a task list or Kanban view and choose **Fresh start selected** from the batch menu.

### Inbox and Someday views

The default task base (`tasks-default.base`) includes **Inbox** and **Someday** views once the matching status is set. They are ordinary Bases views that filter on the status and leave out archived tasks, so you can sort, filter or copy them like any other view. Existing vaults get them through **Update default files**. See [Default Base Templates](../reference/default-base-templates.md) for the rest of the template.

## Automation

### Auto-Archiving

TaskNotes can automatically archive tasks when they transition into a status that has auto-archiving enabled. This keeps completed work out of your active lists without requiring manual cleanup.

Configure auto-archiving per status from **Settings → Task Properties → Task Statuses**. Each status card includes an **Auto-archive** toggle and a **Delay (minutes)** input (1–1440). When you turn the toggle on for a status, any task moved into that status is queued for archiving once the delay elapses. Moving the task to a different status before the timer expires cancels the pending archive automatically.

The auto-archive queue runs in the background and persists across plugin restarts. If TaskNotes was closed while an archive was pending, the task will be archived shortly after the plugin loads again as long as it still matches the configured status.

This automation is intended to keep active views focused without manual cleanup, while still preserving archived task history in your vault.

## File Management and Templates

TaskNotes supports configurable task folder locations, filename generation patterns, archive behavior, and body templates for newly created tasks.

These settings let you align task files with existing vault conventions (for example, date-based folders, project-based routing, or template-driven task note scaffolds).

For configuration details, see [Task Defaults](../settings/task-defaults.md).  
For template variables, see [Template Variables Reference](template-variables.md).

## Completing Tasks

You can record a task's completion — and choose the date it is recorded against — directly from the task context menu, without opening the task. Four actions are offered:

- **Completed today** — records today's date.
- **Completed on schedule** — records the task's scheduled date (for a recurring task, the scheduled date of the occurrence you clicked).
- **Completed on due date** — records the due date.
- **Completed on (pick date)** — opens a date picker and records the date you choose.

An action is disabled when the date it needs is not set — for example *Completed on schedule* on a task with no scheduled date — rather than silently falling back to another date. Recurring tasks also get a **Skip instance** action alongside these.

By default the actions are grouped under a single **Mark complete or skip** entry (**Mark complete** for non-recurring tasks). To show them directly in the menu instead — set off by dividers — turn off **Settings → Appearance & UI → Task cards → Group complete and skip actions in a submenu**.

![Completion actions grouped under a submenu (default)](../assets/feature-completion-date-actions.png)

With the submenu grouping turned off, the same actions appear directly in the menu:

![Completion actions shown flat in the menu](../assets/feature-completion-date-actions-flat.png)

## Recurring Tasks

TaskNotes recurring tasks use RFC 5545 RRule syntax with `DTSTART`, separate pattern definition from next occurrence scheduling, and support independent instance completion. When an individual recurrence needs its own checklist, time entries, or notes, you can create a materialized occurrence note from the task or calendar context menu.

For full behavior, examples, and edge cases, see [Recurring Tasks](recurring-tasks.md).

## Task Reminders

Task reminders support relative offsets from due/scheduled dates and absolute date-time reminders. You can add reminders from task modals, task cards, and context menus.

For full setup, data format, defaults, and UI behavior, see [Task Reminders](reminders.md).
