(() => {
    const viewCopy = {
        capture: ['速记', '状态栏呼出，写完即收起，全部保存在本机。'],
        clipboard: ['剪贴板', '按文字、链接、代码和 Pin 收藏快速回溯复制记录。'],
        canvas: ['画布', '拖拽便签、缩放视图，并把零散想法整理成工作区。'],
        zen: ['Zen', '隐藏干扰后只保留文字、计时和字数。'],
        settings: ['设置', '配置主题、快捷键、剪贴板历史和 Markdown 导出。']
    };

    const toast = document.querySelector('#toast');
    const floatingMemo = document.querySelector('#floatingMemo');
    const viewTitle = document.querySelector('#viewTitle');
    const viewSubtitle = document.querySelector('#viewSubtitle');
    const contextSummary = document.querySelector('#contextSummary');
    let activeClip = document.querySelector('.clip-card[aria-selected="true"]');

    function notify(message) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(window.semoToastTimer);
        window.semoToastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => notify('已复制到剪贴板'), () => notify('已模拟复制'));
            return;
        }
        notify('已模拟复制');
    }

    function setView(name) {
        document.querySelectorAll('[data-view]').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.view === name);
        });
        document.querySelectorAll('[data-view-trigger]').forEach((button) => {
            button.setAttribute('aria-selected', String(button.dataset.viewTrigger === name));
        });
        viewTitle.textContent = viewCopy[name][0];
        viewSubtitle.textContent = viewCopy[name][1];
        document.body.classList.toggle('zen-focused', false);
    }

    document.querySelectorAll('[data-view-trigger]').forEach((button) => {
        button.addEventListener('click', () => setView(button.dataset.viewTrigger));
    });

    document.querySelector('#menubarToggle').addEventListener('click', () => {
        floatingMemo.classList.toggle('is-hidden');
        notify(floatingMemo.classList.contains('is-hidden') ? 'Semo 已收起到状态栏' : 'Semo 浮窗已呼出');
    });

    document.querySelector('#openFloating').addEventListener('click', () => {
        floatingMemo.classList.remove('is-hidden');
        document.querySelector('#floatText').focus();
    });

    document.querySelector('#closeFloat').addEventListener('click', () => {
        floatingMemo.classList.add('is-hidden');
        notify('浮窗已收起');
    });

    function addNote(title, body, pinned) {
        const list = document.querySelector('#noteList');
        const card = document.createElement('article');
        card.className = 'note-card';
        card.dataset.pinned = String(pinned);
        card.innerHTML = '<strong></strong><p class="muted"></p><div class="note-meta"><span class="tag"></span><span>刚刚</span></div>';
        card.querySelector('strong').textContent = title || '未命名速记';
        card.querySelector('p').textContent = body || '空白内容';
        card.querySelector('.tag').textContent = pinned ? 'Pin' : '速记';
        list.prepend(card);
        const count = list.querySelectorAll('.note-card').length;
        document.querySelector('#noteCount').textContent = String(count);
        document.querySelector('#todayNotes').textContent = String(Number(document.querySelector('#todayNotes').textContent) + 1);
        if (pinned) document.querySelector('#pinTotal').textContent = String(Number(document.querySelector('#pinTotal').textContent) + 1);
        contextSummary.textContent = `今天有 ${document.querySelector('#todayNotes').textContent} 条速记、${document.querySelector('#pinTotal').textContent} 条置顶、38 条剪贴板记录。`;
    }

    document.querySelector('#saveNote').addEventListener('click', () => {
        addNote(document.querySelector('#noteTitle').value.trim(), document.querySelector('#noteBody').value.trim(), document.querySelector('#pinDraft').dataset.active === 'true');
        notify('速记已保存到本地');
    });

    document.querySelector('#pinDraft').addEventListener('click', (event) => {
        const active = event.currentTarget.dataset.active !== 'true';
        event.currentTarget.dataset.active = String(active);
        event.currentTarget.classList.toggle('soft', active);
        notify(active ? '草稿将作为 Pin 保存' : '草稿已取消 Pin');
    });

    document.querySelector('#floatSave').addEventListener('click', () => {
        addNote('状态栏速记', document.querySelector('#floatText').value.trim(), document.querySelector('#pinFloat').dataset.active === 'true');
        floatingMemo.classList.add('is-hidden');
        notify('浮窗速记已保存');
    });

    document.querySelector('#pinFloat').addEventListener('click', (event) => {
        const active = event.currentTarget.dataset.active !== 'true';
        event.currentTarget.dataset.active = String(active);
        event.currentTarget.classList.toggle('soft', active);
        notify(active ? '浮窗内容将置顶' : '已取消置顶');
    });

    document.querySelector('#floatToCanvas').addEventListener('click', () => {
        addCanvasCard('浮窗便签', document.querySelector('#floatText').value.trim(), true);
        setView('canvas');
        floatingMemo.classList.add('is-hidden');
        notify('已放到画布');
    });

    document.querySelectorAll('[data-note-tag]').forEach((chip) => {
        chip.addEventListener('click', () => {
            const next = chip.getAttribute('aria-pressed') !== 'true';
            chip.setAttribute('aria-pressed', String(next));
        });
    });

    document.querySelectorAll('[data-copy-source]').forEach((button) => {
        button.addEventListener('click', () => copyText(document.querySelector(`#${button.dataset.copySource}`).value));
    });

    function selectClip(row) {
        activeClip = row;
        document.querySelectorAll('.clip-card').forEach((item) => item.setAttribute('aria-selected', String(item === row)));
        document.querySelector('#clipTitle').textContent = row.dataset.title;
        document.querySelector('#clipMeta').textContent = `${row.dataset.type} · ${row.dataset.time}`;
        document.querySelector('#clipBody').textContent = row.dataset.content;
    }

    function filterClips() {
        const keyword = document.querySelector('#clipSearch').value.trim().toLowerCase();
        const activeFilter = document.querySelector('[data-clip-filter][aria-pressed="true"]').dataset.clipFilter;
        document.querySelectorAll('.clip-card').forEach((row) => {
            const text = `${row.dataset.title} ${row.dataset.type} ${row.dataset.content}`.toLowerCase();
            const byKeyword = !keyword || text.includes(keyword);
            const byType = activeFilter === 'all' || row.dataset.type === activeFilter || (activeFilter === 'pinned' && row.dataset.pinned === 'true');
            row.hidden = !(byKeyword && byType);
        });
    }

    document.querySelectorAll('.clip-card').forEach((row) => row.addEventListener('click', () => selectClip(row)));
    document.querySelector('#clipSearch').addEventListener('input', filterClips);
    document.querySelectorAll('[data-clip-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-clip-filter]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
            button.setAttribute('aria-pressed', 'true');
            filterClips();
        });
    });

    document.querySelector('#pinClip').addEventListener('click', () => {
        if (!activeClip) return;
        activeClip.dataset.pinned = activeClip.dataset.pinned === 'true' ? 'false' : 'true';
        activeClip.setAttribute('data-pinned', activeClip.dataset.pinned);
        notify(activeClip.dataset.pinned === 'true' ? '已 Pin 收藏' : '已取消 Pin');
        filterClips();
    });

    document.querySelector('#copyClip').addEventListener('click', () => {
        if (activeClip) copyText(activeClip.dataset.content);
    });

    let zoom = 1;
    const board = document.querySelector('#canvasBoard');
    const zoomLabel = document.querySelector('#zoomLabel');

    function setZoom(next) {
        zoom = Math.min(1.34, Math.max(0.72, next));
        board.style.transform = `scale(${zoom})`;
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function makeDraggable(card) {
        let startX = 0;
        let startY = 0;
        let originLeft = 0;
        let originTop = 0;
        card.addEventListener('pointerdown', (event) => {
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

    function addCanvasCard(title, body, accent) {
        const card = document.createElement('article');
        card.className = `sticky-note${accent ? ' accent' : ''}`;
        card.style.left = '80px';
        card.style.top = '438px';
        card.innerHTML = '<div class="handle"><span>新便签</span><span>拖拽</span></div><strong></strong><p class="muted" style="margin-top:8px"></p>';
        card.querySelector('strong').textContent = title;
        card.querySelector('p').textContent = body || '空白便签';
        board.appendChild(card);
        makeDraggable(card);
    }

    document.querySelectorAll('.sticky-note').forEach(makeDraggable);
    document.querySelector('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
    document.querySelector('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
    document.querySelector('#newCard').addEventListener('click', () => {
        addCanvasCard('未命名想法', '从速记、剪贴板或空白卡片创建。', true);
        notify('已创建画布便签');
    });
    document.querySelector('#arrangeCards').addEventListener('click', () => {
        document.querySelectorAll('.sticky-note').forEach((card, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            card.style.left = `${42 + col * 292}px`;
            card.style.top = `${40 + row * 188}px`;
        });
        notify('已按网格整理');
    });

    const zenText = document.querySelector('#zenText');
    const zenCount = document.querySelector('#zenCount');
    const zenTimer = document.querySelector('#zenTimer');
    let seconds = 0;

    function updateZenCount() {
        const text = zenText.value.trim();
        const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/\b[\w-]+\b/g) || []).length;
        const total = cjk + words;
        zenCount.textContent = `${total} 字`;
        document.querySelector('#zenBadge').textContent = String(total);
    }

    window.setInterval(() => {
        seconds += 1;
        const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
        const rest = String(seconds % 60).padStart(2, '0');
        zenTimer.textContent = `${minutes}:${rest}`;
    }, 1000);

    zenText.addEventListener('input', updateZenCount);
    document.querySelector('#saveZen').addEventListener('click', () => {
        localStorage.setItem('semo-prototype-zen', zenText.value);
        notify('Zen 草稿已保存到本地');
    });
    document.querySelector('#focusZen').addEventListener('click', () => {
        document.body.classList.toggle('zen-focused');
        notify(document.body.classList.contains('zen-focused') ? '已隐藏界面' : '已恢复界面');
    });

    document.querySelectorAll('.switch').forEach((button) => {
        button.addEventListener('click', () => {
            const next = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(next));
            notify(next ? '已开启' : '已关闭');
        });
    });

    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-theme-choice]').forEach((item) => item.setAttribute('aria-pressed', 'false'));
            button.setAttribute('aria-pressed', 'true');
            const value = button.dataset.themeChoice;
            if (value === 'dark') document.documentElement.dataset.theme = 'dark';
            if (value === 'light' || value === 'system') document.documentElement.removeAttribute('data-theme');
            notify(`已切换为${button.textContent.trim()}`);
        });
    });

    document.querySelectorAll('[data-accent]').forEach((button) => {
        button.addEventListener('click', () => {
            document.documentElement.style.setProperty('--accent', button.dataset.accent);
            notify('强调色已更新');
        });
    });

    document.querySelector('#shortcutInput').addEventListener('focus', (event) => {
        event.currentTarget.value = '按下新的快捷键';
        event.currentTarget.select();
    });
    document.querySelector('#shortcutInput').addEventListener('keydown', (event) => {
        event.preventDefault();
        const keys = [];
        if (event.metaKey) keys.push('⌘');
        if (event.ctrlKey) keys.push('Ctrl');
        if (event.altKey) keys.push('Option');
        if (event.shiftKey) keys.push('Shift');
        if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) keys.push(event.key.toUpperCase());
        event.currentTarget.value = keys.join(' + ') || '⌘ + Shift + Space';
        document.querySelector('#hotkeyButton').textContent = event.currentTarget.value;
        notify('全局快捷键已记录');
    });

    document.querySelector('#exportMarkdown').addEventListener('click', () => {
        copyText('# Semo 导出\n\n- 状态栏浮窗\n- 剪贴板历史\n- 无限画布\n- Zen 草稿');
    });

    document.querySelectorAll('[data-icon-choice]').forEach((button) => {
        button.addEventListener('click', () => notify(`已选择${button.textContent.trim()}图标`));
    });

    const savedZen = localStorage.getItem('semo-prototype-zen');
    if (savedZen) zenText.value = savedZen;
    updateZenCount();
    setZoom(1);
})();
