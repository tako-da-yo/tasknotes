import { test, expect, Page } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

// Energy levels, end to end, in the isolated e2e vault: mark contexts as Drain and Spark, seed
// a day with a Drain timeblock that covers an attached Drain task plus a Spark task, then check
// the calendar's battery glyph, the energy panel it opens and the code block's date error.

let app: ObsidianApp;
let originalSettings: string | null = null;
// Opening the calendar and switching it to week mode can rewrite its .base file.
let originalBases: Record<string, string> = {};
// Today's daily note, if the vault already had one.
let originalDailyNote: string | null = null;
let dailyNotePath: string | null = null;

const ROOT = 'E2E-Energy';
const ADMIN_TASK = 'Admin task';
const FUN_TASK = 'e2e-energy-fun';
const BLOCK_NOTE = `${ROOT}/e2e-energy-block.md`;

function page(): Page {
  if (!app?.page) throw new Error('Obsidian app not initialized');
  return app.page;
}

test.beforeAll(async () => {
  app = await launchObsidian();
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await page().keyboard.press('Escape');
    await page().evaluate(
      async ({ root, bases, dailyPath, dailyOriginal }) => {
        const obsidian = (window as any).app;
        obsidian.workspace.detachLeavesOfType('tasknotes-energy');
        const folder = obsidian.vault.getAbstractFileByPath(root);
        if (folder) await obsidian.vault.delete(folder, true);
        if (dailyPath) {
          const daily = obsidian.vault.getAbstractFileByPath(dailyPath);
          if (dailyOriginal !== null) {
            if (daily) await obsidian.vault.modify(daily, dailyOriginal);
          } else if (daily) {
            await obsidian.vault.delete(daily);
          }
        }
        for (const [path, content] of Object.entries(bases as Record<string, string>)) {
          const file = obsidian.vault.getAbstractFileByPath(path);
          if (file && (await obsidian.vault.read(file)) !== content) {
            await obsidian.vault.modify(file, content);
          }
        }
      },
      { root: ROOT, bases: originalBases, dailyPath: dailyNotePath, dailyOriginal: originalDailyNote }
    );
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

test('battery glyph, energy panel and code block error', async () => {
  test.setTimeout(120000);
  const p = page();

  originalSettings = await p.evaluate(() =>
    JSON.stringify((window as any).app.plugins.plugins['tasknotes'].settings)
  );
  originalBases = await p.evaluate(async () => {
    const obsidian = (window as any).app;
    const out: Record<string, string> = {};
    for (const file of obsidian.vault.getFiles()) {
      if (file.extension === 'base') out[file.path] = await obsidian.vault.read(file);
    }
    return out;
  });

  const today = await p.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // 1. Context groups: admin drains energy, fun sparks it. Default energy settings
  //    (70% morning charge, ±10 points per hour, Steady free), and no default context, so
  //    fixture items without these contexts are Steady and cost nothing.
  await p.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins['tasknotes'];
    plugin.settings.contextGroups = [
      {
        id: 'e2e-energy-group',
        name: 'E2E energy',
        contexts: [
          { id: 'e2e-energy-admin', name: 'admin', color: '#cc3333', enabled: true, energy: 'drain' },
          { id: 'e2e-energy-fun', name: 'fun', color: '#33aa55', enabled: true, energy: 'spark' },
        ],
      },
    ];
    plugin.settings.fallbackContext = '';
    plugin.settings.energy = {
      enabled: true, baseline: 70, sparkPerHour: 10, drainPerHour: 10, steadyPerHour: 0,
      lowThreshold: 25, allDayMinutes: 240,
    };
    plugin.settings.planning = { ...plugin.settings.planning, defaultEstimate: null };
    await plugin.saveSettings();
  });

  // 2. A 3-hour admin task and a 1-hour fun task scheduled today, and today's daily note with a
  //    13:00–15:00 admin timeblock attached to the admin task (via an aliased link).
  const daily = await p.evaluate(
    async ({ root, admin, fun, date }) => {
      const obsidian = (window as any).app;
      if (!obsidian.vault.getAbstractFileByPath(root)) await obsidian.vault.createFolder(root);
      const task = (title: string, context: string, estimate: number) =>
        ['---', `title: ${title}`, 'status: open', 'priority: normal', `scheduled: ${date}`,
          'contexts:', `  - ${context}`, `timeEstimate: ${estimate}`, 'tags:', '  - task', '---', ''].join('\n');
      await obsidian.vault.create(`${root}/${admin}.md`, task(admin, 'admin', 180));
      await obsidian.vault.create(`${root}/${fun}.md`, task(fun, 'fun', 60));

      // Daily notes core plugin defaults: vault root, YYYY-MM-DD.
      const options = obsidian.internalPlugins.getPluginById('daily-notes')?.instance?.options ?? {};
      const folder = (options.folder ?? '').replace(/^\/+|\/+$/g, '');
      const format = options.format || 'YYYY-MM-DD';
      const name = (window as any).moment(date, 'YYYY-MM-DD').format(format);
      const path = folder ? `${folder}/${name}.md` : `${name}.md`;
      const timeblocks = [
        'timeblocks:',
        '  - id: e2e-energy-block',
        '    title: Admin block',
        '    startTime: "13:00"',
        '    endTime: "15:00"',
        '    context: admin',
        '    attachments:',
        `      - "[[${admin}|alias]]"`,
      ];
      const existing = obsidian.vault.getAbstractFileByPath(path);
      let original: string | null = null;
      if (existing) {
        original = await obsidian.vault.read(existing);
        if (/^---\n/.test(original)) throw new Error(`Daily note ${path} already has frontmatter`);
        await obsidian.vault.modify(existing, ['---', ...timeblocks, '---', original].join('\n'));
      } else {
        await obsidian.vault.create(path, ['---', ...timeblocks, '---', ''].join('\n'));
      }
      return { path, original };
    },
    { root: ROOT, admin: ADMIN_TASK, fun: FUN_TASK, date: today }
  );
  dailyNotePath = daily.path;
  originalDailyNote = daily.original;

  // The attached admin task is covered by the timeblock, and every other item today is
  // Steady at 0 points: 70 − 20 (2 h Drain) + 10 (1 h Spark) = 60.
  await expect
    .poll(
      () =>
        p.evaluate(async (date) => {
          const plugin = (window as any).app.plugins.plugins['tasknotes'];
          plugin.dayPlanService.invalidate();
          const e = await plugin.energyService.getDayEnergy(date);
          return {
            projected: e.projected,
            effects: e.contributions
              .filter((c: any) => c.points !== 0)
              .map((c: any) => `${c.item.kind}:${c.kind}:${c.points}`)
              .sort(),
          };
        }, today),
      { timeout: 15000 }
    )
    .toEqual({ projected: 60, effects: ['task:spark:10', 'timeblock:drain:-20'] });

  // 3. The calendar in week mode shows today's battery in the column header.
  expect(
    await p.evaluate(() =>
      (window as any).app.commands.executeCommandById('tasknotes:open-advanced-calendar-view')
    )
  ).toBeTruthy();
  const weekButton = p.locator('.workspace-leaf.mod-active button.fc-timeGridWeek-button').first();
  await expect(weekButton).toBeVisible({ timeout: 15000 });
  await weekButton.click();
  const glyph = p.locator(
    '.workspace-leaf.mod-active .fc-col-header-cell.fc-day-today .tn-energy-glyph'
  );
  await expect(glyph).toBeVisible({ timeout: 15000 });
  await expect(glyph).toHaveAttribute('aria-label', /Projected battery 60%/, { timeout: 15000 });

  // 4. Clicking it opens the energy panel for today in the right sidebar.
  await glyph.click();
  const panel = p.locator(
    '.mod-right-split .workspace-leaf-content[data-type="tasknotes-energy"] .tn-energy-panel'
  );
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.locator('.tn-energy-gauge__labels')).toContainText('Tonight 60%', {
    timeout: 15000,
  });

  // 4b. In month view the glyph sits inside a selectable day cell: clicking it opens the
  //     panel without FullCalendar starting a selection that opens the create menu.
  await p.evaluate(() => (window as any).app.workspace.detachLeavesOfType('tasknotes-energy'));
  await expect(panel).toHaveCount(0, { timeout: 15000 });
  const calendarLeaf = p.locator('.workspace-leaf:has(button.fc-dayGridMonth-button)').first();
  await calendarLeaf.locator('button.fc-dayGridMonth-button').click();
  const monthGlyph = calendarLeaf.locator('.fc-daygrid-day.fc-day-today .tn-energy-glyph');
  await expect(monthGlyph).toBeVisible({ timeout: 15000 });
  await monthGlyph.click();
  await expect(panel).toBeVisible({ timeout: 15000 });
  // The create menu would open on mouseup; give it time to (not) appear.
  await p.waitForTimeout(500);
  await expect(p.locator('.menu')).toHaveCount(0);

  // 5. A tasknotes-energy block with an invalid date shows an inline error.
  await p.evaluate(async (path) => {
    const obsidian = (window as any).app;
    const file = await obsidian.vault.create(
      path,
      ['# Energy block', '', '```tasknotes-energy', 'date: not-a-date', '```', ''].join('\n')
    );
    await obsidian.workspace.getLeaf(true).openFile(file, { state: { mode: 'preview' } });
  }, BLOCK_NOTE);
  // The leaf keeps both its reading and editing DOM, so only check the shown copy.
  const error = p.locator('.workspace-leaf.mod-active .tn-energy-panel__error >> visible=true');
  await expect(error).toBeVisible({ timeout: 15000 });
  await expect(error).toContainText('invalid date "not-a-date"');
});
