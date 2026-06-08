/**
 * @file 前端通用组件 - Workspace Tree Panel
 *
 * 覆盖 Workspace Tree Panel 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import WorkspaceTreePanel from './WorkspaceTreePanel.vue';

// 测试用例：验证「WorkspaceTreePanel」场景，锁定 Workspace Tree Panel 的用户可见行为。
describe('WorkspaceTreePanel', () => {
  // 测试用例：验证「renders only workspace tree entries passed in by the parent」场景，锁定 Workspace Tree Panel 的用户可见行为。
  it('renders only workspace tree entries passed in by the parent', () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WorkspaceTreePanel, {
      props: {
        entries: [
          {
            id: 'folder-1',
            kind: 'folder',
            title: '项目目录',
            previewText: '',
            tags: [],
            wordCount: 0,
            byteSize: 0,
            createdAt: '',
            updatedAt: ''
          },
          {
            id: 'doc-1',
            kind: 'document',
            title: '设计文档',
            previewText: '',
            tags: [],
            wordCount: 0,
            byteSize: 0,
            createdAt: '',
            updatedAt: ''
          }
        ]
      }
    });

    expect(wrapper.findAll('.workspace-tree-item')).toHaveLength(2);
    expect(wrapper.text()).toContain('项目目录');
    expect(wrapper.text()).toContain('设计文档');
  });

  // 测试用例：验证「emits the selected tree entry when clicking a workspace node」场景，锁定 Workspace Tree Panel 的用户可见行为。
  it('emits the selected tree entry when clicking a workspace node', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(WorkspaceTreePanel, {
      props: {
        entries: [
          {
            id: 'folder-1',
            kind: 'folder',
            title: '项目目录',
            previewText: '',
            tags: [],
            wordCount: 0,
            byteSize: 0,
            createdAt: '',
            updatedAt: ''
          }
        ]
      }
    });

    await wrapper.get('[data-testid="workspace-tree-entry-folder-1"]').trigger('click');

    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({
      id: 'folder-1',
      kind: 'folder'
    });
  });
});
