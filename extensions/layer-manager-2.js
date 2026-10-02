// Name: 图层管理器2
// ID: layerManager2
// Description: 打开一个浮动面板，通过拖拽列表实时调整角色图层顺序
// By: wangwenhao20211 <https://github.com/wangwenhao20211>
// By: yizhiMC
// License: MIT

(function (Scratch) {
  'use strict';

  const extensionId = 'layerManager2';
  const STYLE_ID = 'tw-layer-manager-style';

  let panelDiv = null;
  let currentRuntime = null;
  let refreshTimer = null;
  let autoRefreshEnabled = false;
  let suppressRefreshUntil = 0;
  let indicatorEl = null;

  // 新增：显示克隆体开关
  let showClones = true;
  // 性能：DOM 缓存 / 顺序指纹 / 轮询计数
  let itemsCache = null;
  let lastOrderHash = 0;
  let pollCount = 0;

  // ============================================================
  //  角色 / 图层顺序
  // ============================================================

  function getAllTargets(runtime) {
    const targets = runtime && runtime.targets;
    if (!targets) return [];
    const out = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t && !t.isStage) out.push(t);
    }
    return out;
  }

  /** 返回「最底层 → 最顶层」的目标（可选择性过滤克隆体） */
  function getSpritesBottomToTop(runtime, includeClones) {
    const all = getAllTargets(runtime);
    const renderer = runtime && runtime.renderer;
    const drawList = renderer && renderer._drawList;

    if (!drawList || typeof drawList.length !== 'number') {
      if (includeClones) return all;
      return all.filter(t => t.isOriginal === true);
    }

    const map = new Map();
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (t.drawableID !== undefined && t.drawableID !== null) map.set(t.drawableID, t);
    }

    const ordered = [];
    const seen = new Set();
    for (let i = 0; i < drawList.length; i++) {
      const t = map.get(drawList[i]);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (includeClones || t.isOriginal === true) ordered.push(t);
    }
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (seen.has(t)) continue;
      if (includeClones || t.isOriginal === true) ordered.push(t);
    }
    return ordered;
  }

  /** 返回「最顶层 → 最底层」的目标 */
  function getOrderedTargets(runtime, includeClones) {
    return getSpritesBottomToTop(runtime, includeClones).reverse();
  }

  /**
   * 性能：为当前图层顺序计算一个廉价指纹。
   * 只做整数运算，避免构造数组 / Map / Set。
   */
  function computeOrderHash(runtime, includeClones) {
    let h = 17;
    const renderer = runtime && runtime.renderer;
    const drawList = renderer && renderer._drawList;

    if (drawList && typeof drawList.length === 'number') {
      const n = drawList.length;
      h = (h * 31 + n) | 0;
      for (let i = 0; i < n; i++) {
        h = (h * 31 + (drawList[i] | 0)) | 0;
      }
    }

    const targets = runtime && runtime.targets;
    h = (h * 31 + (targets ? targets.length : 0)) | 0;
    h = (h * 31 + (includeClones ? 1 : 0)) | 0;
    return h;
  }

  /** 依据面板当前 DOM 顺序应用图层 */
  async function applyOrderFromDom(runtime) {
    if (!runtime || !panelDiv) return;
    const items = getItems();
    const topToBottom = [];
    for (let i = 0; i < items.length; i++) {
      const t = items[i]._target;
      if (t) topToBottom.push(t);
    }

    // 从最底层开始依次置顶，最后置顶的即为最上层
    for (let i = topToBottom.length - 1; i >= 0; i--) {
      const t = topToBottom[i];
      if (t && typeof t.goToFront === 'function') await t.goToFront();
    }

    if (runtime.renderer && typeof runtime.renderer.requestRedraw === 'function') {
      runtime.renderer.requestRedraw();
    }
    suppressRefreshUntil = Date.now() + 500;
  }

  // ============================================================
  //  工具
  // ============================================================

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[m]));
  }

  function spriteName(target) {
    try {
      if (target && typeof target.getName === 'function') return target.getName() || '未命名';
    } catch (e) { /* ignore */ }
    return '未命名';
  }

  function spriteColor(target) {
    const name = spriteName(target);
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return 'hsl(' + (Math.abs(hash) % 360) + ', 70%, 62%)';
  }

  /** 性能：列表项 DOM 查询结果做缓存，仅在结构变化时失效 */
  function getItems() {
    if (!panelDiv) return [];
    if (!itemsCache) {
      itemsCache = Array.prototype.slice.call(panelDiv.querySelectorAll('.sprite-item'));
    }
    return itemsCache;
  }

  function invalidateItems() {
    itemsCache = null;
  }

  function updateIndices() {
    const items = getItems();
    for (let i = 0; i < items.length; i++) {
      const badge = items[i]._indexEl;
      if (badge) badge.textContent = String(i + 1);
    }
    const counter = panelDiv && panelDiv._counterEl;
    if (counter) counter.textContent = items.length + ' 层';
  }

  // ============================================================
  //  拖拽
  // ============================================================

  const dragState = {
    active: false,
    itemEl: null,
    items: null,      // 除被拖拽项之外的稳定顺序数组（拖拽期间不变）
    list: null,
    runtime: null,
    lastY: 0,
    speed: 0,
    rafId: null
  };

  function computeInsertIndex(clientY) {
    const items = dragState.items;
    if (!items) return 0;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  }

  function moveItemTo(index) {
    const list = dragState.list;
    const el = dragState.itemEl;
    const items = dragState.items;
    if (!list || !el || !items) return;

    const ref = items[index] || null;
    if (ref) {
      if (el.nextElementSibling === ref) return;
      list.insertBefore(el, ref);
    } else {
      if (el === list.lastElementChild) return;
      list.appendChild(el);
    }
  }

  function updateIndicator(clientY) {
    if (!indicatorEl || !dragState.list) return;
    const list = dragState.list;
    const items = dragState.items;
    if (!items || !items.length) { indicatorEl.style.display = 'none'; return; }

    const listRect = list.getBoundingClientRect();
    const idx = computeInsertIndex(clientY);

    let y;
    if (idx >= items.length) {
      y = items[items.length - 1].getBoundingClientRect().bottom;
    } else {
      y = items[idx].getBoundingClientRect().top;
    }

    indicatorEl.style.display = 'block';
    indicatorEl.style.top = Math.round(y - listRect.top + list.scrollTop) + 'px';
  }

  function updateAutoScroll(clientY) {
    const list = dragState.list;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    const zone = 48;
    const maxSpeed = 18;
    let speed = 0;
    if (clientY < rect.top + zone) {
      speed = -Math.ceil(((rect.top + zone - clientY) / zone) * maxSpeed);
    } else if (clientY > rect.bottom - zone) {
      speed = Math.ceil(((clientY - (rect.bottom - zone)) / zone) * maxSpeed);
    }
    dragState.speed = Math.max(-maxSpeed, Math.min(maxSpeed, speed));
  }

  function autoScrollTick() {
    if (!dragState.active || !dragState.list) { dragState.rafId = null; return; }
    if (dragState.speed !== 0) {
      const before = dragState.list.scrollTop;
      dragState.list.scrollTop = before + dragState.speed;
      if (dragState.list.scrollTop !== before) updateIndicator(dragState.lastY);
    }
    dragState.rafId = requestAnimationFrame(autoScrollTick);
  }

  function beginDrag(opts) {
    dragState.active = true;
    dragState.itemEl = opts.itemEl;
    dragState.list = opts.list;
    dragState.runtime = opts.runtime;
    dragState.lastY = opts.clientY;
    dragState.speed = 0;
    // 提前算好「其他项」的顺序，拖拽过程中无需再查 DOM
    dragState.items = getItems().filter(el => el !== opts.itemEl);

    opts.itemEl.classList.add('dragging');
    opts.list.classList.add('is-sorting');
    if (indicatorEl) indicatorEl.style.display = 'none';
    if (!dragState.rafId) dragState.rafId = requestAnimationFrame(autoScrollTick);
  }

  async function endDrag(commit) {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.speed = 0;
    if (dragState.rafId) { cancelAnimationFrame(dragState.rafId); dragState.rafId = null; }
    if (dragState.itemEl) dragState.itemEl.classList.remove('dragging');
    if (dragState.list) dragState.list.classList.remove('is-sorting');
    if (indicatorEl) indicatorEl.style.display = 'none';

    const runtime = dragState.runtime;
    dragState.itemEl = null;
    dragState.list = null;
    dragState.items = null;
    invalidateItems();

    updateIndices();
    if (commit && runtime) await applyOrderFromDom(runtime);
  }

  function onHandlePointerDown(e, itemEl, runtime, list) {
    if (dragState.active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    let started = false;

    try { handle.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        started = true;
        beginDrag({ itemEl, runtime, list, clientY: ev.clientY });
      }
      ev.preventDefault();
      dragState.lastY = ev.clientY;
      moveItemTo(computeInsertIndex(ev.clientY));
      updateIndicator(ev.clientY);
      updateAutoScroll(ev.clientY);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      try { handle.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      if (started) endDrag(true);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  // ============================================================
  //  图层移动（按钮 / 键盘）
  // ============================================================

  async function moveItemByStep(itemEl, rawTarget) {
    const list = panelDiv && panelDiv.querySelector('.sprite-list');
    if (!list) return;
    const items = getItems();
    const oldIdx = items.indexOf(itemEl);
    if (oldIdx === -1) return;

    const rest = items.filter(el => el !== itemEl);
    const newIdx = Math.max(0, Math.min(rest.length, rawTarget));
    const ref = rest[newIdx] || null;

    itemEl.remove();
    list.insertBefore(itemEl, ref);

    invalidateItems();
    updateIndices();
    if (newIdx !== oldIdx && currentRuntime) await applyOrderFromDom(currentRuntime);
  }

  // ============================================================
  //  列表渲染
  // ============================================================

  function buildItem(target, index, runtime, list) {
    const isClone = target.isOriginal !== true;
    const sprite = target.sprite || target;
    const name = spriteName(target);
    const color = spriteColor(sprite);

    const li = document.createElement('div');
    li.className = 'sprite-item' + (isClone ? ' clone' : '');
    li.tabIndex = 0;
    li._target = target;
    li.dataset.targetId = target.id;

    li.innerHTML =
      '<span class="layer-index">' + (index + 1) + '</span>' +
      '<span class="drag-handle" title="按住拖拽调整图层">⋮⋮</span>' +
      '<span class="sprite-color" style="background:' + color + '"></span>' +
      '<span class="sprite-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>' +
      '<span class="item-actions">' +
        '<button type="button" class="act" data-act="top" title="置顶">⤒</button>' +
        '<button type="button" class="act" data-act="up" title="上移一层">↑</button>' +
        '<button type="button" class="act" data-act="down" title="下移一层">↓</button>' +
        '<button type="button" class="act" data-act="bottom" title="置底">⤓</button>' +
      '</span>';

    if (isClone) li.style.borderLeftColor = color;

    // 缓存常用子节点，避免重复查询
    li._indexEl = li.querySelector('.layer-index');
    li._nameEl = li.querySelector('.sprite-name');

    // 拖拽把手
    const handle = li.querySelector('.drag-handle');
    handle.addEventListener('pointerdown', (e) => onHandlePointerDown(e, li, runtime, list));

    li.addEventListener('dragstart', e => e.preventDefault());

    // 按钮
    li.querySelector('.item-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      e.stopPropagation();
      const items = getItems();
      const idx = items.indexOf(li);
      if (idx === -1) return;
      const act = btn.dataset.act;
      let t;
      if (act === 'up') t = idx - 1;
      else if (act === 'down') t = idx + 1;
      else if (act === 'top') t = 0;
      else t = Infinity;
      moveItemByStep(li, t);
    });

    // 键盘
    li.addEventListener('keydown', (e) => {
      const items = getItems();
      const idx = items.indexOf(li);
      if (idx === -1) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveItemByStep(li, e.shiftKey ? 0 : idx - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveItemByStep(li, e.shiftKey ? Infinity : idx + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        moveItemByStep(li, 0);
      } else if (e.key === 'End') {
        e.preventDefault();
        moveItemByStep(li, Infinity);
      }
    });

    return li;
  }

  function rebuildList(runtime, keepScroll) {
    if (!panelDiv || !runtime) return;
    const list = panelDiv.querySelector('.sprite-list');
    if (!list) return;

    const scrollTop = keepScroll ? list.scrollTop : 0;

    // 性能：复用已存在的条目 DOM（克隆体大量增删时尤其明显）
    const pool = new Map();
    const oldItems = list.querySelectorAll('.sprite-item');
    for (let i = 0; i < oldItems.length; i++) {
      const el = oldItems[i];
      if (el._target) pool.set(el._target, el);
    }

    list.textContent = '';

    indicatorEl = document.createElement('div');
    indicatorEl.className = 'drop-indicator';
    indicatorEl.style.display = 'none';
    list.appendChild(indicatorEl);

    const targets = getOrderedTargets(runtime, showClones);

    if (targets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = showClones ? '✨ 当前没有角色 ✨' : '✨ 没有可显示的角色（克隆体已隐藏） ✨';
      list.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        let el = pool.get(t);
        if (el) {
          pool.delete(t);
          if (el._indexEl) el._indexEl.textContent = String(i + 1);
        } else {
          el = buildItem(t, i, runtime, list);
        }
        frag.appendChild(el);
      }
      list.appendChild(frag);
    }

    list.scrollTop = scrollTop;
    invalidateItems();
    updateIndices();

    lastOrderHash = computeOrderHash(runtime, showClones);
  }

  // ============================================================
  //  自动刷新（自适应轮询 + 顺序指纹）
  // ============================================================

  function stopAutoRefresh() {
    autoRefreshEnabled = false;
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }

  function scheduleRefresh() {
    if (!autoRefreshEnabled) return;
    if (refreshTimer) clearTimeout(refreshTimer);

    const targets = currentRuntime && currentRuntime.targets;
    const count = targets ? targets.length : 0;
    // 性能：目标越多，轮询越稀疏
    let delay = 400;
    if (count > 400) delay = 1500;
    else if (count > 150) delay = 900;

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!autoRefreshEnabled || !panelDiv || !currentRuntime) return;
      pollOnce();
      scheduleRefresh();
    }, delay);
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshEnabled = true;
    scheduleRefresh();
  }

  function refreshNames() {
    const items = getItems();
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const nameEl = el._nameEl;
      if (!nameEl) continue;
      const n = spriteName(el._target);
      if (nameEl.textContent !== n) {
        nameEl.textContent = n;
        nameEl.title = n;
      }
    }
  }

  function pollOnce() {
    if (!panelDiv || !currentRuntime) return;
    if (document.hidden) return;
    if (dragState.active) return;
    if (Date.now() < suppressRefreshUntil) return;

    const runtime = currentRuntime;
    const hash = computeOrderHash(runtime, showClones);

    if (hash !== lastOrderHash) {
      const live = getOrderedTargets(runtime, showClones);
      const dom = getItems();
      let same = live.length === dom.length;
      if (same) {
        for (let i = 0; i < live.length; i++) {
          if (live[i] !== dom[i]._target) { same = false; break; }
        }
      }
      if (!same) {
        rebuildList(runtime, true);
        return;
      }
      lastOrderHash = hash;
    }

    // 名字变化较慢，降低检查频率
    pollCount++;
    if (pollCount % 5 === 0) refreshNames();
  }

  // ============================================================
  //  样式
  // ============================================================

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tw-layer-manager {
        position: fixed;
        top: 80px;
        right: 20px;
        width: 348px;
        background: rgba(28, 30, 40, 0.92);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-radius: 18px;
        box-shadow: 0 10px 32px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.09);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #fff;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
      }

      .tw-layer-manager .panel-header {
        padding: 11px 14px;
        background: rgba(255,255,255,.13);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: grab;
        font-weight: 600;
        letter-spacing: .4px;
      }
      .tw-layer-manager .panel-header:active { cursor: grabbing; }
      .tw-layer-manager .panel-title { font-size: 14px; }

      .tw-layer-manager .close-btn {
        background: none;
        border: none;
        color: #fff;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 7px;
        border-radius: 40px;
        line-height: 1;
        transition: background .15s, transform .15s;
      }
      .tw-layer-manager .close-btn:hover { background: rgba(255,80,80,.85); transform: scale(1.08); }

      .tw-layer-manager .panel-toolbar {
        padding: 7px 12px;
        background: rgba(0,0,0,.28);
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .tw-layer-manager .refresh-btn {
        background: rgba(76,151,255,.9);
        border: none;
        border-radius: 40px;
        padding: 4px 12px;
        color: #fff;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background .15s, transform .1s;
        flex-shrink: 0;
      }
      .tw-layer-manager .refresh-btn:hover { background: rgba(76,151,255,1); }
      .tw-layer-manager .refresh-btn:active { transform: scale(.96); }

      .tw-layer-manager .auto-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: rgba(255,255,255,.72);
        cursor: pointer;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .tw-layer-manager .auto-toggle input { accent-color: #4c97ff; cursor: pointer; margin: 0; }

      .tw-layer-manager .sprite-count {
        margin-left: auto;
        font-size: 11px;
        color: rgba(255,255,255,.6);
        flex-shrink: 0;
      }

      .tw-layer-manager .sprite-list {
        position: relative;
        padding: 8px;
        max-height: 420px;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      .tw-layer-manager .sprite-list::-webkit-scrollbar { width: 6px; }
      .tw-layer-manager .sprite-list::-webkit-scrollbar-track { background: rgba(0,0,0,.2); border-radius: 10px; }
      .tw-layer-manager .sprite-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.35); border-radius: 10px; }
      .tw-layer-manager .sprite-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.55); }

      .tw-layer-manager .sprite-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        margin: 4px 0;
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.05);
        border-radius: 11px;
        transition: background .15s, border-color .15s, opacity .15s;
        position: relative;
      }
      .tw-layer-manager .sprite-item:hover { background: rgba(255,255,255,.13); }
      .tw-layer-manager .sprite-item:focus {
        outline: none;
        border-color: #4c97ff;
        background: rgba(76,151,255,.16);
      }
      .tw-layer-manager .sprite-item.dragging {
        opacity: .35;
        border-color: #4c97ff;
      }

      .tw-layer-manager .sprite-item.clone {
        margin-left: 22px;
        padding: 4px 8px 4px 7px;
        background: rgba(255,255,255,.035);
        border-left: 3px solid rgba(76,151,255,.5);
        border-radius: 8px;
      }
      .tw-layer-manager .sprite-item.clone:hover {
        background: rgba(76,151,255,.1);
      }
      .tw-layer-manager .sprite-item.clone:focus {
        background: rgba(76,151,255,.2);
      }
      .tw-layer-manager .sprite-item.clone .layer-index {
        min-width: 18px;
        height: 17px;
        font-size: 10px;
        background: rgba(76,151,255,.14);
        color: #a9c8ff;
      }
      .tw-layer-manager .sprite-item.clone .drag-handle { font-size: 11px; width: 14px; letter-spacing: -3px; }
      .tw-layer-manager .sprite-item.clone .sprite-color { width: 9px; height: 9px; }
      .tw-layer-manager .sprite-item.clone .sprite-name { font-size: 12px; font-weight: 400; }
      .tw-layer-manager .sprite-item.clone .item-actions { opacity: .35; }
      .tw-layer-manager .sprite-item.clone:hover .item-actions,
      .tw-layer-manager .sprite-item.clone:focus .item-actions { opacity: 1; }

      .tw-layer-manager .layer-index {
        flex-shrink: 0;
        min-width: 21px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: #cfe1ff;
        background: rgba(76,151,255,.22);
        border-radius: 6px;
        font-variant-numeric: tabular-nums;
      }

      .tw-layer-manager .drag-handle {
        flex-shrink: 0;
        width: 16px;
        text-align: center;
        font-size: 13px;
        line-height: 1;
        letter-spacing: -2px;
        color: rgba(255,255,255,.45);
        cursor: grab;
        touch-action: none;
        transition: color .15s;
      }
      .tw-layer-manager .drag-handle:hover { color: #fff; }
      .tw-layer-manager .sprite-item.dragging .drag-handle { cursor: grabbing; }

      .tw-layer-manager .sprite-color {
        flex-shrink: 0;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(255,255,255,.28);
      }

      .tw-layer-manager .sprite-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
        text-shadow: 0 1px 1px rgba(0,0,0,.25);
      }

      .tw-layer-manager .item-actions {
        flex-shrink: 0;
        display: flex;
        gap: 2px;
        opacity: .5;
        transition: opacity .15s;
      }
      .tw-layer-manager .sprite-item:hover .item-actions,
      .tw-layer-manager .sprite-item:focus .item-actions { opacity: 1; }

      .tw-layer-manager .item-actions .act {
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,.1);
        color: #fff;
        font-size: 11px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background .12s, transform .08s;
      }
      .tw-layer-manager .item-actions .act:hover { background: #4c97ff; }
      .tw-layer-manager .item-actions .act:active { transform: scale(.9); }

      .tw-layer-manager .drop-indicator {
        position: absolute;
        left: 10px;
        right: 10px;
        height: 2px;
        background: #4c97ff;
        border-radius: 2px;
        box-shadow: 0 0 8px rgba(76,151,255,.95);
        pointer-events: none;
        display: none;
        z-index: 5;
      }
      .tw-layer-manager .drop-indicator::before {
        content: '';
        position: absolute;
        left: -4px;
        top: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4c97ff;
      }

      .tw-layer-manager .empty-msg {
        text-align: center;
        padding: 28px 16px;
        color: rgba(255,255,255,.6);
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  //  面板
  // ============================================================

  function closePanel() {
    if (panelDiv && panelDiv.parentNode) panelDiv.parentNode.removeChild(panelDiv);
    panelDiv = null;
    currentRuntime = null;
    indicatorEl = null;
    itemsCache = null;
    stopAutoRefresh();
    if (dragState.active) endDrag(false);
  }

  function createPanel(runtime) {
    if (!runtime) return;

    injectStyle();

    if (panelDiv && panelDiv.parentNode) panelDiv.parentNode.removeChild(panelDiv);
    stopAutoRefresh();
    if (dragState.active) endDrag(false);
    itemsCache = null;

    currentRuntime = runtime;

    panelDiv = document.createElement('div');
    panelDiv.className = 'tw-layer-manager';
    panelDiv.innerHTML =
      '<div class="panel-header">' +
        '<span class="panel-title">📌 图层管理器</span>' +
        '<button class="close-btn" type="button" title="关闭">✕</button>' +
      '</div>' +
      '<div class="panel-toolbar">' +
        '<button class="refresh-btn" type="button">⟳ 刷新</button>' +
        '<label class="auto-toggle"><input type="checkbox" class="auto-check" checked><span>自动刷新</span></label>' +
        '<label class="auto-toggle"><input type="checkbox" class="clone-check" checked><span>显示克隆体</span></label>' +
        '<span class="sprite-count"></span>' +
      '</div>' +
      '<div class="sprite-list"></div>';

    document.body.appendChild(panelDiv);

    const header = panelDiv.querySelector('.panel-header');
    const closeBtn = panelDiv.querySelector('.close-btn');
    const refreshBtn = panelDiv.querySelector('.refresh-btn');
    const autoToggle = panelDiv.querySelector('.auto-check');
    const cloneToggle = panelDiv.querySelector('.clone-check');

    panelDiv._counterEl = panelDiv.querySelector('.sprite-count');

    closeBtn.addEventListener('click', closePanel);
    refreshBtn.addEventListener('click', () => rebuildList(currentRuntime, false));

    autoToggle.addEventListener('change', () => {
      if (autoToggle.checked) startAutoRefresh();
      else stopAutoRefresh();
    });

    // 新增：显示克隆体开关
    showClones = cloneToggle.checked;
    cloneToggle.addEventListener('change', () => {
      showClones = cloneToggle.checked;
      rebuildList(currentRuntime, true);
    });

    // 面板整体拖拽
    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();

      const rect = panelDiv.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;

      panelDiv.style.left = rect.left + 'px';
      panelDiv.style.top = rect.top + 'px';
      panelDiv.style.right = 'auto';

      try { header.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        let left = rect.left + (ev.clientX - startX);
        let top = rect.top + (ev.clientY - startY);
        left = Math.max(-rect.width + 90, Math.min(window.innerWidth - 90, left));
        top = Math.max(0, Math.min(window.innerHeight - 46, top));
        panelDiv.style.left = left + 'px';
        panelDiv.style.top = top + 'px';
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pointerId) return;
        header.removeEventListener('pointermove', onMove);
        header.removeEventListener('pointerup', onUp);
        header.removeEventListener('pointercancel', onUp);
        try { header.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      };

      header.addEventListener('pointermove', onMove);
      header.addEventListener('pointerup', onUp);
      header.addEventListener('pointercancel', onUp);
    });

    rebuildList(runtime, false);
    startAutoRefresh();
  }

  // ============================================================
  //  扩展注册
  // ============================================================

  class layerManager2Extension {
    getInfo() {
      return {
        id: extensionId,
        name: '图层管理器2',
        color1: '#4c97ff',
        color2: '#3373cc',
        blocks: [
          {
            opcode: 'openPanel',
            blockType: Scratch.BlockType.COMMAND,
            text: '打开图层管理器'
          }
        ]
      };
    }

    openPanel(args, util) {
      createPanel(util.runtime);
    }
  }

  Scratch.extensions.register(new layerManager2Extension());
})(Scratch);