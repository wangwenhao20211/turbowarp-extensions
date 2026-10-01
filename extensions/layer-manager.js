// Name: 图层管理器
// ID: layerManager
// Description: 打开一个浮动面板，通过拖拽列表实时调整角色图层顺序。
// By: wangwenhao20211 <https://github.com/wangwenhao20211>
// License: MIT

(function (Scratch) {
  'use strict';

  const extensionId = 'layerManager';
  let panelDiv = null;
  let currentRuntime = null;

  // ---------- 角色数据获取 ----------
  function getOriginalSprites(runtime) {
    if (!runtime || !runtime.targets) return [];
    return runtime.targets.filter(t => !t.isStage && t.isOriginal === true);
  }

  function getSpritesInZOrder(runtime) {
    const sprites = getOriginalSprites(runtime);
    const renderer = runtime.renderer;
    if (!renderer || !renderer._drawList) return sprites;
    const drawList = renderer._drawList;
    const drawableToTarget = new Map();
    for (const target of sprites) {
      if (target.drawableID !== undefined) drawableToTarget.set(target.drawableID, target);
    }
    const ordered = [];
    for (const drawableId of drawList) {
      const target = drawableToTarget.get(drawableId);
      if (target && ordered.indexOf(target) === -1) ordered.push(target);
    }
    for (const target of sprites) {
      if (ordered.indexOf(target) === -1) ordered.push(target);
    }
    return ordered;
  }

  async function applyLayerOrder(runtime, targetsInOrder) {
    if (!runtime) return;
    for (const target of targetsInOrder) {
      if (target && target.goToFront) await target.goToFront();
    }
    if (runtime.renderer && runtime.renderer.requestRedraw) runtime.renderer.requestRedraw();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function (m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // ---------- 拖拽状态 ----------
  const dragState = {
    active: false,
    startY: 0,
    currentY: 0,
    dragItem: null,
    listContainer: null,
    scrollInterval: null,
    currentOrder: [],
    runtime: null,
  };

  function stopAutoScroll() {
    if (dragState.scrollInterval) {
      clearInterval(dragState.scrollInterval);
      dragState.scrollInterval = null;
    }
  }

  function startAutoScroll(direction) {
    if (dragState.scrollInterval) return;
    const step = 15;
    dragState.scrollInterval = setInterval(() => {
      if (!dragState.active || !dragState.listContainer) {
        stopAutoScroll();
        return;
      }
      if (direction === 'up') dragState.listContainer.scrollTop -= step;
      else if (direction === 'down') dragState.listContainer.scrollTop += step;
      updateDragInsertPosition(dragState.currentY);
    }, 20);
  }

  function updateDragInsertPosition(clientY) {
    if (!dragState.active || !dragState.listContainer) return;
    const items = Array.from(dragState.listContainer.children).filter(
      child => child.classList && child.classList.contains('sprite-item')
    );
    if (items.length === 0) return;

    let targetIndex = -1;
    let targetItem = null;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientY > rect.top && clientY < rect.bottom) {
        targetItem = items[i];
        targetIndex = i;
        break;
      }
    }
    if (!targetItem) {
      const firstRect = items[0].getBoundingClientRect();
      const lastRect = items[items.length - 1].getBoundingClientRect();
      if (clientY < firstRect.top) targetIndex = 0;
      else if (clientY > lastRect.bottom) targetIndex = items.length;
      else return;
    } else {
      const rect = targetItem.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY >= mid) targetIndex = targetIndex + 1;
    }

    const dragIndex = items.indexOf(dragState.dragItem);
    if (dragIndex === -1) return;
    if (dragIndex === targetIndex || (dragIndex < targetIndex && targetIndex === dragIndex + 1)) return;

    if (dragIndex < targetIndex) {
      const nextSibling = targetItem ? targetItem.nextSibling : null;
      dragState.listContainer.insertBefore(dragState.dragItem, nextSibling);
    } else {
      dragState.listContainer.insertBefore(dragState.dragItem, targetItem);
    }

    const newItems = Array.from(dragState.listContainer.children).filter(
      child => child.classList && child.classList.contains('sprite-item')
    );
    dragState.currentOrder = newItems.map(li => li._target);
  }

  async function endDrag() {
    if (!dragState.active) return;
    dragState.active = false;
    stopAutoScroll();
    if (dragState.dragItem) {
      dragState.dragItem.classList.remove('dragging');
      dragState.dragItem.style.opacity = '';
    }
    if (dragState.listContainer) {
      dragState.listContainer.style.touchAction = '';
    }
    if (dragState.runtime && dragState.currentOrder.length) {
      await applyLayerOrder(dragState.runtime, dragState.currentOrder);
    }
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerEnd);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('touchend', onPointerEnd);
    document.removeEventListener('touchcancel', onPointerEnd);
    dragState.dragItem = null;
    dragState.listContainer = null;
    dragState.currentOrder = [];
  }

  function onPointerMove(e) {
    if (!dragState.active) return;
    let clientY;
    if (e.touches) {
      e.preventDefault();
      clientY = e.touches[0].clientY;
    } else {
      clientY = e.clientY;
    }
    dragState.currentY = clientY;
    if (dragState.listContainer) {
      const rect = dragState.listContainer.getBoundingClientRect();
      const scrollZone = 40;
      if (clientY < rect.top + scrollZone) startAutoScroll('up');
      else if (clientY > rect.bottom - scrollZone) startAutoScroll('down');
      else stopAutoScroll();
    }
    updateDragInsertPosition(clientY);
  }

  function onPointerEnd() {
    endDrag();
  }

  function initDrag(event, li, runtime, listContainer) {
    let startClientY;
    if (event.touches) {
      if (event.touches.length !== 1) return;
      startClientY = event.touches[0].clientY;
      event.preventDefault();
      event.stopPropagation();
    } else {
      if (event.button !== 0) return;
      startClientY = event.clientY;
      event.preventDefault();
    }
    if (dragState.active) return;

    dragState.active = true;
    dragState.startY = startClientY;
    dragState.currentY = startClientY;
    dragState.dragItem = li;
    dragState.listContainer = listContainer;
    dragState.runtime = runtime;
    dragState.dragItem.classList.add('dragging');
    dragState.dragItem.style.opacity = '0.4';
    const items = Array.from(listContainer.children).filter(
      c => c.classList && c.classList.contains('sprite-item')
    );
    dragState.currentOrder = items.map(i => i._target);
    listContainer.style.touchAction = 'none';
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerEnd);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerEnd);
    document.addEventListener('touchcancel', onPointerEnd);
  }

  // ---------- 面板渲染 ----------
  function refreshPanelList(runtime) {
    if (!runtime || !panelDiv) return;
    const listContainer = panelDiv.querySelector('.sprite-list');
    if (!listContainer) return;
    const orderedSprites = getSpritesInZOrder(runtime);
    listContainer.innerHTML = '';
    for (const sprite of orderedSprites) {
      const li = document.createElement('li');
      li.className = 'sprite-item';
      li.setAttribute('data-target-id', sprite.id);
      li._target = sprite;
      li.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <div class="sprite-color" style="background: hsl(${(sprite.id.charCodeAt(0) % 360)}, 70%, 65%);"></div>
        <span class="sprite-name">${escapeHtml(sprite.getName() || '未命名')}</span>
      `;
      const handle = li.querySelector('.drag-handle');
      handle.addEventListener('mousedown', (e) => initDrag(e, li, runtime, listContainer));
      handle.addEventListener('touchstart', (e) => initDrag(e, li, runtime, listContainer), { passive: false });
      listContainer.appendChild(li);
    }
    if (orderedSprites.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = '✨ 暂时没有角色 ✨';
      listContainer.appendChild(empty);
    }
  }

  function createPanel(runtime) {
    if (panelDiv && document.body.contains(panelDiv)) {
      document.body.removeChild(panelDiv);
    }
    currentRuntime = runtime;
    panelDiv = document.createElement('div');
    panelDiv.className = 'tw-layer-manager';
    panelDiv.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">📌 图层管理器</span>
        <button class="close-btn" type="button">✕</button>
      </div>
      <div class="panel-toolbar">
        <button class="refresh-btn" type="button">⟳ 刷新</button>
        <span class="hint">拖拽左侧把手调整顺序</span>
      </div>
      <ul class="sprite-list"></ul>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .tw-layer-manager {
        position: fixed;
        top: 80px;
        right: 20px;
        width: 280px;
        background: rgba(30, 30, 40, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 20px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        user-select: none;
        -webkit-user-select: none;
        transition: box-shadow 0.2s;
      }
      .tw-layer-manager:hover {
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2);
      }
      .panel-header {
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 20px 20px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        font-weight: 600;
        color: white;
        letter-spacing: 0.5px;
      }
      .panel-title { font-size: 15px; }
      .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0 6px;
        border-radius: 40px;
        transition: all 0.2s;
        line-height: 1;
      }
      .close-btn:hover { background: rgba(255, 80, 80, 0.8); transform: scale(1.1); }
      .panel-toolbar {
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .refresh-btn {
        background: rgba(76, 151, 255, 0.9);
        border: none;
        border-radius: 40px;
        padding: 5px 12px;
        color: white;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .refresh-btn:hover { background: rgba(76, 151, 255, 1); transform: scale(1.02); }
      .refresh-btn:active { transform: scale(0.98); }
      .hint { font-size: 11px; color: rgba(255, 255, 255, 0.7); }
      .sprite-list {
        list-style: none;
        margin: 0;
        padding: 8px;
        max-height: 360px;
        overflow-y: auto;
        color: white;
        -webkit-overflow-scrolling: touch;
      }
      .sprite-list::-webkit-scrollbar { width: 6px; }
      .sprite-list::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); border-radius: 10px; }
      .sprite-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.4); border-radius: 10px; }
      .sprite-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        cursor: default;
        transition: background 0.2s, transform 0.1s;
        border: 1px solid transparent;
        touch-action: pan-y;
      }
      .sprite-item:hover { background: rgba(255, 255, 255, 0.2); transform: translateX(2px); }
      .sprite-item.dragging { opacity: 0.4; cursor: grabbing; }
      .drag-handle {
        font-size: 18px;
        color: rgba(255, 255, 255, 0.6);
        cursor: grab;
        width: 20px;
        text-align: center;
        line-height: 1;
        transition: color 0.2s;
        touch-action: none;
      }
      .drag-handle:hover { color: white; }
      .sprite-color {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
      }
      .sprite-name {
        flex: 1;
        font-weight: 500;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .empty-msg {
        text-align: center;
        padding: 28px 16px;
        color: rgba(255, 255, 255, 0.6);
        font-style: italic;
      }
    `;
    panelDiv.appendChild(style);
    document.body.appendChild(panelDiv);

    const header = panelDiv.querySelector('.panel-header');
    const closeBtn = panelDiv.querySelector('.close-btn');
    const refreshBtn = panelDiv.querySelector('.refresh-btn');
    const listContainer = panelDiv.querySelector('.sprite-list');

    closeBtn.addEventListener('click', () => {
      if (panelDiv && panelDiv.parentNode) panelDiv.parentNode.removeChild(panelDiv);
      panelDiv = null;
      if (dragState.active) endDrag();
    });
    refreshBtn.addEventListener('click', () => refreshPanelList(currentRuntime));
    refreshPanelList(runtime);

    // 面板拖拽（鼠标 + 触摸）
    let panelDragActive = false;
    let startX, startY, startLeft, startTop;
    const onPanelMove = (e) => {
      if (!panelDragActive) return;
      let clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        e.preventDefault();
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      let left = startLeft + (clientX - startX);
      let top = startTop + (clientY - startY);
      left = Math.min(window.innerWidth - 60, Math.max(0, left));
      top = Math.min(window.innerHeight - 100, Math.max(0, top));
      panelDiv.style.left = left + 'px';
      panelDiv.style.top = top + 'px';
      panelDiv.style.right = 'auto';
    };
    const onPanelEnd = () => {
      panelDragActive = false;
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onPanelMove);
      document.removeEventListener('mouseup', onPanelEnd);
      document.removeEventListener('touchmove', onPanelMove);
      document.removeEventListener('touchend', onPanelEnd);
    };
    const startPanelDrag = (e) => {
      if (e.target === closeBtn || e.target.classList?.contains('drag-handle')) return;
      panelDragActive = true;
      let clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        e.preventDefault();
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      startX = clientX;
      startY = clientY;
      const rect = panelDiv.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onPanelMove);
      document.addEventListener('mouseup', onPanelEnd);
      document.addEventListener('touchmove', onPanelMove, { passive: false });
      document.addEventListener('touchend', onPanelEnd);
    };
    header.addEventListener('mousedown', startPanelDrag);
    header.addEventListener('touchstart', startPanelDrag, { passive: false });
  }

  // ---------- 扩展注册 ----------
  class LayerManagerExtension {
    getInfo() {
      return {
        id: extensionId,
        name: '图层管理器',
        color1: '#4c97ff',
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
  Scratch.extensions.register(new LayerManagerExtension());
})(Scratch);