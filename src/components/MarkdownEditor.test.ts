// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import MarkdownEditor from './MarkdownEditor.vue';

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
});
