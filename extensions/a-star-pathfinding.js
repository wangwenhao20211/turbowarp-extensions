// Name: A* 寻路
// ID: astarpath
// By: wangwenhao20211
// License: MIT
// Description: 高性能 A* 网格寻路、视线检测与随机坐标生成
// Version: 2.1.1

(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('此扩展必须以非沙箱模式运行');
    }

    // ============ 最小堆 ============
    class MinHeap {
        constructor() { this.items = []; }
        get size() { return this.items.length; }
        push(item) {
            const items = this.items;
            items.push(item);
            const f = item.f;
            let i = items.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                const parent = items[p];
                if (parent.f <= f) break;
                items[i] = parent;
                i = p;
            }
            items[i] = item;
        }
        pop() {
            const items = this.items;
            if (items.length === 0) return undefined;
            const top = items[0];
            const last = items.pop();
            if (items.length > 0) {
                items[0] = last;
                let i = 0;
                const n = items.length;
                while (true) {
                    const l = 2 * i + 1;
                    const r = 2 * i + 2;
                    let smallest = i;
                    if (l < n && items[l].f < items[smallest].f) smallest = l;
                    if (r < n && items[r].f < items[smallest].f) smallest = r;
                    if (smallest === i) break;
                    const tmp = items[i];
                    items[i] = items[smallest];
                    items[smallest] = tmp;
                    i = smallest;
                }
            }
            return top;
        }
    }

    // ============ 全局缓存（LRU） ============
    const _gridCache = new Map();
    const MAX_CACHE = 32;

    // ============ 主扩展 ============
    class AStarExtension {
        getInfo() {
            return {
                id: 'astarpath',
                name: 'A* 寻路',
                color1: '#7B68EE',
                color2: '#5A48D8',
                color3: '#A296F5',
                blocks: [
                    {
                        opcode: 'findPath',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '从起点 [STARTX] [STARTY] 到终点 [ENDX] [ENDY] 在网格 [MAP] 中寻路（宽 [WIDTH] 高 [HEIGHT] 障碍物值 [WALL]）',
                        arguments: {
                            STARTX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            STARTY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            ENDX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 4 },
                            ENDY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
                            MAP: { type: Scratch.ArgumentType.STRING, defaultValue: "0,0,0,0,0,0,1,1,1,0,0,0,0,0,0" },
                            WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
                            HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
                            WALL: { type: Scratch.ArgumentType.STRING, defaultValue: "1" }
                        }
                    },
                    {
                        opcode: 'canSee',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '在网格 [MAP]（宽 [WIDTH] 高 [HEIGHT] 障碍物值 [WALL]）中 位置 ([X1] [Y1]) 能否看到 ([X2] [Y2]) ?',
                        arguments: {
                            MAP: { type: Scratch.ArgumentType.STRING, defaultValue: "0,0,0,0,0,0,1,1,1,0,0,0,0,0,0" },
                            WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
                            HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
                            WALL: { type: Scratch.ArgumentType.STRING, defaultValue: "1" },
                            X1: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y1: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            X2: { type: Scratch.ArgumentType.NUMBER, defaultValue: 4 },
                            Y2: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 }
                        }
                    },
                    {
                        opcode: 'randomFreeCoord',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '在网格 [MAP]（宽 [WIDTH] 高 [HEIGHT] 障碍物值 [WALL]）中随机一个非障碍物坐标',
                        arguments: {
                            MAP: { type: Scratch.ArgumentType.STRING, defaultValue: "0,0,0,0,0,0,1,1,1,0,0,0,0,0,0" },
                            WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
                            HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
                            WALL: { type: Scratch.ArgumentType.STRING, defaultValue: "1" }
                        }
                    }
                ]
            };
        }

        // ---------- 输入解析 ----------
        _parseIntSafe(v) {
            const n = Number(v);
            return Number.isInteger(n) ? n : null;
        }

        _parseWallArray(wallInput) {
            if (wallInput == null) return [];
            const raw = String(wallInput).trim();
            if (raw === '') return [];
            let str = raw;
            if (str.startsWith('[') && str.endsWith(']')) str = str.slice(1, -1);
            const set = new Set();
            for (const p of str.split(',')) {
                const n = Number(p.trim());
                if (Number.isFinite(n)) set.add(n);
            }
            return Array.from(set);
        }

        // ---------- 网格缓存（LRU） ----------
        _getGrid(mapStr, width, height, wallArray) {
            if (mapStr == null) return null;
            const mapText = String(mapStr);
            const key = mapText + '\u0001' + width + '\u0001' + height + '\u0001' + wallArray.join(',');

            const cached = _gridCache.get(key);
            if (cached) {
                // 命中后移动到末尾（最近使用）
                _gridCache.delete(key);
                _gridCache.set(key, cached);
                return cached;
            }

            const cleaned = mapText.replace(/\s/g, '');
            if (cleaned === '') return null;
            const values = cleaned.split(',');
            if (values.length !== width * height) return null;

            const total = width * height;
            const walkable = new Uint8Array(total);
            const wallSet = new Set(wallArray);

            for (let i = 0; i < total; i++) {
                const n = Number(values[i]);
                if (!Number.isFinite(n)) return null;
                walkable[i] = wallSet.has(n) ? 0 : 1;
            }

            const grid = { walkable, width, height };

            // LRU 淘汰：只删最旧一个，不清空整个缓存
            if (_gridCache.size >= MAX_CACHE) {
                const oldestKey = _gridCache.keys().next().value;
                _gridCache.delete(oldestKey);
            }
            _gridCache.set(key, grid);
            return grid;
        }

        // ---------- A* 核心 ----------
        _findPathArray(args) {
            let { STARTX, STARTY, ENDX, ENDY, WIDTH, HEIGHT, WALL, MAP } = args;
            STARTX = this._parseIntSafe(STARTX);
            STARTY = this._parseIntSafe(STARTY);
            ENDX   = this._parseIntSafe(ENDX);
            ENDY   = this._parseIntSafe(ENDY);
            WIDTH  = this._parseIntSafe(WIDTH);
            HEIGHT = this._parseIntSafe(HEIGHT);

            if (STARTX === null || STARTY === null || ENDX === null || ENDY === null ||
                WIDTH === null || HEIGHT === null) return null;
            if (WIDTH <= 0 || HEIGHT <= 0) return null;
            if (STARTX < 0 || STARTX >= WIDTH || STARTY < 0 || STARTY >= HEIGHT) return null;
            if (ENDX   < 0 || ENDX   >= WIDTH || ENDY   < 0 || ENDY   >= HEIGHT) return null;

            const wallArray = this._parseWallArray(WALL);
            const grid = this._getGrid(MAP, WIDTH, HEIGHT, wallArray);
            if (!grid) return null;

            const { walkable } = grid;
            const startIdx = STARTY * WIDTH + STARTX;
            const endIdx   = ENDY   * WIDTH + ENDX;

            if (!walkable[startIdx] || !walkable[endIdx]) return null;
            if (startIdx === endIdx) return [`${STARTX},${STARTY}`];

            const N = WIDTH * HEIGHT;
            const gScore = new Float64Array(N).fill(Infinity);
            const parent = new Int32Array(N).fill(-1);
            const closed = new Uint8Array(N);

            gScore[startIdx] = 0;
            const heap = new MinHeap();
            heap.push({
                idx: startIdx,
                f: Math.abs(STARTX - ENDX) + Math.abs(STARTY - ENDY)
            });

            const dirX = [0, 0, -1, 1];
            const dirY = [-1, 1, 0, 0];

            while (heap.size > 0) {
                const cur = heap.pop();
                const idx = cur.idx;

                if (closed[idx]) continue;
                closed[idx] = 1;

                if (idx === endIdx) {
                    const path = [];
                    let node = idx;
                    while (node !== -1) {
                        const x = node % WIDTH;
                        const y = (node - x) / WIDTH;
                        path.push(`${x},${y}`);
                        node = parent[node];
                    }
                    path.reverse();
                    return path;
                }

                const cx = idx % WIDTH;
                const cy = (idx - cx) / WIDTH;
                const curG = gScore[idx];

                for (let d = 0; d < 4; d++) {
                    const nx = cx + dirX[d];
                    const ny = cy + dirY[d];
                    if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
                    const nIdx = ny * WIDTH + nx;
                    if (!walkable[nIdx] || closed[nIdx]) continue;

                    const tentativeG = curG + 1;
                    if (tentativeG < gScore[nIdx]) {
                        gScore[nIdx] = tentativeG;
                        parent[nIdx] = idx;
                        const h = Math.abs(nx - ENDX) + Math.abs(ny - ENDY);
                        heap.push({ idx: nIdx, f: tentativeG + h });
                    }
                }
            }
            return null;
        }

        // ---------- 积木：寻路 ----------
        findPath(args) {
            const path = this._findPathArray(args);
            // 统一返回类型：始终是 JSON 字符串（数组）
            if (!path) return '[]';
            return JSON.stringify(path);
        }

        // ---------- 积木：视线检测（Bresenham） ----------
        canSee(args) {
            const { MAP, WIDTH, HEIGHT, WALL, X1, Y1, X2, Y2 } = args;
            const x1 = this._parseIntSafe(X1);
            const y1 = this._parseIntSafe(Y1);
            const x2 = this._parseIntSafe(X2);
            const y2 = this._parseIntSafe(Y2);
            const width  = this._parseIntSafe(WIDTH);
            const height = this._parseIntSafe(HEIGHT);

            if (x1 === null || y1 === null || x2 === null || y2 === null ||
                width === null || height === null) return false;
            if (width <= 0 || height <= 0) return false;
            if (x1 < 0 || x1 >= width  || y1 < 0 || y1 >= height) return false;
            if (x2 < 0 || x2 >= width  || y2 < 0 || y2 >= height) return false;

            const wallArray = this._parseWallArray(WALL);
            const grid = this._getGrid(MAP, width, height, wallArray);
            if (!grid) return false;
            const { walkable } = grid;

            // 起点或终点本身不可走则视线为假
            if (!walkable[y1 * width + x1]) return false;
            if (!walkable[y2 * width + x2]) return false;
            if (x1 === x2 && y1 === y2) return true;

            // Bresenham（不含起点、含终点检查）
            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            const sx = x1 < x2 ? 1 : -1;
            const sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;
            let x = x1, y = y1;

            while (true) {
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x += sx; }
                if (e2 <  dx) { err += dx; y += sy; }

                if (!walkable[y * width + x]) return false;
                if (x === x2 && y === y2) break;
            }
            return true;
        }

        // ---------- 积木：随机非障碍物坐标 ----------
        randomFreeCoord(args) {
            const { MAP, WIDTH, HEIGHT, WALL } = args;
            const width  = this._parseIntSafe(WIDTH);
            const height = this._parseIntSafe(HEIGHT);
            if (width === null || height === null || width <= 0 || height <= 0) {
                return 'Error: 宽高无效';
            }
            const wallArray = this._parseWallArray(WALL);
            const grid = this._getGrid(MAP, width, height, wallArray);
            if (!grid) return 'Error: 地图解析失败';

            const { walkable } = grid;
            const total = width * height;

            // 水库采样：一次遍历，无数组分配
            let count = 0;
            let chosen = -1;
            for (let i = 0; i < total; i++) {
                if (walkable[i]) {
                    count++;
                    if (Math.random() < 1 / count) chosen = i;
                }
            }
            if (chosen === -1) return 'Error: 无可行走格子';

            const x = chosen % width;
            const y = (chosen - x) / width;
            return `${x},${y}`;
        }
    }

    Scratch.extensions.register(new AStarExtension());
})(Scratch);