import { test, expect, Page } from '@playwright/test';
import {
  launchObsidian,
  closeObsidian,
  ObsidianApp,
  openTaskNotesSettings,
  closeObsidianSettings,
} from './obsidian';

// Inbox triage and fresh start, end to end, in the isolated e2e vault: enable the inbox in
// settings, capture tasks, triage them with the keyboard, check frontmatter and the Inbox view.

let app: ObsidianApp;
let originalSettings: string | null = null;
// Fresh start covers the whole vault, so other overdue fixture notes get rewritten too.
let originalNotes: Record<string, string> | null = null;
// Update default files rewrites every default .base file.
let originalBases: Record<string, string> | null = null;

const FOLDER = 'TaskNotes/Tasks';
// Captured tasks go to a folder template, so {{status}} must resolve to the inbox status.
const CAPTURE_ROOT = 'E2E-Triage';
const CAPTURE_FOLDER_TEMPLATE = `${CAPTURE_ROOT}/{{status}}`;
const INBOX = ['e2e-triage-inbox-1', 'e2e-triage-inbox-2', 'e2e-triage-inbox-3'];
const OPEN = 'e2e-triage-open-overdue';
const ALL = [...INBOX, OPEN];

type Frontmatter = Record<string, unknown> | null;

function page(): Page {
  if (!app?.page) throw new Error('Obsidian app not initialized');
  return app.page;
}

/** Frontmatter of a seeded note, found by basename so a moved (archived) file is still found. */
async function frontmatter(basename: string): Promise<Frontmatter> {
  return page().evaluate((name) => {
    const obsidian = (window as any).app;
    const file = obsidian.vault.getMarkdownFiles().find((f: any) => f.basename === name);
    if (!file) return null;
    const fm = obsidian.metadataCache.getFileCache(file)?.frontmatter;
    return fm ? JSON.parse(JSON.stringify(fm)) : null;
  }, basename);
}

async function runCommandById(id: string): Promise<boolean> {
  return page().evaluate((commandId) => (window as any).app.commands.executeCommandById(commandId), id);
}

function todayLocal(): Promise<string> {
  return page().evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

const dateOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value.slice(0, 10) : undefined;

async function deleteSeededNotes(): Promise<void> {
  await page().evaluate(async (names) => {
    const obsidian = (window as any).app;
    for (const file of obsidian.vault.getMarkdownFiles()) {
      if (names.includes(file.basename)) await obsidian.vault.delete(file);
    }
  }, ALL);
  await page().evaluate(async (root) => {
    const obsidian = (window as any).app;
    const folder = obsidian.vault.getAbstractFileByPath(root);
    if (folder) await obsidian.vault.delete(folder, true);
  }, CAPTURE_ROOT);
}

test.beforeAll(async () => {
  app = await launchObsidian();
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await page().keyboard.press('Escape');
    await deleteSeededNotes();
    if (originalNotes) {
      await page().evaluate(async (notes) => {
        const obsidian = (window as any).app;
        for (const [path, content] of Object.entries(notes)) {
          const file = obsidian.vault.getAbstractFileByPath(path);
          if (file && (await obsidian.vault.read(file)) !== content) {
            await obsidian.vault.modify(file, content);
          }
        }
      }, originalNotes);
    }
    if (originalBases) {
      await page().evaluate(async (bases) => {
        const obsidian = (window as any).app;
        for (const [path, content] of Object.entries(bases)) {
          const file = obsidian.vault.getAbstractFileByPath(path);
          if (file && (await obsidian.vault.read(file)) !== content) {
            await obsidian.vault.modify(file, content);
          }
        }
      }, originalBases);
    }
    if (originalSettings) {
      await page().evaluate(async (json) => {
        const plugin = (window as any).app.plugins.plugins['tasknotes'];
        plugin.settings = JSON.parse(json);
        plugin.statusManager.updateStatuses(plugin.settings.customStatuses);
        await plugin.saveSettings();
      }, originalSettings);
    }
  } finally {
    await closeObsidian(app);
  }
});

test('enable inbox, capture, triage, fresh start and undo', async () => {
  test.setTimeout(180000);
  const p = page();

  // 1. Start without an inbox: no inbox/someday statuses, triage off.
  await deleteSeededNotes();
  originalSettings = await p.evaluate(() =>
    JSON.stringify((window as any).app.plugins.plugins['tasknotes'].settings)
  );
  await p.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins['tasknotes'];
    plugin.settings.customStatuses = plugin.settings.customStatuses.filter(
      (s: any) => s.value !== 'inbox' && s.value !== 'someday'
    );
    plugin.statusManager.updateStatuses(plugin.settings.customStatuses);
    plugin.settings.triage = { inboxStatus: '', somedayStatus: '', captureToInbox: true };
    plugin.settings.triageLastFreshStart = null;
    await plugin.saveSettings();
  });

  // 2. Press Enable inbox in Settings → Task properties → Status, then Set to none for the
  //    vault's default scheduled date (it would stop capture to the inbox).
  // The settings shortcut the helper presses is Ctrl+, which macOS does not use; open directly.
  await p.evaluate(() => (window as any).app.setting.open());
  const settingsPage = await openTaskNotesSettings(p, 'Task properties');
  try {
    const statusCard = settingsPage.locator('[data-card-id="property-status"]');
    await expect(statusCard).toBeVisible();
    if (await statusCard.evaluate((el) => el.classList.contains('tasknotes-settings__card--collapsed'))) {
      await statusCard.locator(':scope > .tasknotes-settings__card-header').click();
    }
    const enable = statusCard.getByRole('button', { name: 'Enable inbox', exact: true });
    await enable.scrollIntoViewIfNeeded();
    await enable.click();
    const setNone = statusCard.getByRole('button', { name: 'Set to none', exact: true });
    await setNone.scrollIntoViewIfNeeded();
    await setNone.click();
    await expect(setNone).toHaveCount(0);
  } finally {
    await closeObsidianSettings(p, settingsPage);
  }
  await expect
    .poll(() =>
      p.evaluate(() => {
        const plugin = (window as any).app.plugins.plugins['tasknotes'];
        return {
          triage: plugin.settings.triage,
          statuses: ['inbox', 'someday'].filter((v) => !!plugin.statusManager.getStatusConfig(v)),
          scheduled: plugin.settings.taskCreationDefaults.defaultScheduledDate,
        };
      })
    )
    .toEqual({
      triage: { inboxStatus: 'inbox', somedayStatus: 'someday', captureToInbox: true },
      statuses: ['inbox', 'someday'],
      scheduled: 'none',
    });

  // 3. Capture three tasks through the real creation path, without a status or a date, into a
  //    folder template that uses {{status}}. dateCreated fixes the triage queue order.
  const captured = await p.evaluate(
    async ({ titles, template }) => {
      const plugin = (window as any).app.plugins.plugins['tasknotes'];
      plugin.settings.tasksFolder = template;
      const paths: string[] = [];
      for (const [i, title] of titles.entries()) {
        const { file } = await plugin.taskService.createTask({
          title,
          dateCreated: `2026-01-0${i + 1}T09:00:00`,
        });
        paths.push(file.path);
      }
      return paths;
    },
    { titles: INBOX, template: CAPTURE_FOLDER_TEMPLATE }
  );
  expect(captured).toEqual(INBOX.map((name) => `${CAPTURE_ROOT}/inbox/${name}.md`));
  for (const name of INBOX) {
    await expect.poll(async () => (await frontmatter(name))?.status).toBe('inbox');
  }

  // 4. Seed one overdue open task for fresh start.
  await p.evaluate(
    async ({ folder, open }) => {
      const obsidian = (window as any).app;
      if (!obsidian.vault.getAbstractFileByPath(folder)) await obsidian.vault.createFolder(folder);
      await obsidian.vault.create(
        `${folder}/${open}.md`,
        `---\ntitle: ${open}\nstatus: open\nscheduled: 2026-01-01\ndateCreated: 2025-12-01T09:00:00\ntags:\n  - task\n---\n`
      );
    },
    { folder: FOLDER, open: OPEN }
  );

  // Wait until the cache sees all tasks.
  await expect
    .poll(
      () =>
        p.evaluate(async (names) => {
          const plugin = (window as any).app.plugins.plugins['tasknotes'];
          const tasks = plugin.cacheManager.getAllCachedTasks();
          return names.every((n: string) => tasks.some((t: any) => t.path.endsWith(`/${n}.md`)));
        }, ALL),
      { timeout: 15000 }
    )
    .toBe(true);

  // 5. Triage: 1 (Today), 3 (Someday), 5 (Drop).
  expect(await runCommandById('tasknotes:triage-inbox')).toBeTruthy();
  const modal = p.locator('.modal').filter({ has: p.locator('.tn-triage__actions') });
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[0]);

  // Only the three captured tasks should be in the inbox queue.
  await expect(modal.locator('.tn-triage__progress')).toHaveText('1 of 3');
  await p.keyboard.press('1');
  await expect(modal.locator('.tn-triage__progress')).toHaveText('2 of 3');
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[1]);
  await p.keyboard.press('3');
  await expect(modal.locator('.tn-triage__progress')).toHaveText('3 of 3');
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[2]);
  await p.keyboard.press('5');
  await expect(p.locator('.tn-triage__finished')).toHaveText('Inbox clear. 3 sorted, 0 skipped.');
  await p.keyboard.press('Escape');
  await expect(p.locator('.tn-triage__finished')).toHaveCount(0);

  // 6. Frontmatter after triage.
  const today = await todayLocal();
  await expect.poll(async () => dateOf((await frontmatter(INBOX[0]))?.scheduled)).toBe(today);
  expect((await frontmatter(INBOX[0]))?.status).toBe('open');

  await expect.poll(async () => (await frontmatter(INBOX[1]))?.status).toBe('someday');
  expect((await frontmatter(INBOX[1]))?.scheduled).toBeUndefined();

  // Archiving adds the archive tag; the status is left unchanged.
  const archiveTag = await p.evaluate(
    () => (window as any).app.plugins.plugins['tasknotes'].fieldMapper.toUserField('archiveTag')
  );
  await expect
    .poll(async () => ((await frontmatter(INBOX[2]))?.tags as string[] | undefined) ?? [])
    .toContain(archiveTag);

  // 7. The default task base gets the Inbox view (Update default files code path).
  originalBases = await p.evaluate(async () => {
    const obsidian = (window as any).app;
    const bases: Record<string, string> = {};
    for (const file of obsidian.vault.getFiles()) {
      if (file.extension === 'base') bases[file.path] = await obsidian.vault.read(file);
    }
    return bases;
  });
  const baseContent = await p.evaluate(async () => {
    const obsidian = (window as any).app;
    const plugin = obsidian.plugins.plugins['tasknotes'];
    await plugin.updateDefaultBasesFiles();
    const file = obsidian.vault.getFiles().find((f: any) => f.name === 'tasks-default.base');
    return file ? obsidian.vault.read(file) : null;
  });
  expect(baseContent).toContain('name: "Inbox"');
  expect(baseContent).toContain('name: "Someday"');
  expect(baseContent).toMatch(/== "inbox"/);

  // 8. Fresh start: confirm, then the overdue open task is unscheduled and in the inbox.
  originalNotes = await p.evaluate(
    async ({ seeded, root }) => {
      const obsidian = (window as any).app;
      const notes: Record<string, string> = {};
      for (const file of obsidian.vault.getMarkdownFiles()) {
        if (!seeded.includes(file.basename) && !file.path.startsWith(`${root}/`)) {
          notes[file.path] = await obsidian.vault.read(file);
        }
      }
      return notes;
    },
    { seeded: ALL, root: CAPTURE_ROOT }
  );
  expect(await runCommandById('tasknotes:fresh-start')).toBeTruthy();
  const confirm = p.locator('.modal button.mod-cta', { hasText: 'Fresh start' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(p.locator('.notice', { hasText: 'Fresh start:' })).toBeVisible({ timeout: 15000 });

  await expect.poll(async () => (await frontmatter(OPEN))?.status, { timeout: 15000 }).toBe('inbox');
  expect((await frontmatter(OPEN))?.scheduled ?? undefined).toBeUndefined();
  // Tasks scheduled for today are not overdue and keep their date.
  expect(dateOf((await frontmatter(INBOX[0]))?.scheduled)).toBe(today);

  // 9. Undo restores the scheduled date and status.
  expect(await runCommandById('tasknotes:undo-fresh-start')).toBeTruthy();
  await expect(p.locator('.notice', { hasText: 'Fresh start undone' })).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await frontmatter(OPEN))?.status, { timeout: 15000 }).toBe('open');
  expect(dateOf((await frontmatter(OPEN))?.scheduled)).toBe('2026-01-01');
});
