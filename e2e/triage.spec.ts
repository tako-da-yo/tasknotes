import { test, expect, Page } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

// Inbox triage and fresh start, end to end, in the isolated e2e vault.

let app: ObsidianApp;
let originalSettings: string | null = null;
// Fresh start covers the whole vault, so other overdue fixture notes get rewritten too.
let originalNotes: Record<string, string> | null = null;

const FOLDER = 'TaskNotes/Tasks';
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

test('triage inbox, fresh start and undo update task frontmatter', async () => {
  test.setTimeout(120000);
  const p = page();

  // 1. Seed three inbox tasks (oldest first, so the queue order is known) and one overdue open task.
  await deleteSeededNotes();
  await p.evaluate(
    async ({ folder, inbox, open }) => {
      const obsidian = (window as any).app;
      if (!obsidian.vault.getAbstractFileByPath(folder)) await obsidian.vault.createFolder(folder);
      const note = (title: string, lines: string[]) =>
        `---\n${[`title: ${title}`, ...lines, 'tags:', '  - task'].join('\n')}\n---\n`;
      for (const [i, name] of inbox.entries()) {
        await obsidian.vault.create(
          `${folder}/${name}.md`,
          note(name, ['status: inbox', `dateCreated: 2026-01-0${i + 1}T09:00:00`])
        );
      }
      await obsidian.vault.create(
        `${folder}/${open}.md`,
        note(open, ['status: open', 'scheduled: 2026-01-01', 'dateCreated: 2025-12-01T09:00:00'])
      );
    },
    { folder: FOLDER, inbox: INBOX, open: OPEN }
  );

  // 2. Point the inbox at an "inbox" status (the triage command requires the status to exist).
  originalSettings = await p.evaluate(() =>
    JSON.stringify((window as any).app.plugins.plugins['tasknotes'].settings)
  );
  await p.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins['tasknotes'];
    const statuses = plugin.settings.customStatuses;
    if (!statuses.some((s: any) => s.value === 'inbox')) {
      statuses.unshift({
        id: 'inbox', value: 'inbox', label: 'Inbox', color: '#8b5cf6', isCompleted: false,
        excludeFromCycle: true, order: -1, autoArchive: false, autoArchiveDelay: 5,
      });
    }
    plugin.statusManager.updateStatuses(statuses);
    plugin.settings.triage = { ...plugin.settings.triage, inboxStatus: 'inbox', somedayStatus: '' };
    plugin.settings.triageLastFreshStart = null;
    await plugin.saveSettings();
  });

  // Wait until the cache sees all seeded tasks.
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

  // 3. Triage: 1 (Today), 5 (Drop), → (Skip), then close.
  expect(await runCommandById('tasknotes:triage-inbox')).toBeTruthy();
  const modal = p.locator('.modal').filter({ has: p.locator('.tn-triage__actions') });
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[0]);

  // Only our three seeded tasks should be in the inbox queue.
  await expect(modal.locator('.tn-triage__progress')).toHaveText('1 of 3');
  await p.keyboard.press('1');
  await expect(modal.locator('.tn-triage__progress')).toHaveText('2 of 3');
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[1]);
  await p.keyboard.press('5');
  await expect(modal.locator('.tn-triage__progress')).toHaveText('3 of 3');
  await expect(modal.locator('.tn-triage__title')).toHaveText(INBOX[2]);
  await p.keyboard.press('ArrowRight');
  await expect(p.locator('.tn-triage__finished')).toHaveText('Inbox clear. 2 sorted, 1 skipped.');
  await p.keyboard.press('Escape');
  await expect(p.locator('.tn-triage__finished')).toHaveCount(0);

  // 4. Frontmatter after triage.
  const today = await todayLocal();
  await expect.poll(async () => dateOf((await frontmatter(INBOX[0]))?.scheduled)).toBe(today);
  expect((await frontmatter(INBOX[0]))?.status).toBe('open');

  // Archiving adds the archive tag; the status is left unchanged.
  const archiveTag = await p.evaluate(
    () => (window as any).app.plugins.plugins['tasknotes'].fieldMapper.toUserField('archiveTag')
  );
  await expect
    .poll(async () => ((await frontmatter(INBOX[1]))?.tags as string[] | undefined) ?? [])
    .toContain(archiveTag);

  const third = await frontmatter(INBOX[2]);
  expect(third?.status).toBe('inbox');
  expect(third?.scheduled).toBeUndefined();
  expect((third?.tags as string[]) ?? []).not.toContain(archiveTag);

  // 5. Fresh start: confirm, then the overdue open task is unscheduled and in the inbox.
  originalNotes = await p.evaluate(async (seeded) => {
    const obsidian = (window as any).app;
    const notes: Record<string, string> = {};
    for (const file of obsidian.vault.getMarkdownFiles()) {
      if (!seeded.includes(file.basename)) notes[file.path] = await obsidian.vault.read(file);
    }
    return notes;
  }, ALL);
  expect(await runCommandById('tasknotes:fresh-start')).toBeTruthy();
  const confirm = p.locator('.modal button.mod-cta', { hasText: 'Fresh start' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(p.locator('.notice', { hasText: 'Fresh start:' })).toBeVisible({ timeout: 15000 });

  await expect.poll(async () => (await frontmatter(OPEN))?.status, { timeout: 15000 }).toBe('inbox');
  expect((await frontmatter(OPEN))?.scheduled ?? undefined).toBeUndefined();
  // Tasks scheduled for today are not overdue and keep their date.
  expect(dateOf((await frontmatter(INBOX[0]))?.scheduled)).toBe(today);

  // 6. Undo restores the scheduled date and status.
  expect(await runCommandById('tasknotes:undo-fresh-start')).toBeTruthy();
  await expect(p.locator('.notice', { hasText: 'Fresh start undone' })).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await frontmatter(OPEN))?.status, { timeout: 15000 }).toBe('open');
  expect(dateOf((await frontmatter(OPEN))?.scheduled)).toBe('2026-01-01');
});
