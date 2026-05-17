// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import WorkspaceTreePanel from './WorkspaceTreePanel.vue';

describe('WorkspaceTreePanel', () => {
  it('renders only workspace tree entries passed in by the parent', () => {
    const wrapper = mount(WorkspaceTreePanel, {
      props: {
        entries: [
          { id: 'folder-1', kind: 'folder', title: '项目目录', previewText: '', tags: [] },
          { id: 'doc-1', kind: 'document', title: '设计文档', previewText: '', tags: [] },
        ],
      },
    });

    expect(wrapper.findAll('.workspace-tree-item')).toHaveLength(2);
    expect(wrapper.text()).toContain('项目目录');
    expect(wrapper.text()).toContain('设计文档');
  });
});
