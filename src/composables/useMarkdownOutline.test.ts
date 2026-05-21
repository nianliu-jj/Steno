import { describe, expect, it } from 'vitest';

import { useMarkdownOutline } from './useMarkdownOutline';

describe('useMarkdownOutline', () => {
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
                children: [],
              },
            ],
          },
          {
            id: 'heading-4',
            text: '四',
            level: 2,
            line: 4,
            children: [],
          },
        ],
      },
    ]);
  });

  it('ignores non-heading lines and preserves heading order', () => {
    const { buildOutline } = useMarkdownOutline();

    expect(
      buildOutline('正文\n### 先出现的三级标题\n- 列表\n# 最后出现的一级标题'),
    ).toEqual([
      {
        id: 'heading-2',
        text: '先出现的三级标题',
        level: 3,
        line: 2,
        children: [],
      },
      {
        id: 'heading-4',
        text: '最后出现的一级标题',
        level: 1,
        line: 4,
        children: [],
      },
    ]);
  });
});
