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

  // 显示克隆体开关
  let showClones = true;

  // 性能：DOM 缓存 / 顺序指纹 / 轮询计数
  let itemsCache = null;
  let lastOrderHash = 0;
  let pollCount = 0;

  // 全局活动指针：一次只允许一个拖拽（面板或列表项）
  let activePointerId = null;

  // ============================================================
  // 重置面板位置
  // ============================================================
  function resetPanelPosition() {
    if (!panelDiv) return;
    // 清掉拖动时写入的内联定位，让 CSS 默认值（右上角）生效
    panelDiv.style.left = '';
    panelDiv.style.top = '';
    panelDiv.style.right = '';
  }

  // ============================================================
  // 角色 / 图层顺序
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

  function getOrderedTargets(runtime, includeClones) {
    return getSpritesBottomToTop(runtime, includeClones).reverse();
  }

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

  async function applyOrderFromDom(runtime) {
    if (!runtime || !panelDiv) return;
    const items = getItems();
    const topToBottom = [];
    for (let i = 0; i < items.length; i++) {
      const t = items[i]._target;
      if (t) topToBottom.push(t);
    }
    for (let i = topToBottom.length - 1; i >= 0; i--) {
      const t = topToBottom[i];
      if (t && typeof t.goToFront === 'function') await t.goToFront();
    }
    if (runtime.renderer && typeof runtime.renderer.requestRedraw === 'function') {
      runtime.renderer.requestRedraw();
    }
    suppressRefreshUntil = Date.now() + 800;
  }

  // ============================================================
  // 工具
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

  function getItems() {
    if (!panelDiv) return [];
    if (!itemsCache) {
      itemsCache = Array.prototype.slice.call(panelDiv.querySelectorAll('.sprite-item'));
    }
    return itemsCache;
  }
  function invalidateItems() { itemsCache = null; }

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
  // 拖拽
  // ============================================================
  const dragState = {
    active: false,
    itemEl: null,
    items: null,
    list: null,
    runtime: null,
    lastY: 0,
    speed: 0,
    maxSpeed: 18,
    rafId: null,
    lastTick: 0
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
    if (!items || !items.length) {
      indicatorEl.style.display = 'none';
      return;
    }
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
    const zone = dragState.maxSpeed < 18 ? 64 : 48;
    const maxSpeed = dragState.maxSpeed;
    let speed = 0;
    if (clientY < rect.top + zone) {
      speed = -Math.ceil(((rect.top + zone - clientY) / zone) * maxSpeed);
    } else if (clientY > rect.bottom - zone) {
      speed = Math.ceil(((clientY - (rect.bottom - zone)) / zone) * maxSpeed);
    }
    dragState.speed = Math.max(-maxSpeed, Math.min(maxSpeed, speed));
  }

  function autoScrollTick(ts) {
    if (!dragState.active || !dragState.list) {
      dragState.rafId = null;
      dragState.lastTick = 0;
      return;
    }
    if (!dragState.lastTick) dragState.lastTick = ts;
    const dt = Math.min(50, ts - dragState.lastTick);
    dragState.lastTick = ts;

    if (dragState.speed !== 0) {
      const before = dragState.list.scrollTop;
      const delta = dragState.speed * (dt / 16.667);
      dragState.list.scrollTop = before + delta;
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
    dragState.lastTick = 0;
    dragState.maxSpeed = opts.isTouch ? 10 : 18;

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
    dragState.lastTick = 0;
    if (dragState.rafId) {
      cancelAnimationFrame(dragState.rafId);
      dragState.rafId = null;
    }
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
    if (activePointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    const isTouch = e.pointerType !== 'mouse';
    const threshold = isTouch ? 8 : 4;
    let started = false;

    activePointerId = pointerId;

    try { handle.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

    const cleanup = () => {
      if (activePointerId === pointerId) activePointerId = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      try { handle.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!started) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < threshold) return;
        started = true;
        beginDrag({ itemEl, runtime, list, clientY: ev.clientY, isTouch });
        if (isTouch && navigator.vibrate) {
          try { navigator.vibrate(10); } catch (err) { /* ignore */ }
        }
      }
      if (ev.cancelable) ev.preventDefault();
      dragState.lastY = ev.clientY;
      moveItemTo(computeInsertIndex(ev.clientY));
      updateIndicator(ev.clientY);
      updateAutoScroll(ev.clientY);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (started) endDrag(true);
    };

    const onCancel = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (started) endDrag(true);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  // ============================================================
  // 图层移动（按钮 / 键盘）
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
  // 列表渲染
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

    li._indexEl = li.querySelector('.layer-index');
    li._nameEl = li.querySelector('.sprite-name');

    const handle = li.querySelector('.drag-handle');
    handle.addEventListener('pointerdown', (e) => onHandlePointerDown(e, li, runtime, list));
    li.addEventListener('dragstart', e => e.preventDefault());

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
  // 自动刷新
  // ============================================================
  function stopAutoRefresh() {
    autoRefreshEnabled = false;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh() {
    if (!autoRefreshEnabled) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    const targets = currentRuntime && currentRuntime.targets;
    const count = targets ? targets.length : 0;

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

    pollCount++;
    if (pollCount % 5 === 0) refreshNames();
  }

  // ============================================================
  // 样式
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
  width: min(348px, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 100px);
  max-height: calc(100dvh - 100px);
  display: flex;
  flex-direction: column;
  background: rgba(28, 30, 40, 0.94);
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
  -webkit-touch-callout: none;
  touch-action: manipulation;
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
  flex-shrink: 0;
  touch-action: none;
  min-height: 44px;
  box-sizing: border-box;
}
.tw-layer-manager .panel-header:active { cursor: grabbing; }
.tw-layer-manager .panel-title { font-size: 14px; pointer-events: none; }

.tw-layer-manager .close-btn {
  background: none; border: none; color: #fff;
  font-size: 16px; cursor: pointer;
  padding: 4px 10px; border-radius: 40px; line-height: 1;
  transition: background .15s, transform .15s;
  touch-action: manipulation;
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
  flex-shrink: 0;
}

.tw-layer-manager .refresh-btn {
  background: rgba(76,151,255,.9);
  border: none; border-radius: 40px;
  padding: 5px 14px; color: #fff;
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: background .15s, transform .1s;
  flex-shrink: 0;
  touch-action: manipulation;
}
.tw-layer-manager .refresh-btn:hover { background: rgba(76,151,255,1); }
.tw-layer-manager .refresh-btn:active { transform: scale(.96); }

.tw-layer-manager .auto-toggle {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: rgba(255,255,255,.72);
  cursor: pointer; flex-shrink: 0; white-space: nowrap;
}
.tw-layer-manager .auto-toggle input { accent-color: #4c97ff; cursor: pointer; margin: 0; }
.tw-layer-manager .sprite-count {
  margin-left: auto; font-size: 11px;
  color: rgba(255,255,255,.6); flex-shrink: 0;
}

.tw-layer-manager .sprite-list {
  position: relative;
  padding: 8px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.tw-layer-manager .sprite-list::-webkit-scrollbar { width: 6px; }
.tw-layer-manager .sprite-list::-webkit-scrollbar-track { background: rgba(0,0,0,.2); border-radius: 10px; }
.tw-layer-manager .sprite-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.35); border-radius: 10px; }
.tw-layer-manager .sprite-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.55); }

.tw-layer-manager .sprite-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; margin: 4px 0;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.05);
  border-radius: 11px;
  transition: background .15s, border-color .15s, opacity .15s;
  position: relative;
}
.tw-layer-manager .sprite-item:focus {
  outline: none; border-color: #4c97ff; background: rgba(76,151,255,.16);
}
.tw-layer-manager .sprite-item.dragging { opacity: .35; border-color: #4c97ff; }

.tw-layer-manager .sprite-item.clone {
  margin-left: 22px; padding: 4px 8px 4px 7px;
  background: rgba(255,255,255,.035);
  border-left: 3px solid rgba(76,151,255,.5);
  border-radius: 8px;
}
.tw-layer-manager .sprite-item.clone:focus { background: rgba(76,151,255,.2); }
.tw-layer-manager .sprite-item.clone .layer-index {
  min-width: 18px; height: 17px; font-size: 10px;
  background: rgba(76,151,255,.14); color: #a9c8ff;
}
.tw-layer-manager .sprite-item.clone .drag-handle { font-size: 11px; width: 14px; letter-spacing: -3px; }
.tw-layer-manager .sprite-item.clone .sprite-color { width: 9px; height: 9px; }
.tw-layer-manager .sprite-item.clone .sprite-name { font-size: 12px; font-weight: 400; }
.tw-layer-manager .sprite-item.clone .item-actions { opacity: .35; }

.tw-layer-manager .layer-index {
  flex-shrink: 0;
  min-width: 21px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #cfe1ff;
  background: rgba(76,151,255,.22);
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.tw-layer-manager .drag-handle {
  flex-shrink: 0;
  width: 16px; text-align: center;
  font-size: 13px; line-height: 1;
  letter-spacing: -2px;
  color: rgba(255,255,255,.45);
  cursor: grab;
  touch-action: none;
  transition: color .15s;
}
.tw-layer-manager .sprite-item.dragging .drag-handle { cursor: grabbing; }

.tw-layer-manager .sprite-color {
  flex-shrink: 0; width: 12px; height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255,255,255,.28);
}

.tw-layer-manager .sprite-name {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 500;
  text-shadow: 0 1px 1px rgba(0,0,0,.25);
}

.tw-layer-manager .item-actions {
  flex-shrink: 0; display: flex; gap: 2px;
  opacity: .5;
  transition: opacity .15s;
}
.tw-layer-manager .item-actions .act {
  width: 20px; height: 20px; padding: 0;
  border: none; border-radius: 6px;
  background: rgba(255,255,255,.1); color: #fff;
  font-size: 11px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background .12s, transform .08s;
  touch-action: manipulation;
}
.tw-layer-manager .item-actions .act:hover { background: #4c97ff; }
.tw-layer-manager .item-actions .act:active { transform: scale(.9); }

.tw-layer-manager .drop-indicator {
  position: absolute; left: 10px; right: 10px; height: 2px;
  background: #4c97ff; border-radius: 2px;
  box-shadow: 0 0 8px rgba(76,151,255,.95);
  pointer-events: none; display: none; z-index: 5;
}
.tw-layer-manager .drop-indicator::before {
  content: ''; position: absolute; left: -4px; top: -3px;
  width: 8px; height: 8px; border-radius: 50%; background: #4c97ff;
}

.tw-layer-manager .empty-msg {
  text-align: center; padding: 28px 16px;
  color: rgba(255,255,255,.6); font-style: italic;
}

@media (hover: hover) and (pointer: fine) {
  .tw-layer-manager .sprite-item:hover { background: rgba(255,255,255,.13); }
  .tw-layer-manager .sprite-item:hover .item-actions,
  .tw-layer-manager .sprite-item:focus .item-actions { opacity: 1; }
  .tw-layer-manager .sprite-item.clone:hover { background: rgba(76,151,255,.1); }
  .tw-layer-manager .sprite-item.clone:hover .item-actions,
  .tw-layer-manager .sprite-item.clone:focus .item-actions { opacity: 1; }
  .tw-layer-manager .drag-handle:hover { color: #fff; }
}

@media (hover: none), (pointer: coarse) {
  .tw-layer-manager .item-actions { opacity: 1; }
  .tw-layer-manager .sprite-item.clone .item-actions { opacity: .85; }

  .tw-layer-manager .sprite-item { padding: 8px; gap: 8px; }
  .tw-layer-manager .sprite-item.clone { padding: 6px 8px 6px 7px; }

  .tw-layer-manager .drag-handle {
    width: 30px;
    font-size: 15px;
    letter-spacing: -2px;
    padding: 8px 0;
    margin: -8px 0;
  }
  .tw-layer-manager .sprite-item.clone .drag-handle {
    width: 26px; font-size: 13px; letter-spacing: -3px; padding: 6px 0; margin: -6px 0;
  }

  .tw-layer-manager .layer-index { min-width: 26px; height: 24px; font-size: 12px; }
  .tw-layer-manager .sprite-item.clone .layer-index { min-width: 22px; height: 21px; }

  .tw-layer-manager .item-actions { gap: 4px; }
  .tw-layer-manager .item-actions .act {
    width: 30px; height: 30px; font-size: 13px; border-radius: 8px;
  }
  .tw-layer-manager .sprite-color { width: 11px; height: 11px; }

  .tw-layer-manager .refresh-btn { padding: 7px 16px; font-size: 12px; }
  .tw-layer-manager .auto-toggle { font-size: 12px; padding: 3px 0; }
  .tw-layer-manager .auto-toggle input { width: 16px; height: 16px; }
}

@media (max-width: 640px) {
  .tw-layer-manager {
    top: 60px;
    right: 12px;
    max-height: calc(100vh - 72px);
    max-height: calc(100dvh - 72px);
  }
  .tw-layer-manager .sprite-list { max-height: 52vh; }
}
@media (max-height: 560px) {
  .tw-layer-manager .sprite-list { max-height: 40vh; }
}
`;
    document.head.appendChild(style);
  }

  // ============================================================
  // 面板
  // ============================================================
  function closePanel() {
    if (dragState.active) endDrag(false);
    activePointerId = null;
    if (panelDiv && panelDiv.parentNode) panelDiv.parentNode.removeChild(panelDiv);
    panelDiv = null;
    currentRuntime = null;
    indicatorEl = null;
    itemsCache = null;
    stopAutoRefresh();
  }

  function createPanel(runtime) {
    if (!runtime) return;
    injectStyle();
    if (panelDiv && panelDiv.parentNode) panelDiv.parentNode.removeChild(panelDiv);
    stopAutoRefresh();
    if (dragState.active) endDrag(false);
    activePointerId = null;
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

    showClones = cloneToggle.checked;
    cloneToggle.addEventListener('change', () => {
      showClones = cloneToggle.checked;
      rebuildList(currentRuntime, true);
    });

    // ---------- 面板整体拖拽（不做任何边界限制） ----------
    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (activePointerId !== null) return;

      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const rect = panelDiv.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;

      activePointerId = pointerId;

      panelDiv.style.left = rect.left + 'px';
      panelDiv.style.top = rect.top + 'px';
      panelDiv.style.right = 'auto';

      try { header.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

      const cleanup = () => {
        if (activePointerId === pointerId) activePointerId = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        try { header.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      };

      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        if (ev.cancelable) ev.preventDefault();

        // ★ 不做任何夹取，拖到哪就是哪
        const left = rect.left + (ev.clientX - startX);
        const top = rect.top + (ev.clientY - startY);

        panelDiv.style.left = left + 'px';
        panelDiv.style.top = top + 'px';
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pointerId) return;
        cleanup();
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    rebuildList(runtime, false);
    startAutoRefresh();
  }

  // ============================================================
  // 扩展注册
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
          },
          {
            opcode: 'resetPanelPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: '重置图层管理器位置'
          }
        ]
      };
    }

    openPanel(args, util) {
      createPanel(util.runtime);
    }

    resetPanelPosition() {
      resetPanelPosition();
    }
  }

  Scratch.extensions.register(new layerManager2Extension());
})(Scratch);