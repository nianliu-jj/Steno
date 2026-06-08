/**
 * @file 前端工具函数 - note Preview
 *
 * 覆盖 note Preview 的主要行为、边界条件和跨模块契约，帮助重构时快速定位预期。
 * 注释重点标明数据入口、状态边界、事件通道和协作风险点，便于逐行阅读时快速判断代码意图。
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderNotePreviewHtml } from './notePreview';

// 测试用例：验证「renderNotePreviewHtml」场景，锁定 note Preview 的用户可见行为。
describe('renderNotePreviewHtml', () => {
  // 测试用例：验证「把常见 Markdown 渲染为卡片摘要 HTML，并隐藏原始语法标记」场景，锁定 note Preview 的用户可见行为。
  it('把常见 Markdown 渲染为卡片摘要 HTML，并隐藏原始语法标记', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('# 标题\n\n继续**推进** <u>Phase 4</u> 你好啊 [a](hh)');

    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>推进</strong>');
    expect(html).toContain('<u>Phase 4</u>');
    expect(html).toContain('<a href="hh">a</a>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('&lt;u&gt;');
    // 标题与段落属于两个块，应有换行分隔
    expect(html).toContain('<br');
  });

  // 测试用例：验证「把围栏代码块压缩为一行摘要，避免卡片被大代码块撑开」场景，锁定 note Preview 的用户可见行为。
  it('把围栏代码块压缩为一行摘要，避免卡片被大代码块撑开', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('```java\npublic class Test {\n}\n```');

    expect(html).toContain('note-preview-code');
    expect(html).toContain('public class Test {');
    expect(html).not.toContain('<pre');
  });

  // 测试用例：验证「把图片渲染为 [图片] 占位，不暴露原始路径」场景，锁定 note Preview 的用户可见行为。
  it('把图片渲染为 [图片] 占位，不暴露原始路径', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('![复杂度图](assets/image-20240718101650827.png)');

    expect(html).toContain('[图片]');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('assets/image-20240718101650827.png');
  });

  // 测试用例：验证「把表格渲染为 [表格] 占位，不展开单元格内容」场景，锁定 note Preview 的用户可见行为。
  it('把表格渲染为 [表格] 占位，不展开单元格内容', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('| A | B |\n| --- | --- |\n| a | b |');

    expect(html).toContain('[表格]');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<td');
    expect(html).not.toContain('<th');
  });

  // 测试用例：验证「段落之间体现原文换行，不再黏连成一行」场景，锁定 note Preview 的用户可见行为。
  it('段落之间体现原文换行，不再黏连成一行', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('第一行\n\n第二行');

    expect(html).toContain('<br');
    expect(html).not.toContain('第一行第二行');
  });

  // 测试用例：验证「列表的每一项各自成行」场景，锁定 note Preview 的用户可见行为。
  it('列表的每一项各自成行', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('- a\n- v');

    expect(html).toContain('<br');
    // a 与 v 应被换行分隔，而非黏连
    expect(html).not.toContain('av');
  });

  // 测试用例：验证「混合内容（标题/引用/列表/表格）逐行展示并占位表格」场景，锁定 note Preview 的用户可见行为。
  it('混合内容（标题/引用/列表/表格）逐行展示并占位表格', () => {
    // 局部常量 md：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const md = '# 继续推进 Phase 4\n\n> 你好啊\n\n- a\n- v\n\n| A | B |\n| --- | --- |\n| a | b |';
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml(md);

    expect(html).toContain('你好啊');
    expect(html).toContain('[表格]');
    expect(html).not.toContain('<table');
    // 标题｜你好啊｜a｜v｜[表格] 共 5 行 → 至少 4 个换行分隔
    const brCount = (html.match(/<br/g) ?? []).length;
    expect(brCount).toBeGreaterThanOrEqual(4);
  });

  // 测试用例：验证「清理 script 与事件属性」场景，锁定 note Preview 的用户可见行为。
  it('清理 script 与事件属性', () => {
    // 局部常量 html：缓存当前流程的中间结果，避免后续逻辑重复计算或重复读取状态。
    const html = renderNotePreviewHtml('<script>alert(1)</script><img src=x onerror=alert(1)>正文');

    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html).toContain('正文');
  });
});
