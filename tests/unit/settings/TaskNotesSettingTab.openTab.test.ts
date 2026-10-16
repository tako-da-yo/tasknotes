import TaskNotesPlugin from '../../../src/main';
import { TaskNotesSettingTab } from '../../../src/settings/TaskNotesSettingTab';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaults';
import { createI18nService } from '../../../src/i18n';

(HTMLElement.prototype as any).appendText ??= function (text: string) {
  this.appendChild(document.createTextNode(text));
};
(HTMLElement.prototype as any).setAttr ??= function (name: string, value: string) {
  this.setAttribute(name, value);
};

describe('TaskNotesSettingTab.openTab', () => {
  let tab: TaskNotesSettingTab;
  const scrollIntoView = jest.fn();

  beforeEach(() => {
    (global as any).Platform = { isMobile: false };
    (HTMLElement.prototype as any).scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
    const app: any = {
      workspace: { onLayoutReady: (fn: any) => fn() },
      metadataCache: {},
      vault: { getConfig: jest.fn().mockReturnValue(false) },
    };
    const plugin = new TaskNotesPlugin(app);
    (plugin as any).settings = { ...DEFAULT_SETTINGS };
    (plugin as any).i18n = createI18nService();
    (plugin as any).registerEvent = jest.fn();
    (plugin as any).manifest = { version: '0.0.0' };
    (plugin as any).fieldMapper = {
      isPropertyForField: jest.fn(() => false),
      toUserField: jest.fn((field) => field),
      toInternalField: jest.fn((field) => field),
    };
    tab = new TaskNotesSettingTab(app, plugin);
    tab.display();
  });

  test('switches to the given tab', () => {
    tab.openTab('appearance');
    const button = tab.containerEl.querySelector('#tab-button-appearance') as HTMLElement;
    expect(button.classList.contains('is-active')).toBe(true);
    expect(tab.containerEl.querySelector('#settings-tab-appearance')!.classList.contains('active')).toBe(true);
  });

  test('expands and scrolls to a card in the tab', () => {
    tab.openTab('task-properties', 'property-context-groups');
    const card = tab.containerEl.querySelector(
      '#settings-tab-task-properties [data-card-id="property-context-groups"]'
    ) as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.classList.contains('tasknotes-settings__card--collapsed')).toBe(false);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(card);
  });
});
