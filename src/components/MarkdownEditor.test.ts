// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import MarkdownEditor from './MarkdownEditor.vue';
import {
  buildImagePasteMarkdown,
  getClipboardImageFiles,
  readFileAsDataUrl,
} from './markdown-editor/extensions';

const savePastedImage = vi.fn(async () => ({
  markdownUrl: 'steno-asset:images/2026-05-28/paste.png',
  relativePath: 'images/2026-05-28/paste.png',
  absolutePath: '/tmp/steno/images/2026-05-28/paste.png',
}));
const getDataPaths = vi.fn(async () => ({
  dataDir: '/tmp/steno',
  dbPath: '/tmp/steno/data.db',
  backupDir: '/tmp/steno/backup',
}));

vi.mock('@/composables/useDb', () => ({
  useDb: () => ({
    savePastedImage,
    getDataPaths,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}));

async function settleAsyncPaste() {
  await new Promise(resolve => setTimeout(resolve, 10));
  await nextTick();
}

async function waitForLastModelUpdate(wrapper: ReturnType<typeof mountEditor>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settleAsyncPaste();
    const events = wrapper.emitted('update:modelValue');
    const latest = events?.[events.length - 1]?.[0];
    if (typeof latest === 'string') return latest;
  }
  return undefined;
}

function mountEditor(modelValue = '') {
  return mount(MarkdownEditor, {
    props: { modelValue, placeholder: '测试占位符' },
    attachTo: document.body,
  });
}

describe('MarkdownEditor', () => {
  it('renders the CodeMirror container with placeholder', () => {
    const wrapper = mountEditor('');
    expect(wrapper.find('[data-testid="md-editor"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('cm-editor');
    wrapper.unmount();
  });

  it('seeds the editor with the initial v-model markdown source', () => {
    const wrapper = mountEditor('# 标题\n正文段');
    expect(wrapper.text()).toContain('# 标题');
    expect(wrapper.text()).toContain('正文段');
    wrapper.unmount();
  });

  it('emits update:modelValue when document text changes', async () => {
    const wrapper = mountEditor('hello');
    const vm = wrapper.vm as unknown as {
      view: { dispatch: (tr: { changes: { from: number; insert: string } }) => void };
    };
    vm.view.dispatch({ changes: { from: 5, insert: ' world' } });
    await nextTick();
    const events = wrapper.emitted('update:modelValue');
    expect(events?.[events.length - 1]).toEqual(['hello world']);
    wrapper.unmount();
  });

  it('exposes focus and scrollToLine without throwing', () => {
    const wrapper = mountEditor('line 1\nline 2\nline 3\nline 4');
    const exposed = wrapper.vm as unknown as {
      focus: () => void;
      scrollToLine: (line: number) => void;
    };
    expect(() => exposed.focus()).not.toThrow();
    expect(() => exposed.scrollToLine(3)).not.toThrow();
    expect(() => exposed.scrollToLine(999)).not.toThrow();
    expect(() => exposed.scrollToLine(-2)).not.toThrow();
    wrapper.unmount();
  });

  it('synchronizes external v-model writes back into the editor', async () => {
    const wrapper = mountEditor('initial');
    await wrapper.setProps({ modelValue: 'after-set' });
    await nextTick();
    expect(wrapper.text()).toContain('after-set');
    wrapper.unmount();
  });

  it('stores pasted image files and inserts short previewable markdown URLs', async () => {
    const wrapper = mountEditor('before');
    const image = new File(['fake-image'], 'paste.png', { type: 'image/png' });
    const text = new File(['plain text'], 'note.txt', { type: 'text/plain' });
    const data = {
      files: [image, text],
      items: [],
    } as unknown as DataTransfer;

    const files = getClipboardImageFiles(data);
    const dataUrl = await readFileAsDataUrl(files[0]);
    const markdown = buildImagePasteMarkdown([dataUrl]);

    expect(files).toEqual([image]);
    expect(markdown).toMatch(/^!\[pasted image\]\(data:image\/png;base64,/);

    const vm = wrapper.vm as unknown as {
      view: {
        contentDOM: HTMLElement;
      };
    };
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', { value: data });

    vm.view.contentDOM.dispatchEvent(pasteEvent);
    const latest = await waitForLastModelUpdate(wrapper);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(savePastedImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
    expect(latest).toContain('![pasted image](steno-asset:images/2026-05-28/paste.png)');
    expect(latest).not.toContain('data:image/png;base64,');
    wrapper.unmount();
  });
});
