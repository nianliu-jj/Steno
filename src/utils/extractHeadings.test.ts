/**
 * @file 前端工具函数 - extract Headings
 *
 * 覆盖 extract Headings 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

import { describe, expect, it } from 'vitest';

import { extractHeadings } from './extractHeadings';

// 测试用例：验证「extractHeadings」场景，锁定 extract Headings 的用户可见行为。
describe('extractHeadings', () => {
  // 测试用例：验证「extracts heading level and visible text from markdown」场景，锁定 extract Headings 的用户可见行为。
  it('extracts heading level and visible text from markdown', () => {
    expect(extractHeadings('# 标题\n\n## 第二节\n内容')).toEqual([
      { id: 'heading-0', level: 1, text: '标题' },
      { id: 'heading-1', level: 2, text: '第二节' }
    ]);
  });

  // 测试用例：验证「ignores empty heading markers」场景，锁定 extract Headings 的用户可见行为。
  it('ignores empty heading markers', () => {
    expect(extractHeadings('# \n\n###   \n正文')).toEqual([]);
  });
});
