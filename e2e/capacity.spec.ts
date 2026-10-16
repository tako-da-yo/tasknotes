import { test, expect, Page } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

// Estimate calibration and daily capacity, end to end, in the isolated e2e vault: seed tracked
// tasks so estimates calibrate to 1.5×, give today a work window starting now with one busy ICS
// event, then check the capacity status bar item and the Stats view's Estimate accuracy card.

let app: ObsidianApp;
let originalSettings: string | null = null;
// Fixture notes changed so that their own instances today don't count as planned time.
let originalNotes: Record<string, string> = {};
let subscriptionId: string | null = null;

const ROOT = 'E2E-Capacity';
const ICS_PATH = `${ROOT}/capacity.ics`;
const COMPLETED = [1, 2, 3, 4, 5].map((i) => `e2e-capacity-done-${i}`);
const PLANNED = 'e2e-capacity-planned';

// The work window runs from now for up to 3 hours, with a 1-hour event inside it.
const WINDOW_MINUTES = 180;
const EVENT_MINUTES = 60;
// Margin before midnight, so the window never runs into tomorrow while the test runs.
const MIDNIGHT_MARGIN_MINUTES = 10;
// Allowed drift between computing the window and reading the status bar.
const TOLERANCE_MINUTES = 5;

function page(): Page {
  if (!app?.page) throw new Error('Obsidian app not initialized');
  return app.page;
}

/** Same format as the plugin's formatTime(minutes). */
function formatMinutes(minutes: number): string {
  if (!minutes) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches any duration within ±TOLERANCE_MINUTES of `minutes`, as formatted by formatTime. */
function durationPattern(minutes: number): string {
  const options: string[] = [];
  for (let m = minutes - TOLERANCE_MINUTES; m <= minutes + TOLERANCE_MINUTES; m++) {
    if (m >= 0) options.push(escapeRegExp(formatMinutes(m)));
  }
  return `(?:${options.join('|')})`;
}

async function cleanUp(): Promise<void> {
  await page().evaluate(async ({ root, id }) => {
    const obsidian = (window as any).app;
    const plugin = obsidian.plugins.plugins['tasknotes'];
    if (id) await plugin.icsSubscriptionService.removeSubscription(id);
    const folder = obsidian.vault.getAbstractFileByPath(root);
    if (folder) await obsidian.vault.delete(folder, true);
  }, { root: ROOT, id: subscriptionId });
  subscriptionId = null;
}

test.beforeAll(async () => {
  app = await launchObsidian();
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await page().keyboard.press('Escape');
    await cleanUp();
    await page().evaluate(async (notes) => {
      const obsidian = (window as any).app;
      for (const [path, content] of Object.entries(notes)) {
        const file = obsidian.vault.getAbstractFileByPath(path);
        if (file && (await obsidian.vault.read(file)) !== content) {
          await obsidian.vault.modify(file, content);
        }
      }
    }, originalNotes);
    if (originalSettings) {
      await page().evaluate(async (json) => {
        const plugin = (window as any).app.plugins.plugins['tasknotes'];
        plugin.settings = JSON.parse(json);
        await plugin.saveSettings();
      }, originalSettings);
    }
  } finally {
    await closeObsidian(app);
  }
});

test('calibrated planned time and free time in the status bar and Stats view', async () => {
  test.setTimeout(120000);
  const p = page();

  originalSettings = await p.evaluate(() =>
    JSON.stringify((window as any).app.plugins.plugins['tasknotes'].settings)
  );

  const today = await p.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // 0. Skip today's instance of fixture recurring tasks (for example the daily standup), so
  //    only the seeded task counts as planned. Their notes are restored afterwards.
  await p.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins['tasknotes'];
    plugin.settings.calibration = { windowDays: 90, applyToPlanning: true };
    plugin.settings.planning = { ...plugin.settings.planning, busyCalendars: null, defaultEstimate: null, showInStatusBar: true };
    await plugin.saveSettings();
  });
  const fixtures = await p.evaluate(async (date) => {
    const obsidian = (window as any).app;
    const plugin = obsidian.plugins.plugins['tasknotes'];
    plugin.dayPlanService.invalidate();
    const items = await plugin.dayPlanService.getDayItems(date);
    const paths: string[] = [...new Set<string>(
      items.filter((i: any) => i.kind === 'task' && !i.done && i.task).map((i: any) => i.task.path)
    )];
    const originals: Record<string, string> = {};
    const nonRecurring: string[] = [];
    for (const path of paths) {
      const file = obsidian.vault.getAbstractFileByPath(path);
      const task = items.find((i: any) => i.task?.path === path).task;
      if (!task.recurrence) {
        nonRecurring.push(path);
        continue;
      }
      originals[path] = await obsidian.vault.read(file);
      await obsidian.fileManager.processFrontMatter(file, (fm: any) => {
        const skipped = Array.isArray(fm.skipped_instances) ? fm.skipped_instances : [];
        fm.skipped_instances = [...skipped, date];
      });
    }
    return { originals, nonRecurring };
  }, today);
  originalNotes = fixtures.originals;
  expect(fixtures.nonRecurring, 'fixture tasks planned for today').toEqual([]);

  // 1. Five completed tasks from the last week, each estimated at 60 minutes and tracked for
  //    90 (ratio 1.5), and one open task scheduled today with a 120-minute estimate.
  await p.evaluate(
    async ({ root, completed, planned, date }) => {
      const obsidian = (window as any).app;
      if (!obsidian.vault.getAbstractFileByPath(root)) await obsidian.vault.createFolder(root);
      const pad = (n: number) => String(n).padStart(2, '0');
      const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      for (const [i, name] of completed.entries()) {
        const day = new Date();
        day.setDate(day.getDate() - (i + 1));
        const d = localDate(day);
        await obsidian.vault.create(
          `${root}/${name}.md`,
          [
            '---',
            `title: ${name}`,
            'status: done',
            'priority: normal',
            `completedDate: ${d}`,
            'timeEstimate: 60',
            'timeEntries:',
            `  - startTime: ${d}T09:00:00`,
            `    endTime: ${d}T10:00:00`,
            `  - startTime: ${d}T14:00:00`,
            `    endTime: ${d}T14:30:00`,
            'tags:',
            '  - task',
            '---',
            '',
          ].join('\n')
        );
      }
      await obsidian.vault.create(
        `${root}/${planned}.md`,
        [
          '---',
          `title: ${planned}`,
          'status: open',
          'priority: normal',
          `scheduled: ${date}`,
          'timeEstimate: 120',
          'tags:',
          '  - task',
          '---',
          '',
        ].join('\n')
      );
    },
    { root: ROOT, completed: COMPLETED, planned: PLANNED, date: today }
  );
  await expect
    .poll(() =>
      p.evaluate(() => {
        const plugin = (window as any).app.plugins.plugins['tasknotes'];
        plugin.estimateCalibrationService.invalidate();
        return plugin.estimateCalibrationService.getCalibration().bySize.medium?.factor ?? null;
      })
    )
    .toBe(1.5);

  // 2. Today's work hours run from now to now + 3 h (shorter late in the evening, so the
  //    window stays within today). Starting at 00:00 is fine: free time counts from now.
  // 3. A local ICS file with one 1-hour event inside that window.
  const windowMinutes = await p.evaluate(
    async ({ windowMax, eventMinutes, margin, icsPath }) => {
      const obsidian = (window as any).app;
      const plugin = obsidian.plugins.plugins['tasknotes'];
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const toMidnight = Math.floor((midnight.getTime() - now.getTime()) / 60000) - margin;
      const length = Math.min(windowMax, toMidnight);
      if (length < eventMinutes + 10) return length;

      const end = new Date(now.getTime() + length * 60000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const hours = { start: '00:00', end: `${pad(end.getHours())}:${pad(end.getMinutes())}` };
      plugin.settings.planning = {
        ...plugin.settings.planning,
        workHours: [hours, hours, hours, hours, hours, hours, hours],
      };
      await plugin.saveSettings();

      const offset = Math.floor((length - eventMinutes) / 2);
      const start = new Date(now.getTime() + offset * 60000);
      const stop = new Date(start.getTime() + eventMinutes * 60000);
      const ics = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      await obsidian.vault.create(
        icsPath,
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//TaskNotes//E2E//EN',
          'BEGIN:VEVENT',
          'UID:e2e-capacity-event@tasknotes',
          `DTSTAMP:${ics(now)}`,
          `DTSTART:${ics(start)}`,
          `DTEND:${ics(stop)}`,
          'SUMMARY:E2E capacity meeting',
          'END:VEVENT',
          'END:VCALENDAR',
          '',
        ].join('\r\n')
      );
      return length;
    },
    {
      windowMax: WINDOW_MINUTES,
      eventMinutes: EVENT_MINUTES,
      margin: MIDNIGHT_MARGIN_MINUTES,
      icsPath: ICS_PATH,
    }
  );
  test.skip(
    windowMinutes < EVENT_MINUTES + 10,
    'Too close to midnight for a work window with a 1-hour event in it.'
  );

  subscriptionId = await p.evaluate(async (icsPath) => {
    const plugin = (window as any).app.plugins.plugins['tasknotes'];
    const sub = await plugin.icsSubscriptionService.addSubscription({
      name: 'E2E capacity',
      type: 'local',
      filePath: icsPath,
      color: '#3366cc',
      enabled: true,
      refreshInterval: 5,
    });
    plugin.dayPlanService.invalidate();
    return sub.id;
  }, ICS_PATH);

  // 4. 120 min × 1.5 = 3h planned; free = window − 1h event (2h for a full 3-hour window).
  const freeMinutes = windowMinutes - EVENT_MINUTES;
  const status = p.locator('.tn-capacity-status');
  await expect(status).toBeVisible({ timeout: 15000 });
  await expect(status).toHaveText(
    new RegExp(`^Today: 3h planned · ${durationPattern(freeMinutes)} free`),
    { timeout: 15000 }
  );
  if (windowMinutes === WINDOW_MINUTES) {
    await expect(status).toContainText('3h planned');
    await expect(status).toHaveText(/· (?:1h 5[5-9]m|2h|2h [1-5]m) free/);
  }
  // Planned time exceeds free time, so the overage is shown too.
  await expect(status).toContainText(' over');
  test.info().annotations.push({
    type: 'capacity',
    description: `window ${windowMinutes} min: "${await status.textContent()}"`,
  });

  // 5. The Stats view's Estimate accuracy card shows the 1.5× factor.
  await p.evaluate(() => (window as any).app.plugins.plugins['tasknotes'].activateStatsView());
  const card = p.locator('.stats-view__estimate-card');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('.stats-view__estimate-headline')).toContainText('1.5×');
  await expect(card).toContainText('Estimate accuracy');
  await expect(card).toContainText('Median of 5 tasks, last 90 days');
});
