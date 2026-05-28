/**
 * @file Mermaid 图占位识别、主题派生与异步渲染。
 *
 * 渲染流程：
 * 1. `renderer.ts` 在 fence 规则中把 ```` ```mermaid ```` 块输出为
 *    `<pre class="mermaid-placeholder" data-source="<base64>"></pre>` 占位。
 * 2. `MarkdownReadSurface.vue` 在 `onMounted` / `watch(rendered)` 中调用
 *    `renderMermaidPlaceholders(rootEl)` —— 此函数扫描占位节点，
 *    异步加载 mermaid 内核（按需 import），逐个 `mermaid.render` 并替换为 SVG。
 * 3. 主题切换时调用 `resetMermaidRendering(rootEl)`，把已渲染节点退回占位态，
 *    再次调用 `renderMermaidPlaceholders` 即可用新主题色重渲染。
 *
 * Mermaid 渲染必须串行：内部用 `renderQueue` Promise chain 避免并发 `mermaid.render`
 * 之间互相干扰临时 DOM 节点（参考 PureMark `code-block.ts` 的同名机制）。
 */

const PLACEHOLDER_SELECTOR = 'pre.mermaid-placeholder';
const RENDERED_FLAG = 'data-mermaid-rendered';

let renderQueue: Promise<unknown> = Promise.resolve();
let renderCounter = 0;
let mermaidInitialized = false;

interface MermaidThemeConfig {
  theme: 'default' | 'dark';
  themeVariables: Record<string, string>;
}

/** 解码 base64 → utf8 字符串。 */
function decodeMermaidSource(encoded: string): string {
  try {
    const binary =
      typeof atob === 'function' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

/**
 * 从 `:root` 上的 `--app-*` 变量派生 mermaid theme。
 *
 * 参考 PureMark `src/core/nodeviews/code-block.ts:180` 的同名函数，按 Steno 变量重新映射：
 *   --app-accent       → primaryColor
 *   --app-accent-soft  → secondaryColor
 *   --app-bg           → background / backgroundColor
 *   --app-surface      → bgColor2
 *   --app-surface-2    → bgColor3
 *   --app-fg           → textColor
 *   --app-muted        → textColor2 / lineColor
 *   --app-border       → borderColor
 */
export function getMermaidThemeVariables(): MermaidThemeConfig {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const style = root ? getComputedStyle(root) : null;
  const get = (prop: string) => (style ? style.getPropertyValue(prop).trim() : '');

  const accent = get('--app-accent') || '#A85F32';
  const accentSoft = get('--app-accent-soft') || '#D6A27B';
  const bg = get('--app-bg') || '#ffffff';
  const surface = get('--app-surface') || '#f7f7f7';
  const surface2 = get('--app-surface-2') || '#efefef';
  const fg = get('--app-fg') || '#1f1f1f';
  const muted = get('--app-muted') || '#666666';
  const border = get('--app-border') || '#d4d4d4';

  const isDark = !!root?.classList.contains('dark');

  return {
    theme: isDark ? 'dark' : 'default',
    themeVariables: {
      primaryColor: accent,
      primaryBorderColor: border,
      secondaryColor: accentSoft,
      secondaryBorderColor: border,
      tertiaryColor: surface2,
      tertiaryBorderColor: border,
      lineColor: muted,
      textColor: fg,
      background: bg,
      mainBkg: isDark ? surface : bg,
      nodeBorder: border,
      titleColor: fg,
      edgeLabelBackground: bg,

      actorBkg: bg,
      actorBorder: border,
      actorTextColor: fg,
      actorLineColor: muted,
      signalColor: muted,
      signalTextColor: fg,
      labelBoxBkgColor: bg,
      labelBoxBorderColor: border,
      labelTextColor: fg,
      loopTextColor: fg,
      activationBorderColor: border,
      activationBkgColor: surface,

      noteBkgColor: surface,
      noteBorderColor: border,

      clusterBkg: surface,
      clusterBorder: border,

      altBackground: surface,

      attributeBackgroundColorEven: bg,
      attributeBackgroundColorOdd: surface,

      pie1: accent,
      pie2: accentSoft,
      pie3: surface2,
      pie4: muted,
      pieTitleTextColor: fg,
      pieLegendTextColor: fg,
      pieStrokeColor: border,
      pieOuterStrokeColor: border,
      pieOpacity: '0.9',

      gridColor: border,
      todayLineColor: accent,
      taskTextOutsideColor: fg,
      taskTextClickableColor: accent,
      activeTaskBkgColor: accent,
      activeTaskBorderColor: border,
      doneTaskBkgColor: surface2,
      doneTaskBorderColor: border,
      critBkgColor: isDark ? '#bf616a' : '#d08770',
      critBorderColor: isDark ? '#bf616a' : '#d08770',
      sectionBkgColor: surface,
      sectionBkgColor2: surface2,
      taskBkgColor: surface,
      taskBorderColor: border,

      git0: accent,
      git1: accentSoft,
      git2: surface2,
      git3: muted,
      gitInv0: bg,
      commitLabelColor: fg,
      commitLabelBackground: bg,
      tagLabelColor: fg,
      tagLabelBackground: surface,
      tagLabelBorder: border,
    },
  };
}

/**
 * 重置 root 内所有已渲染的 mermaid 节点为占位态，便于主题切换后重新渲染。
 */
export function resetMermaidRendering(root: HTMLElement): void {
  const rendered = root.querySelectorAll<HTMLElement>(`${PLACEHOLDER_SELECTOR}[${RENDERED_FLAG}]`);
  rendered.forEach((node) => {
    node.removeAttribute(RENDERED_FLAG);
    node.innerHTML = '';
  });
}

/**
 * 扫描 root 内所有 mermaid 占位节点，串行渲染为 SVG。
 *
 * @param root 包含占位节点的容器元素（如 MarkdownReadSurface 的预览 div）
 */
export async function renderMermaidPlaceholders(root: HTMLElement): Promise<void> {
  const placeholders = root.querySelectorAll<HTMLElement>(PLACEHOLDER_SELECTOR);
  if (placeholders.length === 0) return;

  // 动态 import 避免冷启动加载 ~800KB
  const mermaid = (await import('mermaid')).default;

  const themeConfig = getMermaidThemeVariables();
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      ...themeConfig,
    });
    mermaidInitialized = true;
  } else {
    // 重新初始化以应用新主题
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...themeConfig });
  }

  placeholders.forEach((node) => {
    if (node.hasAttribute(RENDERED_FLAG)) return;
    node.setAttribute(RENDERED_FLAG, 'true');

    const encoded = node.getAttribute('data-source') || '';
    const source = decodeMermaidSource(encoded);
    const renderId = `steno-mermaid-${++renderCounter}`;

    renderQueue = renderQueue.then(async () => {
      if (!source.trim()) {
        node.innerHTML = '<div class="mermaid-error">空 mermaid 内容</div>';
        return;
      }
      try {
        const { svg } = await mermaid.render(renderId, source);
        node.innerHTML = svg;
      } catch (err) {
        // mermaid.render 异常时可能留下临时 DOM 节点 — 清理一下
        document.getElementById(renderId)?.remove();
        document.getElementById(`d${renderId}`)?.remove();
        document.getElementById(`i${renderId}`)?.remove();
        const msg = err instanceof Error ? err.message : String(err);
        node.innerHTML = `<div class="mermaid-error">Mermaid 语法错误：${escapeText(msg)}</div>`;
      }
    });
  });

  await renderQueue;
}

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;',
  );
}
