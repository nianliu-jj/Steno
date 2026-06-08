/**
 * @file 前端通用组件 - Document Outline Tree
 *
 * 覆盖 Document Outline Tree 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DocumentOutlineTree from './DocumentOutlineTree.vue';

// 测试用例：验证「DocumentOutlineTree」场景，锁定 Document Outline Tree 的用户可见行为。
describe('DocumentOutlineTree', () => {
  // 测试用例：验证「renders nested outline nodes and emits select on click」场景，锁定 Document Outline Tree 的用户可见行为。
  it('renders nested outline nodes and emits select on click', async () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(DocumentOutlineTree, {
      props: {
        nodes: [
          {
            id: 'heading-1',
            text: '一级标题',
            level: 1,
            line: 1,
            children: [
              {
                id: 'heading-2',
                text: '二级标题',
                level: 2,
                line: 2,
                children: []
              }
            ]
          }
        ]
      }
    });

    expect(wrapper.text()).toContain('一级标题');
    expect(wrapper.text()).toContain('二级标题');

    // 局部常量 h1Badge：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const h1Badge = wrapper.get('[data-testid="outline-node-level-heading-1"]');
    expect(h1Badge.text()).toBe('H1');
    expect(h1Badge.attributes('aria-label')).toBe('H1');
    // 局部常量 h2Badge：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const h2Badge = wrapper.get('[data-testid="outline-node-level-heading-2"]');
    expect(h2Badge.text()).toBe('H2');

    await wrapper.get('[data-testid="outline-node-heading-2"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([
      [
        {
          id: 'heading-2',
          text: '二级标题',
          level: 2,
          line: 2,
          children: []
        }
      ]
    ]);
  });

  // 测试用例：验证「renders an empty hint when no headings are available」场景，锁定 Document Outline Tree 的用户可见行为。
  it('renders an empty hint when no headings are available', () => {
    // 局部常量 wrapper：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const wrapper = mount(DocumentOutlineTree, {
      props: {
        nodes: []
      }
    });

    expect(wrapper.get('[data-testid="outline-empty"]').text()).toContain('暂无大纲');
  });
});
