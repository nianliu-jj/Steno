// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderNotePreviewHtml } from './notePreview';

describe('renderNotePreviewHtml', () => {
  it('把常见 Markdown 渲染为卡片摘要 HTML，并隐藏原始语法标记', () => {
    const html = renderNotePreviewHtml('# 标题\n\n继续**推进** <u>Phase 4</u> 你好啊 [a](hh)');

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>推进</strong>');
    expect(html).toContain('<u>Phase 4</u>');
    expect(html).toContain('<a href="hh">a</a>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('&lt;u&gt;');
  });

  it('把围栏代码块压缩为一行摘要，避免卡片被大代码块撑开', () => {
    const html = renderNotePreviewHtml('```java\npublic class Test {\n}\n```');

    expect(html).toContain('note-preview-code');
    expect(html).toContain('public class Test {');
    expect(html).not.toContain('<pre');
  });

  it('把图片渲染为轻量占位，保留可读路径文本', () => {
    const html = renderNotePreviewHtml('![复杂度图](assets/image-20240718101650827.png)');

    expect(html).toContain('note-preview-image');
    expect(html).toContain('assets/image-20240718101650827.png');
    expect(html).not.toContain('<img');
  });

  it('清理 script 与事件属性', () => {
    const html = renderNotePreviewHtml('<script>alert(1)</script><img src=x onerror=alert(1)>正文');

    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html).toContain('正文');
  });
});
