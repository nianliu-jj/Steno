const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const viewMeta = {
  quicknote: { title: '浮窗速记', eyebrow: 'FLOATING WINDOW', action: '新建速记' },
  clipboard: { title: '剪贴板历史', eyebrow: 'CLIPBOARD', action: '复制选中' },
  pins: { title: '置顶笔记', eyebrow: 'PIN NOTES', action: '新增置顶' },
  canvas: { title: '无限画布', eyebrow: 'CANVAS', action: '新建便签' },
  themes: { title: '个性主题', eyebrow: 'THEMES', action: '应用主题' },
  settings: { title: '偏好设置', eyebrow: 'GLOBAL HOTKEY', action: '保存设置' },
  zen: { title: 'Zen 模式', eyebrow: 'ZEN MODE', action: '进入 Zen' },
};

const accentNames = {
  '#2f6f6b': '松石绿',
  '#b85f3a': '赤陶橙',
  '#3554a4': '钴蓝',
  '#7a5d9d': '灰紫',
  '#2d7c4f': '森林绿',
  '#a23f52': '浆果红',
};

let activeView = 'quicknote';
let clipboardSelection = $('.clip-item.is-selected');
let canvasZoom = 1;
let recordingHotkey = false;
let savedHotkey = '⌘ ⇧ Space';
let floatingAutoHideTimer;

function updateClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  $('#toastRegion').append(item);
  window.setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'opacity .18s ease, transform .18s ease';
  }, 2200);
  window.setTimeout(() => item.remove(), 2600);
}

function setView(view) {
  activeView = view;
  $$('.nav-item').forEach(button => {
    button.classList.toggle('is-active', button.dataset.viewTrigger === view);
  });
  $$('.view').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.view === view);
  });
  const meta = viewMeta[view] || viewMeta.quicknote;
  $('#viewTitle').textContent = meta.title;
  $('#viewEyebrow').textContent = meta.eyebrow;
  $('#primaryAction').textContent = meta.action;
  $('#statusMenu').hidden = true;
  $('#statusTrigger').setAttribute('aria-expanded', 'false');
  applyGlobalSearch();
}

function openFloating() {
  const floating = $('#floatingWindow');
  floating.classList.add('is-visible');
  $('#floatBody').focus();
  toast('浮窗已呼出');
}

function closeFloating({ saved = false } = {}) {
  $('#floatingWindow').classList.remove('is-visible');
  toast(saved ? '已保存并收起' : '浮窗已收起');
}

function scheduleFloatingAutoHide() {
  const autoEnabled = $('#autoCollapseToggle')?.checked ?? true;
  if (!autoEnabled) return;
  window.clearTimeout(floatingAutoHideTimer);
  const delay = Number($('#delayRange')?.value ?? 3) * 1000;
  floatingAutoHideTimer = window.setTimeout(() => {
    closeFloating({ saved: true });
  }, Math.max(delay, 500));
}

function saveDraftFromComposer({ pin = false, source = 'main' } = {}) {
  const title = source === 'floating' ? $('#floatTitle').value : $('#draftTitle').value;
  const body = source === 'floating' ? $('#floatBody').value : $('#draftBody').value;
  const trimmedTitle = title.trim() || '无标题速记';
  const trimmedBody = body.trim() || '空白草稿';
  const row = document.createElement('article');
  row.className = 'note-row';
  row.dataset.search = `${trimmedTitle} ${trimmedBody} ${pin ? 'pin' : ''}`.toLowerCase();
  row.innerHTML = `
    <strong>${escapeHtml(trimmedTitle)}</strong>
    <p>${escapeHtml(trimmedBody.slice(0, 64))}${trimmedBody.length > 64 ? '…' : ''}</p>
    <footer><span>${pin ? '#Pin' : '#速记'}</span><span>刚刚</span></footer>
  `;
  $('#noteList').prepend(row);
  $('#noteTotal').textContent = String($$('.note-row', $('#noteList')).length);
  if (pin) addPin(trimmedTitle, trimmedBody);
  $('#draftState').textContent = '刚刚保存';
}

function addPin(title, body) {
  const note = document.createElement('article');
  note.className = 'pin-note pin-note-green';
  note.dataset.search = `${title} ${body}`.toLowerCase();
  note.innerHTML = `<header><strong>${escapeHtml(title)}</strong><span>⌖</span></header><p>${escapeHtml(body.slice(0, 110))}</p>`;
  $('#pinBoard').prepend(note);
  $('#pinCounter').textContent = String($$('.pin-note', $('#pinBoard')).length);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });
}

function syncClipboardDetail(item) {
  clipboardSelection = item;
  $$('.clip-item').forEach(button => button.classList.toggle('is-selected', button === item));
  $('#clipTitle').textContent = item.dataset.title;
  $('#clipMeta').textContent = `${item.dataset.type} · ${item.dataset.time}`;
  $('#clipContent').textContent = item.dataset.content;
  $('#pinClip').classList.toggle('is-active', item.dataset.pinned === 'true');
}

function filterClipboard() {
  const query = $('#clipSearch').value.trim().toLowerCase();
  const globalQuery = activeView === 'clipboard' ? $('#globalSearch').value.trim().toLowerCase() : '';
  const activeFilter = $('.chip.is-active[data-clip-filter]').dataset.clipFilter;
  let visible = 0;
  $$('.clip-item').forEach(item => {
    const matchType =
      activeFilter === 'all' ||
      item.dataset.type === activeFilter ||
      (activeFilter === 'pinned' && item.dataset.pinned === 'true');
    const haystack = `${item.dataset.title} ${item.dataset.type} ${item.dataset.content}`.toLowerCase();
    const matchSearch = (!query || haystack.includes(query)) && (!globalQuery || haystack.includes(globalQuery));
    const show = matchType && matchSearch;
    item.hidden = !show;
    if (show) visible += 1;
  });
  $('#clipCounter').textContent = String(visible);
}

async function copySelectedClipboard() {
  const text = $('#clipContent').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板');
  } catch {
    toast('浏览器未授权复制，内容已选中');
    const range = document.createRange();
    range.selectNodeContents($('#clipContent'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function applyGlobalSearch() {
  const query = $('#globalSearch').value.trim().toLowerCase();
  const currentView = $(`.view[data-view="${activeView}"]`);
  if (!currentView) return;
  const candidates = $$('[data-search]', currentView);
  candidates.forEach(item => {
    const show = !query || item.dataset.search.toLowerCase().includes(query);
    item.classList.toggle('is-hidden-by-search', !show);
  });
}

function updateCanvasZoom(nextZoom) {
  canvasZoom = Math.min(1.6, Math.max(0.6, nextZoom));
  $('#canvasGrid').style.transform = `scale(${canvasZoom})`;
  $('#zoomValue').textContent = `${Math.round(canvasZoom * 100)}%`;
}

function makeCanvasCardDraggable(card) {
  let startX = 0;
  let startY = 0;
  let cardLeft = 0;
  let cardTop = 0;

  card.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    card.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    cardLeft = Number.parseFloat(card.style.left) || 0;
    cardTop = Number.parseFloat(card.style.top) || 0;
    card.style.zIndex = '3';
  });

  card.addEventListener('pointermove', event => {
    if (!card.hasPointerCapture(event.pointerId)) return;
    const dx = (event.clientX - startX) / canvasZoom;
    const dy = (event.clientY - startY) / canvasZoom;
    card.style.left = `${Math.max(16, cardLeft + dx)}px`;
    card.style.top = `${Math.max(16, cardTop + dy)}px`;
  });

  card.addEventListener('pointerup', event => {
    if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    card.style.zIndex = '';
  });
}

function addCanvasCard() {
  const colors = ['canvas-card-yellow', 'canvas-card-blue', 'canvas-card-green', 'canvas-card-red'];
  const count = $$('.canvas-card').length + 1;
  const card = document.createElement('article');
  card.className = `canvas-card ${colors[count % colors.length]}`;
  card.style.left = `${90 + count * 44}px`;
  card.style.top = `${90 + count * 34}px`;
  card.dataset.search = `新便签 ${count}`;
  card.innerHTML = `<strong>新便签 ${count}</strong><p>拖拽到画布中的任意位置。</p>`;
  $('#canvasGrid').append(card);
  makeCanvasCardDraggable(card);
  $('#canvasCounter').textContent = String($$('.canvas-card').length);
}

function arrangeCanvas() {
  const positions = [
    [72, 72],
    [326, 72],
    [580, 72],
    [72, 246],
    [326, 246],
    [580, 246],
    [72, 420],
    [326, 420],
  ];
  $$('.canvas-card').forEach((card, index) => {
    const [left, top] = positions[index % positions.length];
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  });
  toast('画布已排列');
}

function applyThemeMode(mode) {
  const resolvedMode =
    mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
  document.body.dataset.theme = resolvedMode;
  $$('.theme-mode button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.themeMode === mode);
  });
  localStorage.setItem('steno-prototype-theme-mode', mode);
}

function applyAccent(accent) {
  document.documentElement.style.setProperty('--accent', accent);
  $('#accentLabel').textContent = accentNames[accent] || accent;
  $$('.swatch').forEach(button => button.classList.toggle('is-active', button.dataset.accent === accent));
  localStorage.setItem('steno-prototype-accent', accent);
}

function formatHotkey(event) {
  const parts = [];
  if (event.metaKey) parts.push('⌘');
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('⌥');
  if (event.shiftKey) parts.push('⇧');
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key.replace(' ', 'Space');
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) parts.push(key);
  return parts.join(' ');
}

function setHotkey(value) {
  savedHotkey = value || savedHotkey;
  $('#hotkeyText').textContent = savedHotkey;
  $('#hotkeyDisplay').textContent = savedHotkey;
  $('#hotkeyState').textContent = '已保存';
}

function openZen() {
  const overlay = $('#zenOverlay');
  $('#zenText').value = $('#zenInlineText').value || $('#draftBody').value;
  overlay.hidden = false;
  $('#zenText').focus();
  updateZenCount();
}

function closeZen() {
  $('#zenInlineText').value = $('#zenText').value;
  $('#zenOverlay').hidden = true;
  toast('Zen 草稿已保存');
}

function updateZenCount() {
  const text = $('#zenText').value.trim();
  const count = text ? Array.from(text.replace(/\s+/g, '')).length : 0;
  $('#zenCount').textContent = `${count} 字`;
}

function exportMarkdown() {
  const title = $('#draftTitle').value.trim() || 'Steno Export';
  const body = $('#draftBody').value.trim();
  const pins = $$('.pin-note strong').map(node => `- ${node.textContent}`).join('\n');
  const content = `# ${title}\n\n${body}\n\n## Pinned\n\n${pins}\n`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'steno-export.md';
  link.click();
  URL.revokeObjectURL(url);
  toast('Markdown 已导出');
}

function bindFloatingDrag() {
  const floating = $('#floatingWindow');
  const handle = $('#floatingDragHandle');
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || event.target.closest('input')) return;
    handle.setPointerCapture(event.pointerId);
    const rect = floating.getBoundingClientRect();
    floating.style.left = `${rect.left}px`;
    floating.style.top = `${rect.top}px`;
    floating.style.right = 'auto';
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
  });

  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    const left = Math.min(window.innerWidth - 120, Math.max(10, startLeft + event.clientX - startX));
    const top = Math.min(window.innerHeight - 80, Math.max(38, startTop + event.clientY - startY));
    floating.style.left = `${left}px`;
    floating.style.top = `${top}px`;
  });

  handle.addEventListener('pointerup', event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  });
}

function initSettingsControls() {
  const delayRange = $('#delayRange');
  const widthRange = $('#widthRange');
  const heightRange = $('#heightRange');
  delayRange.addEventListener('input', () => {
    $('#delayLabel').textContent = `${Number(delayRange.value).toFixed(1)}s`;
  });
  widthRange.addEventListener('input', () => {
    $('#widthLabel').textContent = `${widthRange.value}px`;
    $('#floatingWindow').style.width = `${widthRange.value}px`;
  });
  heightRange.addEventListener('input', () => {
    $('#heightLabel').textContent = `${heightRange.value}px`;
    $('#floatingWindow').style.height = `${heightRange.value}px`;
  });
  $('#platformSelect').addEventListener('change', event => {
    $('#activePlatform').textContent = `${event.target.value} 桌面速记工作台`;
    $('.platform-chip').textContent = event.target.value;
    toast(`已切换到 ${event.target.value} 预览`);
  });
}

function handlePrimaryAction() {
  if (activeView === 'quicknote') openFloating();
  if (activeView === 'clipboard') copySelectedClipboard();
  if (activeView === 'pins') addPin('新的置顶笔记', '双击主应用中的 Pin 可以固定在桌面。');
  if (activeView === 'canvas') addCanvasCard();
  if (activeView === 'themes') toast('主题已应用');
  if (activeView === 'settings') toast('设置已保存');
  if (activeView === 'zen') openZen();
}

function bindEvents() {
  $$('.nav-item').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.viewTrigger));
  });

  $('#statusTrigger').addEventListener('click', () => {
    const menu = $('#statusMenu');
    menu.hidden = !menu.hidden;
    $('#statusTrigger').setAttribute('aria-expanded', String(!menu.hidden));
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.system-right') && !event.target.closest('#statusMenu')) {
      $('#statusMenu').hidden = true;
      $('#statusTrigger').setAttribute('aria-expanded', 'false');
    }
  });

  $$('[data-menu-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.menuAction;
      if (action === 'floating') openFloating();
      else if (action === 'zen') openZen();
      else setView(action);
      $('#statusMenu').hidden = true;
      $('#statusTrigger').setAttribute('aria-expanded', 'false');
    });
  });

  $('#openFloating').addEventListener('click', openFloating);
  $('#primaryAction').addEventListener('click', handlePrimaryAction);
  $('#hotkeyDisplay').addEventListener('click', openFloating);
  $('#floatClose').addEventListener('click', () => closeFloating());
  $('#floatMinimize').addEventListener('click', () => closeFloating());
  $('#floatSave').addEventListener('click', () => {
    saveDraftFromComposer({ pin: $('#floatPin').classList.contains('is-active'), source: 'floating' });
    closeFloating({ saved: true });
  });
  $('#floatPin').addEventListener('click', () => {
    $('#floatPin').classList.toggle('is-active');
  });

  $$('.chip[data-tag]').forEach(button => {
    button.addEventListener('click', () => button.classList.toggle('is-active'));
  });

  $('#confirmAction').addEventListener('click', () => {
    if (activeView === 'quicknote') {
      const pin = $$('.chip.is-active[data-tag]').some(button => button.dataset.tag === 'Pin');
      saveDraftFromComposer({ pin });
      toast('速记已保存');
      scheduleFloatingAutoHide();
      return;
    }
    handlePrimaryAction();
  });
  $('#cancelAction').addEventListener('click', () => toast('操作已取消'));
  $('#resetAction').addEventListener('click', () => {
    $('#globalSearch').value = '';
    applyGlobalSearch();
    filterClipboard();
    toast('当前筛选已重置');
  });

  $$('.clip-item').forEach(item => item.addEventListener('click', () => syncClipboardDetail(item)));
  $('#clipSearch').addEventListener('input', filterClipboard);
  $$('.chip[data-clip-filter]').forEach(button => {
    button.addEventListener('click', () => {
      $$('.chip[data-clip-filter]').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
      filterClipboard();
    });
  });
  $('#clearClipboard').addEventListener('click', () => {
    $('#clipSearch').value = '';
    $$('.chip[data-clip-filter]').forEach(item => item.classList.toggle('is-active', item.dataset.clipFilter === 'all'));
    filterClipboard();
  });
  $('#pinClip').addEventListener('click', () => {
    if (!clipboardSelection) return;
    const next = clipboardSelection.dataset.pinned !== 'true';
    clipboardSelection.dataset.pinned = String(next);
    $('#pinClip').classList.toggle('is-active', next);
    const meta = clipboardSelection.querySelector('span');
    meta.textContent = `${clipboardSelection.dataset.type} · ${clipboardSelection.dataset.time}${next ? ' · Pin' : ''}`;
    filterClipboard();
  });
  $('#copyClip').addEventListener('click', copySelectedClipboard);

  $('#globalSearch').addEventListener('input', () => {
    applyGlobalSearch();
    if (activeView === 'clipboard') filterClipboard();
  });

  $('#newCanvasCard').addEventListener('click', addCanvasCard);
  $('#arrangeCanvas').addEventListener('click', arrangeCanvas);
  $('#zoomIn').addEventListener('click', () => updateCanvasZoom(canvasZoom + 0.1));
  $('#zoomOut').addEventListener('click', () => updateCanvasZoom(canvasZoom - 0.1));
  $$('.canvas-card').forEach(makeCanvasCardDraggable);

  $$('.theme-mode button').forEach(button => {
    button.addEventListener('click', () => applyThemeMode(button.dataset.themeMode));
  });
  $$('.swatch').forEach(button => {
    button.addEventListener('click', () => applyAccent(button.dataset.accent));
  });
  $('#toggleThemeQuick').addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyThemeMode(next);
  });

  $('#hotkeyRecorder').addEventListener('click', () => {
    recordingHotkey = true;
    $('#hotkeyState').textContent = '录入中';
    $('#hotkeyText').textContent = '按下组合键';
  });

  document.addEventListener('keydown', event => {
    if (recordingHotkey) {
      event.preventDefault();
      const value = formatHotkey(event);
      if (value) {
        setHotkey(value);
        recordingHotkey = false;
      }
      return;
    }
    if (event.key === 'Escape') {
      if (!$('#zenOverlay').hidden) closeZen();
      else closeFloating();
      return;
    }
    const normalized = formatHotkey(event);
    if (normalized === savedHotkey || (event.ctrlKey && event.shiftKey && event.code === 'Space')) {
      event.preventDefault();
      openFloating();
    }
  });

  $('#enterZen').addEventListener('click', openZen);
  $('#enterZenTop').addEventListener('click', openZen);
  $('#exitZen').addEventListener('click', closeZen);
  $('#zenText').addEventListener('input', updateZenCount);
  $('#exportMarkdown').addEventListener('click', exportMarkdown);
}

function boot() {
  updateClock();
  window.setInterval(updateClock, 30_000);
  const storedMode = localStorage.getItem('steno-prototype-theme-mode') || 'light';
  const storedAccent = localStorage.getItem('steno-prototype-accent') || '#2f6f6b';
  applyThemeMode(storedMode);
  applyAccent(storedAccent);
  bindFloatingDrag();
  initSettingsControls();
  bindEvents();
  filterClipboard();
}

boot();
