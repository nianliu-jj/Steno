/**
 * @file Vue 组合式逻辑 - use Markdown Outline
 *
 * 覆盖 use Markdown Outline 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import { useMarkdownOutline } from './useMarkdownOutline';

// 测试用例：验证「useMarkdownOutline」场景，锁定 use Markdown Outline 的用户可见行为。
describe('useMarkdownOutline', () => {
  // 测试用例：验证「builds a nested outline tree from markdown headings」场景，锁定 use Markdown Outline 的用户可见行为。
  it('builds a nested outline tree from markdown headings', () => {
    const { buildOutline } = useMarkdownOutline();

    expect(buildOutline('# 一\n## 二\n### 三\n## 四')).toEqual([
      {
        id: 'heading-1',
        text: '一',
        level: 1,
        line: 1,
        children: [
          {
            id: 'heading-2',
            text: '二',
            level: 2,
            line: 2,
            children: [
              {
                id: 'heading-3',
                text: '三',
                level: 3,
                line: 3,
                children: []
              }
            ]
          },
          {
            id: 'heading-4',
            text: '四',
            level: 2,
            line: 4,
            children: []
          }
        ]
      }
    ]);
  });

  // 测试用例：验证「ignores non-heading lines and preserves heading order」场景，锁定 use Markdown Outline 的用户可见行为。
  it('ignores non-heading lines and preserves heading order', () => {
    const { buildOutline } = useMarkdownOutline();

    expect(buildOutline('正文\n### 先出现的三级标题\n- 列表\n# 最后出现的一级标题')).toEqual([
      {
        id: 'heading-2',
        text: '先出现的三级标题',
        level: 3,
        line: 2,
        children: []
      },
      {
        id: 'heading-4',
        text: '最后出现的一级标题',
        level: 1,
        line: 4,
        children: []
      }
    ]);
  });
});
