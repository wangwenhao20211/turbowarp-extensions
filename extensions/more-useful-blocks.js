// Name: 更多实用积木
// ID: moreUsefulBlocks
// Description: 提供更多实用的积木，包括克隆，移动等
// By: yizhiMC
// License: MIT

(function(Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('此扩展必须以非沙箱模式运行');
    }

    const runtime = Scratch.vm.runtime;
    const Cast = Scratch.Cast;
    const EXTENSION_ID = 'moreUsefulBlocks';
    const ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSIjQzc3REZGIi8+PC9zdmc+';

    class MoreUsefulBlocks {
        constructor() {
            this.spriteNames = [];
            this.updateSpriteList();
            this._cloneDataMap = new WeakMap();
        }

        get TEAM_VAR_NAME() { return '__ext_team_id'; }

        getInfo() {
            this.updateSpriteList();
            return {
                id: EXTENSION_ID,
                name: '更多实用积木',
                color1: '#C77DFF',
                color2: '#B056E0',
                color3: '#9A3CC7',
                menuIconURI: ICON,
                blocks: [
                    { opcode: 'repeatUntil', blockType: Scratch.BlockType.LOOP,
                      text: '重复执行 [TIMES] 次或直到 [COND]',
                      arguments: { TIMES: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
                                   COND: { type: Scratch.ArgumentType.BOOLEAN } } },
                    { opcode: 'restartProject', blockType: Scratch.BlockType.COMMAND, text: '重新运行作品' },
                    '---',
                    { opcode: 'setTeam', blockType: Scratch.BlockType.COMMAND,
                      text: '将角色队伍设为 [TEAM] 队',
                      arguments: { TEAM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
                    { opcode: 'getTeam', blockType: Scratch.BlockType.REPORTER, text: '当前角色队伍编号' },
                    { opcode: 'isTouchTeam', blockType: Scratch.BlockType.BOOLEAN,
                      text: '碰到 [TEAM] 队',
                      arguments: { TEAM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 } } },
                    '---',
                    { opcode: 'addVarToTouchingClone', blockType: Scratch.BlockType.COMMAND,
                      text: '把碰到 [SPR] 克隆体的私有变量 [VAR] 增加 [VAL]',
                      arguments: { SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                                   VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' },
                                   VAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
                    '---',
                    { opcode: 'createCloneAt', blockType: Scratch.BlockType.COMMAND,
                      text: '克隆 [SPRITE] 在 x [X] y [Y]',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'cloneSpriteMenu' },
                                   X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                                   Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 } } },
                    { opcode: 'createCloneWithData', blockType: Scratch.BlockType.COMMAND,
                      text: '克隆 [SPRITE] 在 x [X] y [Y] 数据为 [DATA]',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'cloneSpriteMenu' },
                                   X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                                   Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                                   DATA: { type: Scratch.ArgumentType.STRING, defaultValue: 'hello' } } },
                    { opcode: 'createCloneWithDataOnly', blockType: Scratch.BlockType.COMMAND,
                      text: '克隆 [SPRITE] 数据为 [DATA]',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'cloneSpriteMenu' },
                                   DATA: { type: Scratch.ArgumentType.STRING, defaultValue: 'hello' } } },
                    { opcode: 'getMyCloneData', blockType: Scratch.BlockType.REPORTER, text: '本克隆体的数据' },
                    '---',
                    { opcode: 'splitText', blockType: Scratch.BlockType.REPORTER,
                      text: '把 [TEXT] 按 [SEP] 分割的第 [IDX] 项',
                      arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'a,b,c' },
                                   SEP: { type: Scratch.ArgumentType.STRING, defaultValue: ',' },
                                   IDX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
                    '---',
                    { opcode: 'listStat', blockType: Scratch.BlockType.REPORTER,
                      text: '列表 [LIST] 的 [STAT]',
                      arguments: { LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                                   STAT: { type: Scratch.ArgumentType.STRING, menu: 'stats', defaultValue: '最小值' } } },
                    { opcode: 'listTopN', blockType: Scratch.BlockType.REPORTER,
                      text: '列表 [LIST] [ORDER] 的 [N] 个值的位置',
                      arguments: { LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                                   ORDER: { type: Scratch.ArgumentType.STRING, menu: 'orders', defaultValue: '最大' },
                                   N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 } } },
                    { opcode: 'findInList', blockType: Scratch.BlockType.REPORTER,
                      text: '列表 [LIST] 中 [COMPARE] [VAL] 的项的位置',
                      arguments: { LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                                   COMPARE: { type: Scratch.ArgumentType.STRING, menu: 'compares', defaultValue: '大于' },
                                   VAL: { type: Scratch.ArgumentType.STRING, defaultValue: '50' } } },
                    '---',
                    { opcode: 'isTouching', blockType: Scratch.BlockType.BOOLEAN,
                      text: '[SPRITE] 碰到 [TARGET]',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'spriteMenu' },
                                   TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: '鼠标指针', menu: 'touchTargetMenu' } } },
                    { opcode: 'isTouchingMouseNoCover', blockType: Scratch.BlockType.BOOLEAN, text: '碰到鼠标指针且上层没有遮挡' },
                    '---',
                    { opcode: 'touchCloneVar', blockType: Scratch.BlockType.BOOLEAN,
                      text: '碰到 [SPR] 的 [VAR] [OP] [VAL] 的克隆体',
                      arguments: { SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                                   VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' },
                                   OP: { type: Scratch.ArgumentType.STRING, menu: 'ops', defaultValue: '等于' },
                                   VAL: { type: Scratch.ArgumentType.STRING, defaultValue: '10' } } },
                    { opcode: 'getTouchCloneVar', blockType: Scratch.BlockType.REPORTER,
                      text: '获取碰到 [SPR] 克隆体的 [VAR]',
                      arguments: { SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                                   VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' } } },
                    '---',
                    { opcode: 'moveDir', blockType: Scratch.BlockType.COMMAND,
                      text: '向 [DIR] 方向移动 [STEP] 步',
                      arguments: { DIR: { type: Scratch.ArgumentType.ANGLE, defaultValue: 90 },
                                   STEP: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } } },
                    { opcode: 'circleMotion', blockType: Scratch.BlockType.COMMAND,
                      text: '以圆心 x [CX] y [CY] 半径 [R] [MODE] [ANGLE] 度',
                      arguments: { CX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                                   CY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                                   R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                                   MODE: { type: Scratch.ArgumentType.STRING, menu: 'circleMode', defaultValue: 'cw' },
                                   ANGLE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 90 } } },
                    '---',
                    { opcode: 'roundToDecimal', blockType: Scratch.BlockType.REPORTER,
                      text: '将 [NUM] 四舍五入到小数点后第 [DECIMAL] 位',
                      arguments: { NUM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3.14159 },
                                   DECIMAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 } } },
                    '---',
                    { opcode: 'pointTowardsNearestClone', blockType: Scratch.BlockType.COMMAND,
                      text: '面向离 [SPRITE] 最近的 [TARGET] 的克隆体',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'spriteMenu' },
                                   TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: '没有角色', menu: 'targetMenu' } } },
                    { opcode: 'getNearestCloneInfo', blockType: Scratch.BlockType.REPORTER,
                      text: '离 [SPRITE] 最近的 [TARGET] 克隆体的 [PROPERTY]',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'spriteMenu' },
                                   TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: '没有角色', menu: 'targetMenu' },
                                   PROPERTY: { type: Scratch.ArgumentType.STRING, defaultValue: 'x坐标', menu: 'propertyMenu' } } },
                    { opcode: 'getDistanceToNearestClone', blockType: Scratch.BlockType.REPORTER,
                      text: '到离 [SPRITE] 最近的 [TARGET] 克隆体的距离',
                      arguments: { SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: '本角色', menu: 'spriteMenu' },
                                   TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: '没有角色', menu: 'targetMenu' } } }
                ],
                menus: {
                    lists: { acceptReporters: true, items: '_getListNames' },
                    sprites: { acceptReporters: false, items: '_getSpriteNames' },
                    vars: { acceptReporters: true, items: '_getAllVarWithTeam' },
                    ops: { acceptReporters: false, items: ['大于', '小于', '等于', '不等于', '大于等于', '小于等于'] },
                    stats: { acceptReporters: false, items: ['最小值', '最大值', '平均值', '总和', '项数'] },
                    orders: { acceptReporters: false, items: ['最大', '最小'] },
                    compares: { acceptReporters: false, items: ['大于', '小于', '等于', '大于等于', '小于等于', '不等于'] },
                    circleMode: { acceptReporters: false, items: [
                        { text: '右旋转', value: 'cw' },
                        { text: '左旋转', value: 'ccw' },
                        { text: '到角度', value: 'to' } ] },
                    spriteMenu: { acceptReporters: true, items: 'getSpriteMenuItems' },
                    cloneSpriteMenu: { acceptReporters: true, items: 'getCloneSpriteMenuItems' },
                    targetMenu: { acceptReporters: true, items: 'getTargetMenuItems' },
                    propertyMenu: { acceptReporters: false,
                        items: ['x坐标', 'y坐标', '面向角度', '距离', '造型编号', '大小', '队伍编号', '克隆数据'] },
                    touchTargetMenu: { acceptReporters: true, items: 'getTouchTargetItems' }
                }
            };
        }

        // ===================== 工具方法 =====================

        /** 把 SPRITE 参数解析成 target（本角色 / 名字） */
        _resolveTarget(spriteArg, util) {
            if (!spriteArg || spriteArg === '本角色') return util.target;
            const name = Cast.toString(spriteArg);
            return this._getSpriteByName(name) ||
                   (runtime.getSpriteTargetByName ? runtime.getSpriteTargetByName(name) : null);
        }

        /** 判断两个 target 是否真的在像素级碰撞（能区分不同克隆体） */
        _isTouchingTarget(a, b) {
            if (!a || !b || a === b) return false;
            if (!runtime.renderer) return false;
            // 首选：renderer 提供的精确接口
            if (typeof runtime.renderer.isTouchingDrawables === 'function') {
                try {
                    return runtime.renderer.isTouchingDrawables(a.drawableID, b.drawableID);
                } catch (e) { /* fallthrough */ }
            }
            // 回退：AABB 相交
            try {
                const dA = runtime.renderer._allDrawables[a.drawableID];
                const dB = runtime.renderer._allDrawables[b.drawableID];
                if (!dA || !dB) return false;
                const bA = dA.getAABB();
                const bB = dB.getAABB();
                if (!bA || !bB) return false;
                return !(bA.right < bB.left || bA.left > bB.right ||
                         bA.bottom < bB.top || bA.top > bB.bottom);
            } catch (e) {
                return false;
            }
        }

        /** 统一克隆创建（返回新克隆体 target，失败返回 null） */
        _createCloneOf(target) {
            if (!target || target.isStage) return null;
            let newClone = null;
            try {
                if (typeof target.makeClone === 'function') {
                    newClone = target.makeClone();
                } else if (target.sprite && typeof target.sprite.createClone === 'function') {
                    newClone = target.sprite.createClone(target);
                }
            } catch (e) {
                console.error('克隆创建失败:', e);
                return null;
            }
            if (!newClone) return null;
            // 触发 TARGET_CREATED，让 "当作为克隆体启动时" 生效
            try {
                if (typeof runtime.fireTargetWasCreated === 'function') {
                    runtime.fireTargetWasCreated(newClone, target);
                }
            } catch (e) {
                console.warn('fireTargetWasCreated 失败:', e);
            }
            return newClone;
        }

        // ===================== 队伍系统 =====================

        _getTargetTeam(target) {
            if (!target || !target.variables) return 0;
            const v = target.variables[this.TEAM_VAR_NAME];
            return v ? Cast.toNumber(v.value) : 0;
        }

        _setTargetTeam(target, teamNum) {
            if (!target || !target.variables) return;
            const num = Cast.toNumber(teamNum);
            if (!target.variables[this.TEAM_VAR_NAME]) {
                target.variables[this.TEAM_VAR_NAME] = {
                    name: this.TEAM_VAR_NAME,   // 加上 name，便于统一处理
                    value: 0,
                    type: '',
                    isCloud: false
                };
            }
            target.variables[this.TEAM_VAR_NAME].value = num;
        }

        _isTouchingTeam(util, wantTeam) {
            const self = util.target;
            const team = Cast.toNumber(wantTeam);
            if (team === 0) return false;
            for (const target of runtime.targets) {
                if (target === self || target.isStage) continue;
                if (this._getTargetTeam(target) !== team) continue;
                if (self.isTouchingSprite && self.isTouchingSprite(target.sprite.name)) {
                    return true;
                }
            }
            return false;
        }

        // ===================== 重新运行作品 =====================

        restartProject() {
            try {
                const vm = Scratch.vm;
                if (vm && typeof vm.greenFlag === 'function') {
                    vm.greenFlag();
                    return;
                }
                if (runtime) {
                    if (typeof runtime.stopAll === 'function') runtime.stopAll();
                    if (typeof runtime.greenFlag === 'function') runtime.greenFlag();
                }
            } catch (e) {
                console.warn('重新运行作品失败:', e);
            }
        }

        // ===================== 克隆数据 =====================

        _setCloneData(cloneTarget, data) {
            if (!cloneTarget || cloneTarget.isStage) return;
            this._cloneDataMap.set(cloneTarget, Cast.toString(data));
        }

        _getCloneData(cloneTarget) {
            if (!cloneTarget || cloneTarget.isStage) return '';
            return this._cloneDataMap.has(cloneTarget) ? this._cloneDataMap.get(cloneTarget) : '';
        }

        getMyCloneData(args, util) {
            return this._getCloneData(util.target);
        }

        createCloneWithData(args, util) {
            const target = this._resolveTarget(args.SPRITE, util);
            if (!target || target.isStage) return;

            const x = Cast.toNumber(args.X);
            const y = Cast.toNumber(args.Y);
            const data = Cast.toString(args.DATA);

            const newClone = this._createCloneOf(target);
            if (!newClone) return;

            // 顺序：先定位 / 传数据 / 传队伍，再让克隆体自然执行自己的脚本
            try { newClone.setXY(x, y); } catch (e) { /* ignore */ }
            this._setTargetTeam(newClone, this._getTargetTeam(target));
            this._setCloneData(newClone, data);

            // 一些 VM 版本会在下一 tick 重置位置，补一次
            setTimeout(() => {
                if (newClone && !newClone.isDisposed) {
                    try { newClone.setXY(x, y); } catch (e) { /* ignore */ }
                }
            }, 0);
        }

        createCloneWithDataOnly(args, util) {
            const target = this._resolveTarget(args.SPRITE, util);
            if (!target || target.isStage) return;

            const data = Cast.toString(args.DATA);
            const newClone = this._createCloneOf(target);
            if (!newClone) return;

            this._setTargetTeam(newClone, this._getTargetTeam(target));
            this._setCloneData(newClone, data);
        }

        createCloneAt(args, util) {
            const target = this._resolveTarget(args.SPRITE, util);
            if (!target || target.isStage) return;

            const x = Cast.toNumber(args.X);
            const y = Cast.toNumber(args.Y);

            const newClone = this._createCloneOf(target);
            if (!newClone) return;

            try { newClone.setXY(x, y); } catch (e) { /* ignore */ }
            this._setTargetTeam(newClone, this._getTargetTeam(target));

            setTimeout(() => {
                if (newClone && !newClone.isDisposed) {
                    try { newClone.setXY(x, y); } catch (e) { /* ignore */ }
                }
            }, 0);
        }

        // ===================== 遮挡检测 =====================

        isTouchingMouseNoCover(args, util) {
            try {
                const self = util.target;
                if (!self || self.isStage) return false;
                if (!runtime.ioDevices || !runtime.ioDevices.mouse) return false;

                const mouse = runtime.ioDevices.mouse;
                const clientX = mouse.getClientX();
                const clientY = mouse.getClientY();
                if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

                // 1. 自己是否碰到鼠标
                if (typeof self.isTouchingPoint !== 'function') return false;
                if (!self.isTouchingPoint(clientX, clientY)) return false;

                // 2. 谁在鼠标位置的最上层
                if (runtime.renderer && typeof runtime.renderer.pick === 'function') {
                    const topID = runtime.renderer.pick(clientX, clientY);
                    if (topID === self.drawableID) return true;

                    for (const t of runtime.targets) {
                        if (t.drawableID === topID) {
                            return t.isStage || t === self;
                        }
                    }
                    // 没找到对应 target，认为是最上层可见者
                    return true;
                }
                return true;
            } catch (e) {
                console.warn('遮挡检测出错:', e);
                return false;
            }
        }

        // ===================== 变量存取 =====================

        _getVar(target, name) {
            if (name === '队伍编号') return this._getTargetTeam(target);
            if (name === '克隆数据') return this._getCloneData(target);
            if (!target || !target.variables) return null;
            const v = Object.values(target.variables).find(x => x && x.name === name && x.type !== 'list');
            return v ? v.value : null;
        }

        _setVar(target, name, value) {
            if (name === '队伍编号') { this._setTargetTeam(target, value); return true; }
            if (!target || !target.variables) return false;
            const v = Object.values(target.variables).find(x => x && x.name === name && x.type !== 'list');
            if (v) { v.value = value; return true; }
            return false;
        }

        // ===================== 精准修改碰到克隆体的变量 =====================

        addVarToTouchingClone(args, util) {
            const self = util.target;
            const spriteName = Cast.toString(args.SPR);
            const varName = Cast.toString(args.VAR);
            const addVal = Cast.toNumber(args.VAL);

            if (spriteName === '（无角色）' || varName === '（无变量）') return;

            for (const clone of this._getClones(spriteName)) {
                if (!this._isTouchingTarget(self, clone)) continue;
                const oldValue = Cast.toNumber(this._getVar(clone, varName));
                this._setVar(clone, varName, oldValue + addVal);
                break; // 只改第一个碰到的
            }
        }

        // ===================== 队伍积木 =====================

        setTeam(args, util) { this._setTargetTeam(util.target, args.TEAM); }
        getTeam(args, util) { return this._getTargetTeam(util.target); }
        isTouchTeam(args, util) { return this._isTouchingTeam(util, args.TEAM); }

        _getAllVarWithTeam() {
            const base = this._getPrivateVarNames();
            base.unshift('队伍编号');
            return base;
        }

        // ===================== 菜单数据 =====================

        _getAllSpriteNames() {
            const names = [];
            runtime.targets.forEach(t => {
                if (!t.isStage && t.sprite && t.sprite.name && !names.includes(t.sprite.name)) {
                    names.push(t.sprite.name);
                }
            });
            return names;
        }

        getSpriteMenuItems() {
            const names = ['本角色'];
            this._getAllSpriteNames().forEach(n => { if (!names.includes(n)) names.push(n); });
            return names;
        }

        getCloneSpriteMenuItems() {
            const names = this._getAllSpriteNames();
            return names.length > 0 ? names : ['（无角色）'];
        }

        getTargetMenuItems() {
            const names = ['没有角色'];
            this._getAllSpriteNames().forEach(n => { if (!names.includes(n)) names.push(n); });
            return names;
        }

        getTouchTargetItems() {
            const items = ['鼠标指针', '舞台边缘', '本角色的克隆体'];
            this._getAllSpriteNames().forEach(n => { if (!items.includes(n)) items.push(n); });
            return items;
        }

        updateSpriteList() { this.spriteNames = this._getAllSpriteNames(); }

        _isClone(target) { return !target.isStage && !!target.sprite && target.isOriginal === false; }

        _getClonesOnly(spriteName) {
            if (!spriteName || spriteName === '没有角色') return [];
            return runtime.targets.filter(t => this._isClone(t) && t.sprite.name === spriteName);
        }

        _getClones(name) { return this._getClonesOnly(name); }

        _getSpriteByName(name) {
            if (!name || name === '没有角色' || name === '本角色') return null;
            // 优先原始角色
            for (const t of runtime.targets) {
                if (!t.isStage && t.sprite && t.sprite.name === name && t.isOriginal) return t;
            }
            for (const t of runtime.targets) {
                if (!t.isStage && t.sprite && t.sprite.name === name) return t;
            }
            return null;
        }

        _getDistance(x1, y1, x2, y2) {
            return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        }

        _findNearestClone(sourceSpriteArg, targetSpriteName, util) {
            if (!targetSpriteName || targetSpriteName === '没有角色') return null;
            const source = this._resolveTarget(sourceSpriteArg, util);
            if (!source) return null;

            const clones = this._getClonesOnly(targetSpriteName);
            if (clones.length === 0) return null;

            let nearest = null;
            let minDistance = Infinity;
            for (const clone of clones) {
                if (clone === source) continue;
                const d = this._getDistance(source.x, source.y, clone.x, clone.y);
                if (d < minDistance) { minDistance = d; nearest = clone; }
            }
            return nearest ? { clone: nearest, distance: minDistance } : null;
        }

        _compare(a, op, b) {
            const n1 = Cast.toNumber(a), n2 = Cast.toNumber(b);
            const s1 = Cast.toString(a), s2 = Cast.toString(b);
            switch (op) {
                case '大于': return n1 > n2;
                case '小于': return n1 < n2;
                case '等于': return s1 === s2;
                case '不等于': return s1 !== s2;
                case '大于等于': return n1 >= n2;
                case '小于等于': return n1 <= n2;
                default: return false;
            }
        }

        _getListNames() {
            const names = [];
            const stage = runtime.getTargetForStage();
            const editing = runtime.getEditingTarget ? runtime.getEditingTarget() : null;
            if (editing && editing.variables) {
                Object.values(editing.variables).forEach(v => {
                    if (v && v.type === 'list' && v.name && !names.includes(v.name)) names.push(v.name);
                });
            }
            if (stage && stage.variables) {
                Object.values(stage.variables).forEach(v => {
                    if (v && v.type === 'list' && v.name && !names.includes(v.name)) names.push(v.name);
                });
            }
            return names.length ? names : ['（无列表）'];
        }

        _getSpriteNames() {
            const names = [];
            runtime.targets.forEach(t => {
                if (!t.isStage && t.sprite && t.sprite.name && !names.includes(t.sprite.name)) {
                    names.push(t.sprite.name);
                }
            });
            return names.length ? names : ['（无角色）'];
        }

        _getPrivateVarNames() {
            const names = [];
            const stage = runtime.getTargetForStage();
            const global = new Set();
            if (stage && stage.variables) {
                Object.values(stage.variables).forEach(v => {
                    if (v && v.name && v.type !== 'list') global.add(v.name);
                });
            }
            const self = this;
            runtime.targets.forEach(t => {
                if (t.isStage || !t.variables) return;
                Object.values(t.variables).forEach(v => {
                    if (!v || !v.name || v.isCloud || v.type === 'list') return;
                    if (v.name === self.TEAM_VAR_NAME) return; // 排除内部队伍变量
                    if (global.has(v.name)) return;
                    if (!names.includes(v.name)) names.push(v.name);
                });
            });
            return names.length ? names : ['（无变量）'];
        }

        _findList(name) {
            if (!name || name === '（无列表）') return null;
            const stage = runtime.getTargetForStage();
            const editing = runtime.getEditingTarget ? runtime.getEditingTarget() : null;
            const lookIn = (t) => {
                if (!t || !t.variables) return null;
                return Object.values(t.variables).find(v => v && v.name === name && v.type === 'list') || null;
            };
            const found = lookIn(editing) || lookIn(stage);
            if (found) return found;
            for (const t of runtime.targets) {
                const f = lookIn(t);
                if (f) return f;
            }
            return null;
        }

        _getListValues(name) {
            const list = this._findList(name);
            if (!list || list.value == null) return [];
            if (Array.isArray(list.value)) return list.value;
            if (typeof list.value === 'string') {
                try {
                    const parsed = JSON.parse(list.value);
                    return Array.isArray(parsed) ? parsed : [list.value];
                } catch (e) { return [list.value]; }
            }
            return [];
        }

        _toNumber(v) {
            if (v == null || v === '') return null;
            const n = Number(v);
            return isNaN(n) ? null : n;
        }

        // ===================== 积木实现 =====================

        repeatUntil(args, util) {
            // 使用 util.stackFrame 保存计数器，避免嵌套循环互相干扰
            if (typeof util.stackFrame.loopCounter === 'undefined') {
                util.stackFrame.loopCounter = 0;
            }
            if (util.stackFrame.loopCounter >= Cast.toNumber(args.TIMES) || args.COND) {
                util.stackFrame.loopCounter = 0;
                return;
            }
            util.stackFrame.loopCounter++;
            util.startBranch(1, true);
        }

        isTouching(args, util) {
            const source = this._resolveTarget(args.SPRITE, util);
            if (!source) return false;
            const targetName = Cast.toString(args.TARGET);

            switch (targetName) {
                case '鼠标指针':
                    if (typeof source.isTouchingPoint !== 'function') return false;
                    return source.isTouchingPoint(
                        runtime.ioDevices.mouse.getClientX(),
                        runtime.ioDevices.mouse.getClientY()
                    );
                case '舞台边缘':
                    return source.isTouchingEdge();
                case '本角色的克隆体': {
                    const ownClones = this._getClonesOnly(source.sprite.name);
                    for (const clone of ownClones) {
                        if (clone === source) continue;
                        if (this._isTouchingTarget(source, clone)) return true;
                    }
                    return false;
                }
                default:
                    return source.isTouchingSprite(targetName);
            }
        }

        splitText(args) {
            const text = Cast.toString(args.TEXT);
            const sep = Cast.toString(args.SEP);
            const idx = Cast.toNumber(args.IDX) - 1;
            if (!text || !sep) return '';
            const p = text.split(sep);
            return (idx >= 0 && idx < p.length) ? p[idx] : '';
        }

        listStat(args) {
            if (args.LIST === '（无列表）') return 0;
            const vals = this._getListValues(args.LIST);
            if (!vals.length) return 0;

            if (args.STAT === '项数') return vals.length;

            const nums = vals.map(v => this._toNumber(v)).filter(v => v !== null);
            if (!nums.length) return 0;
            switch (args.STAT) {
                case '最小值': return Math.min.apply(null, nums);
                case '最大值': return Math.max.apply(null, nums);
                case '平均值': return nums.reduce((a, b) => a + b, 0) / nums.length;
                case '总和': return nums.reduce((a, b) => a + b, 0);
                default: return 0;
            }
        }

        listTopN(args) {
            if (args.LIST === '（无列表）') return [];
            const n = Math.max(1, Cast.toNumber(args.N));
            const vals = this._getListValues(args.LIST);
            if (!vals.length) return [];

            const items = [];
            vals.forEach((v, i) => {
                const num = this._toNumber(v);
                if (num !== null) items.push({ val: num, idx: i + 1 });
            });
            if (!items.length) return [];
            items.sort((a, b) => args.ORDER === '最大' ? b.val - a.val : a.val - b.val);
            return items.slice(0, n).map(x => x.idx);
        }

        findInList(args) {
            if (args.LIST === '（无列表）') return [];
            const vals = this._getListValues(args.LIST);
            if (!vals.length) return [];
            const tNum = this._toNumber(args.VAL);
            const tStr = Cast.toString(args.VAL);
            const res = [];
            vals.forEach((v, i) => {
                const n = this._toNumber(v);
                const s = Cast.toString(v);
                let m = false;
                switch (args.COMPARE) {
                    case '大于': m = n !== null && tNum !== null && n > tNum; break;
                    case '小于': m = n !== null && tNum !== null && n < tNum; break;
                    case '等于': m = s === tStr; break;
                    case '大于等于': m = n !== null && tNum !== null && n >= tNum; break;
                    case '小于等于': m = n !== null && tNum !== null && n <= tNum; break;
                    case '不等于': m = s !== tStr; break;
                }
                if (m) res.push(i + 1);
            });
            return res;
        }

        touchCloneVar(args, util) {
            const t = util.target;
            if (!t || args.SPR === '（无角色）' || args.VAR === '（无变量）') return false;
            for (const c of this._getClones(args.SPR)) {
                if (this._isTouchingTarget(t, c)) {
                    const v = this._getVar(c, args.VAR);
                    if (v !== null && this._compare(v, args.OP, args.VAL)) return true;
                }
            }
            return false;
        }

        getTouchCloneVar(args, util) {
            const t = util.target;
            if (!t || args.SPR === '（无角色）' || args.VAR === '（无变量）') return '';
            for (const c of this._getClones(args.SPR)) {
                if (this._isTouchingTarget(t, c)) {
                    const v = this._getVar(c, args.VAR);
                    if (v !== null) return v;
                }
            }
            return '';
        }

        moveDir(args, util) {
            const target = util.target;
            const step = Cast.toNumber(args.STEP);
            const dir = Cast.toNumber(args.DIR);
            const originalDir = target.direction;

            const rad = (90 - dir) * Math.PI / 180;
            target.setXY(target.x + step * Math.cos(rad), target.y + step * Math.sin(rad));

            // setXY 不应改变方向，但保险起见恢复一次
            if (target.direction !== originalDir) target.setDirection(originalDir);
        }

        circleMotion(args, util) {
            const target = util.target;
            const cx = Cast.toNumber(args.CX);
            const cy = Cast.toNumber(args.CY);
            const radius = Cast.toNumber(args.R);
            const mode = Cast.toString(args.MODE);
            const angle = Cast.toNumber(args.ANGLE);

            const dx = target.x - cx;
            const dy = target.y - cy;
            let currentRad = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx);

            let newRad;
            if (mode === 'cw') newRad = currentRad - (angle * Math.PI / 180);
            else if (mode === 'ccw') newRad = currentRad + (angle * Math.PI / 180);
            else newRad = (90 - angle) * Math.PI / 180;

            target.setXY(cx + radius * Math.cos(newRad), cy + radius * Math.sin(newRad));
        }

        roundToDecimal(args) {
            const num = Cast.toNumber(args.NUM);
            const decimal = Math.max(0, Math.floor(Cast.toNumber(args.DECIMAL)));
            const multiplier = Math.pow(10, decimal);
            return parseFloat((Math.round(num * multiplier) / multiplier).toFixed(decimal));
        }

        pointTowardsNearestClone(args, util) {
            if (args.TARGET === '没有角色') return;
            const result = this._findNearestClone(args.SPRITE, args.TARGET, util);
            if (!result) return;
            const source = this._resolveTarget(args.SPRITE, util);
            if (!source) return;
            const dx = result.clone.x - source.x;
            const dy = result.clone.y - source.y;
            source.setDirection(Math.atan2(dx, dy) * 180 / Math.PI);
        }

        getNearestCloneInfo(args, util) {
            if (args.TARGET === '没有角色') return 0;
            const result = this._findNearestClone(args.SPRITE, args.TARGET, util);
            if (!result) return 0;
            const clone = result.clone;
            switch (args.PROPERTY) {
                case 'x坐标': return clone.x;
                case 'y坐标': return clone.y;
                case '面向角度': return clone.direction;
                case '距离': return result.distance;
                case '造型编号': return clone.currentCostume + 1;
                case '大小': return clone.size;
                case '队伍编号': return this._getTargetTeam(clone);
                case '克隆数据': return this._getCloneData(clone);
                default: return 0;
            }
        }

        getDistanceToNearestClone(args, util) {
            if (args.TARGET === '没有角色') return 999999;
            const result = this._findNearestClone(args.SPRITE, args.TARGET, util);
            return result ? result.distance : 999999;
        }
    }

    Scratch.extensions.register(new MoreUsefulBlocks());
})(Scratch);