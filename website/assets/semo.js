(function () {
    const navMap = {
        'floating.html': 'floating',
        'clipboard.html': 'clipboard',
        'canvas.html': 'canvas',
        'zen.html': 'zen',
        'settings.html': 'settings'
    };

    const path = window.location.pathname.split('/').pop() || 'index.html';
    const active = navMap[path] || 'home';

    document.querySelectorAll('[data-nav]').forEach((link) => {
        const isActive = link.dataset.nav === active;
        if (isActive) {
            link.setAttribute('aria-current', 'page');
            link.dataset.active = 'true';
        }
    });

    const storedTheme = localStorage.getItem('semo-theme');
    if (storedTheme && storedTheme !== 'system') {
        document.documentElement.dataset.theme = storedTheme;
    }

    function toast(message) {
        let node = document.querySelector('.toast');
        if (!node) {
            node = document.createElement('div');
            node.className = 'toast';
            document.body.appendChild(node);
        }
        node.textContent = message;
        node.classList.add('show');
        clearTimeout(window.semoToastTimer);
        window.semoToastTimer = setTimeout(() => node.classList.remove('show'), 1900);
    }

    function copyText(value) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(
                () => toast('已复制到剪贴板'),
                () => toast('当前浏览器限制复制，已模拟完成')
            );
        } else {
            toast('已模拟复制');
        }
    }

    document.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', () => copyText(button.dataset.copy));
    });

    document.querySelectorAll('.switch').forEach((button) => {
        button.addEventListener('click', () => {
            const next = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(next));
            toast(next ? '已开启' : '已关闭');
        });
    });

    function initFloating() {
        const panel = document.querySelector('.floating-window');
        const openButton = document.querySelector('[data-action="toggle-floating"]');
        const closeButton = document.querySelector('[data-action="close-floating"]');
        const input = document.querySelector('#quick-note');
        const list = document.querySelector('#quick-list');
        const pinButton = document.querySelector('[data-action="pin-current"]');
        if (!panel || !openButton || !input || !list) return;

        openButton.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toast(panel.classList.contains('collapsed') ? '浮窗已自动收起' : 'Semo 浮窗已呼出');
        });

        closeButton?.addEventListener('click', () => {
            panel.classList.add('collapsed');
            toast('浮窗已收起，状态栏继续待命');
        });

        pinButton?.addEventListener('click', () => {
            const first = list.querySelector('.note-row');
            first?.setAttribute('data-pinned', first.dataset.pinned === 'true' ? 'false' : 'true');
            toast(first?.dataset.pinned === 'true' ? '已置顶当前笔记' : '已取消置顶');
        });

        document.querySelector('[data-action="add-note"]')?.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) {
                toast('先写一句速记内容');
                input.focus();
                return;
            }
            const item = document.createElement('article');
            item.className = 'note-row';
            item.innerHTML = '<strong></strong><div class="note-meta"><span>刚刚</span><span class="tag">速记</span></div>';
            item.querySelector('strong').textContent = text;
            list.prepend(item);
            input.value = '';
            toast('已保存到本地速记');
        });
    }

    function initClipboard() {
        const search = document.querySelector('#clip-search');
        const rows = Array.from(document.querySelectorAll('.clip-row'));
        const previewTitle = document.querySelector('#preview-title');
        const previewBody = document.querySelector('#preview-body');
        const previewMeta = document.querySelector('#preview-meta');
        const previewCopy = document.querySelector('#preview-copy');
        const chips = Array.from(document.querySelectorAll('[data-filter]'));
        if (!rows.length) return;

        function select(row) {
            rows.forEach((item) => item.setAttribute('aria-selected', String(item === row)));
            previewTitle.textContent = row.dataset.title;
            previewBody.textContent = row.dataset.content;
            previewMeta.textContent = `${row.dataset.type} · ${row.dataset.time}`;
            if (previewCopy) previewCopy.dataset.copy = row.dataset.content;
        }

        function applyFilter() {
            const keyword = (search?.value || '').trim().toLowerCase();
            const activeChip = chips.find((chip) => chip.dataset.active === 'true');
            const filter = activeChip?.dataset.filter || 'all';
            rows.forEach((row) => {
                const text = `${row.dataset.title} ${row.dataset.content} ${row.dataset.type}`.toLowerCase();
                const byText = !keyword || text.includes(keyword);
                const byType = filter === 'all' || row.dataset.type === filter || (filter === 'pinned' && row.dataset.pinned === 'true');
                row.hidden = !(byText && byType);
            });
        }

        rows.forEach((row) => {
            row.addEventListener('click', () => select(row));
            row.querySelector('[data-pin]')?.addEventListener('click', (event) => {
                event.stopPropagation();
                row.dataset.pinned = row.dataset.pinned === 'true' ? 'false' : 'true';
                row.setAttribute('data-pinned', row.dataset.pinned);
                toast(row.dataset.pinned === 'true' ? '已 Pin 收藏' : '已取消 Pin');
                applyFilter();
            });
        });

        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                chips.forEach((item) => (item.dataset.active = 'false'));
                chip.dataset.active = 'true';
                applyFilter();
            });
        });

        search?.addEventListener('input', applyFilter);
        select(rows[0]);
    }

    function initCanvas() {
        const board = document.querySelector('.canvas-board');
        const zoomLabel = document.querySelector('#zoom-label');
        if (!board || !zoomLabel) return;
        let zoom = 1;

        function setZoom(next) {
            zoom = Math.min(1.35, Math.max(0.72, next));
            board.style.transform = `scale(${zoom})`;
            zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
        }

        document.querySelector('[data-zoom="in"]')?.addEventListener('click', () => setZoom(zoom + 0.1));
        document.querySelector('[data-zoom="out"]')?.addEventListener('click', () => setZoom(zoom - 0.1));
        document.querySelector('[data-action="arrange"]')?.addEventListener('click', () => {
            document.querySelectorAll('.sticky-card').forEach((card, index) => {
                const col = index % 3;
                const row = Math.floor(index / 3);
                card.style.left = `${40 + col * 290}px`;
                card.style.top = `${38 + row * 190}px`;
            });
            toast('已按智能网格排列');
        });

        document.querySelector('[data-action="new-card"]')?.addEventListener('click', () => {
            const card = document.createElement('article');
            card.className = 'sticky-card accent';
            card.style.left = '86px';
            card.style.top = '430px';
            card.innerHTML = '<div class="handle"><span>新便签</span><span>拖拽移动</span></div><strong>未命名想法</strong><p class="muted" style="margin-top:8px">点击后可以继续细化为笔记卡。</p>';
            board.appendChild(card);
            makeDraggable(card);
            toast('已放入新便签');
        });

        function makeDraggable(card) {
            let startX = 0;
            let startY = 0;
            let originLeft = 0;
            let originTop = 0;
            card.addEventListener('pointerdown', (event) => {
                if (event.target.closest('button')) return;
                card.classList.add('is-dragging');
                card.setPointerCapture(event.pointerId);
                startX = event.clientX;
                startY = event.clientY;
                originLeft = parseFloat(card.style.left || card.offsetLeft);
                originTop = parseFloat(card.style.top || card.offsetTop);
            });
            card.addEventListener('pointermove', (event) => {
                if (!card.classList.contains('is-dragging')) return;
                const dx = (event.clientX - startX) / zoom;
                const dy = (event.clientY - startY) / zoom;
                card.style.left = `${originLeft + dx}px`;
                card.style.top = `${originTop + dy}px`;
            });
            card.addEventListener('pointerup', () => card.classList.remove('is-dragging'));
            card.addEventListener('pointercancel', () => card.classList.remove('is-dragging'));
        }

        document.querySelectorAll('.sticky-card').forEach(makeDraggable);
        setZoom(1);
    }

    function initZen() {
        const area = document.querySelector('#zen-text');
        const wordCount = document.querySelector('#zen-count');
        const timer = document.querySelector('#zen-timer');
        const cleanButton = document.querySelector('[data-action="zen-clean"]');
        const saveButton = document.querySelector('[data-action="zen-save"]');
        if (!area || !wordCount) return;

        let seconds = 0;
        setInterval(() => {
            seconds += 1;
            const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
            const rest = String(seconds % 60).padStart(2, '0');
            if (timer) timer.textContent = `${minutes}:${rest}`;
        }, 1000);

        function updateCount() {
            const text = area.value.trim();
            const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
            const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/\b[\w-]+\b/g) || []).length;
            wordCount.textContent = `${cjk + words} 字`;
        }

        area.addEventListener('input', updateCount);
        cleanButton?.addEventListener('click', () => {
            document.body.classList.toggle('is-zen-clean');
            toast(document.body.classList.contains('is-zen-clean') ? '已隐藏界面干扰' : '已恢复工具栏');
        });
        saveButton?.addEventListener('click', () => {
            localStorage.setItem('semo-zen-draft', area.value);
            toast('草稿已保存到本地');
        });
        const draft = localStorage.getItem('semo-zen-draft');
        if (draft) area.value = draft;
        updateCount();
    }

    function initSettings() {
        const themeButtons = Array.from(document.querySelectorAll('[data-theme-choice]'));
        const shortcut = document.querySelector('#shortcut-field');
        const accentButtons = Array.from(document.querySelectorAll('[data-accent]'));
        if (!themeButtons.length && !shortcut && !accentButtons.length) return;

        themeButtons.forEach((button) => {
            const value = button.dataset.themeChoice;
            button.setAttribute('aria-pressed', String((storedTheme || 'system') === value));
            button.addEventListener('click', () => {
                localStorage.setItem('semo-theme', value);
                if (value === 'dark') document.documentElement.dataset.theme = 'dark';
                if (value === 'light' || value === 'system') document.documentElement.removeAttribute('data-theme');
                themeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
                toast(`已切换为${button.textContent.trim()}`);
            });
        });

        accentButtons.forEach((button) => {
            button.addEventListener('click', () => {
                document.documentElement.style.setProperty('--accent', button.dataset.accent);
                toast('已更新主题强调色预览');
            });
        });

        shortcut?.addEventListener('focus', () => {
            shortcut.value = '按下新的快捷键';
            shortcut.select();
        });
        shortcut?.addEventListener('keydown', (event) => {
            event.preventDefault();
            const keys = [];
            if (event.metaKey) keys.push('⌘');
            if (event.ctrlKey) keys.push('Ctrl');
            if (event.altKey) keys.push('Option');
            if (event.shiftKey) keys.push('Shift');
            if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) keys.push(event.key.toUpperCase());
            shortcut.value = keys.join(' + ') || '⌘ + Shift + Space';
            toast('全局快捷键已记录');
        });
    }

    initFloating();
    initClipboard();
    initCanvas();
    initZen();
    initSettings();
})();
