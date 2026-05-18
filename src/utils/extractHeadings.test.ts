import { describe, expect, it } from 'vitest';

import { extractHeadings } from './extractHeadings';

describe('extractHeadings', () => {
  it('extracts heading level and visible text from markdown', () => {
    expect(extractHeadings('# 标题\n\n## 第二节\n内容')).toEqual([
      { id: 'heading-0', level: 1, text: '标题' },
      { id: 'heading-1', level: 2, text: '第二节' },
    ]);
  });

  it('ignores empty heading markers', () => {
    expect(extractHeadings('# \n\n###   \n正文')).toEqual([]);
  });
});
