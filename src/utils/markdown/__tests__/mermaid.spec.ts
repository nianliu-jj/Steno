/**
 * @file Mermaid 模块单元测试。
 *
 * 注：jsdom 对 SVG 渲染支持有限，且 mermaid 自身依赖 DOM 测量 API；
 * 此处仅测试主题派生函数与重置 API，真实 mermaid.render 流程在 dev 中手动验证。
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMermaidThemeVariables, resetMermaidRendering } from '../mermaid';

describe('getMermaidThemeVariables', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--app-accent', '#A85F32');
    document.documentElement.style.setProperty('--app-bg', '#ffffff');
    document.documentElement.style.setProperty('--app-fg', '#1f1f1f');
    document.documentElement.style.setProperty('--app-border', '#d4d4d4');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
  });

  it('returns theme: "default" in light mode', () => {
    const config = getMermaidThemeVariables();
    expect(config.theme).toBe('default');
    expect(config.themeVariables.primaryColor).toBe('#A85F32');
    expect(config.themeVariables.background).toBe('#ffffff');
  });

  it('switches theme to "dark" when html.dark is set', () => {
    document.documentElement.classList.add('dark');
    const config = getMermaidThemeVariables();
    expect(config.theme).toBe('dark');
  });

  it('uses fallback colors when CSS variables are absent', () => {
    document.documentElement.removeAttribute('style');
    const config = getMermaidThemeVariables();
    expect(config.themeVariables.primaryColor.length).toBeGreaterThan(0);
    expect(config.themeVariables.textColor.length).toBeGreaterThan(0);
  });
});

describe('resetMermaidRendering', () => {
  it('clears innerHTML and data-mermaid-rendered flag on previously rendered nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <pre class="mermaid-placeholder" data-source="abc" data-mermaid-rendered="true"><svg></svg></pre>
      <pre class="mermaid-placeholder" data-source="def"></pre>
    `;

    resetMermaidRendering(root);

    const placeholders = root.querySelectorAll('pre.mermaid-placeholder');
    expect(placeholders[0].hasAttribute('data-mermaid-rendered')).toBe(false);
    expect(placeholders[0].innerHTML).toBe('');
    // 未渲染过的节点保持原样
    expect(placeholders[1].innerHTML.trim()).toBe('');
  });
});
