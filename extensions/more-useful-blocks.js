// Name: 更多实用积木
// ID: more-useful-blocks
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
    const EXTENSION_ID = 'moreusefulblocks';
    const ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSIjQzc3REZGIi8+PC9zdmc+';

    class MoreUsefulBlocks {
        constructor() {
            this.spriteNames = [];
            this.updateSpriteList();
            // ========== 克隆数据系统：存储每个克隆体的独立数据 ==========
            this._cloneDataMap = new WeakMap(); // 用 WeakMap 避免内存泄漏
        }

        getInfo() {
            this.updateSpriteList();

            return {
                id: 'more-useful-blocks',
                name: '更多实用积木',
                color1: '#C77DFF',
                color2: '#B056E0',
                color3: '#9A3CC7',
                menuIconURI: ICON,
                blocks: [
                    // ========== 控制类 ==========
                    {
                        opcode: 'repeatUntil',
                        blockType: Scratch.BlockType.LOOP,
                        text: '重复执行 [TIMES] 次或直到 [COND]',
                        arguments: {
                            TIMES: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
                            COND: { type: Scratch.ArgumentType.BOOLEAN }
                        }
                    },
                    // ========== 重新运行作品 ==========
                    {
                        opcode: 'restartProject',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '重新运行作品'
                    },
                    '---',

                    // ========== 队伍系统 ==========
                    {
                        opcode: 'setTeam',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '将角色队伍设为 [TEAM] 队',
                        arguments: {
                            TEAM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    {
                        opcode: 'getTeam',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前角色队伍编号',
                    },
                    {
                        opcode: 'isTouchTeam',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '碰到 [TEAM] 队',
                        arguments: {
                            TEAM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 }
                        }
                    },
                    '---',

                    // ========== 精准仅修改单个碰撞克隆体变量 ==========
                    {
                        opcode: 'addVarToTouchingClone',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '把碰到 [SPR] 克隆体的私有变量 [VAR] 增加 [VAL]',
                        arguments: {
                            SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                            VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' },
                            VAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    '---',

                    // ========== 克隆创建 ==========
                    {
                        opcode: 'createCloneAt',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '克隆 [SPRITE] 在 x [X] y [Y]',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'cloneSpriteMenu'
                            },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    // ========== 带位置+数据的克隆创建 ==========
                    {
                        opcode: 'createCloneWithData',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '克隆 [SPRITE] 在 x [X] y [Y] 数据为 [DATA]',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'cloneSpriteMenu'
                            },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            DATA: { type: Scratch.ArgumentType.STRING, defaultValue: 'hello' }
                        }
                    },
                    // ========== 仅带数据的克隆创建（使用当前位置） ==========
                    {
                        opcode: 'createCloneWithDataOnly',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '克隆 [SPRITE] 数据为 [DATA]',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'cloneSpriteMenu'
                            },
                            DATA: { type: Scratch.ArgumentType.STRING, defaultValue: 'hello' }
                        }
                    },
                    // ========== 获取本克隆体数据 ==========
                    {
                        opcode: 'getMyCloneData',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '本克隆体的数据',
                    },
                    '---',

                    // ========== 文本处理 ==========
                    {
                        opcode: 'splitText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [TEXT] 按 [SEP] 分割的第 [IDX] 项',
                        arguments: {
                            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'a,b,c' },
                            SEP: { type: Scratch.ArgumentType.STRING, defaultValue: ',' },
                            IDX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    '---',

                    // ========== 列表统计 ==========
                    {
                        opcode: 'listStat',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '列表 [LIST] 的 [STAT]',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                            STAT: { type: Scratch.ArgumentType.STRING, menu: 'stats', defaultValue: '最小值' }
                        }
                    },
                    {
                        opcode: 'listTopN',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '列表 [LIST] [ORDER] 的 [N] 个值的位置',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                            ORDER: { type: Scratch.ArgumentType.STRING, menu: 'orders', defaultValue: '最大' },
                            N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 }
                        }
                    },
                    {
                        opcode: 'findInList',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '列表 [LIST] 中 [COMPARE] [VAL] 的项的位置',
                        arguments: {
                            LIST: { type: Scratch.ArgumentType.STRING, menu: 'lists' },
                            COMPARE: { type: Scratch.ArgumentType.STRING, menu: 'compares', defaultValue: '大于' },
                            VAL: { type: Scratch.ArgumentType.STRING, defaultValue: '50' }
                        }
                    },
                    '---',

                    // ========== 通用碰撞检测 ==========
                    {
                        opcode: 'isTouching',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '[SPRITE] 碰到 [TARGET]',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'spriteMenu'
                            },
                            TARGET: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '鼠标指针',
                                menu: 'touchTargetMenu'
                            }
                        }
                    },
                    // ========== 碰到鼠标指针且上层没有遮挡 ==========
                    {
                        opcode: 'isTouchingMouseNoCover',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '碰到鼠标指针且上层没有遮挡',
                    },
                    '---',

                    // ========== 克隆体碰撞检测 ==========
                    {
                        opcode: 'touchCloneVar',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '碰到 [SPR] 的 [VAR] [OP] [VAL] 的克隆体',
                        arguments: {
                            SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                            VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' },
                            OP: { type: Scratch.ArgumentType.STRING, menu: 'ops', defaultValue: '等于' },
                            VAL: { type: Scratch.ArgumentType.STRING, defaultValue: '10' }
                        }
                    },
                    {
                        opcode: 'getTouchCloneVar',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取碰到 [SPR] 克隆体的 [VAR]',
                        arguments: {
                            SPR: { type: Scratch.ArgumentType.STRING, menu: 'sprites' },
                            VAR: { type: Scratch.ArgumentType.STRING, menu: 'vars' }
                        }
                    },
                    '---',

                    // ========== 运动类 ==========
                    {
                        opcode: 'moveDir',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '向 [DIR] 方向移动 [STEP] 步',
                        arguments: {
                            DIR: { type: Scratch.ArgumentType.ANGLE, defaultValue: 90 },
                            STEP: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }
                        }
                    },
                    {
                        opcode: 'circleMotion',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '以圆心 x [CX] y [CY] 半径 [R] [MODE] [ANGLE] 度',
                        arguments: {
                            CX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            CY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'circleMode',
                                defaultValue: 'cw'
                            },
                            ANGLE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 90 }
                        }
                    },
                    '---',

                    // ========== 数学类 ==========
                    {
                        opcode: 'roundToDecimal',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '将 [NUM] 四舍五入到小数点后第 [DECIMAL] 位',
                        arguments: {
                            NUM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3.14159 },
                            DECIMAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 }
                        }
                    },
                    '---',

                    // ========== 克隆体定位类 ==========
                    {
                        opcode: 'pointTowardsNearestClone',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '面向离 [SPRITE] 最近的 [TARGET] 的克隆体',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'spriteMenu'
                            },
                            TARGET: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '没有角色',
                                menu: 'targetMenu'
                            }
                        }
                    },
                    {
                        opcode: 'getNearestCloneInfo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '离 [SPRITE] 最近的 [TARGET] 克隆体的 [PROPERTY]',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'spriteMenu'
                            },
                            TARGET: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '没有角色',
                                menu: 'targetMenu'
                            },
                            PROPERTY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'x坐标',
                                menu: 'propertyMenu'
                            }
                        }
                    },
                    {
                        opcode: 'getDistanceToNearestClone',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '到离 [SPRITE] 最近的 [TARGET] 克隆体的距离',
                        arguments: {
                            SPRITE: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '本角色',
                                menu: 'spriteMenu'
                            },
                            TARGET: { 
                                type: Scratch.ArgumentType.STRING, 
                                defaultValue: '没有角色',
                                menu: 'targetMenu'
                            }
                        }
                    }
                ],
                menus: {
                    lists: { acceptReporters: true, items: '_getListNames' },
                    sprites: { acceptReporters: false, items: '_getSpriteNames' },
                    vars: { acceptReporters: true, items: '_getAllVarWithTeam' },
                    ops: { acceptReporters: false, items: ['大于', '小于', '等于', '不等于', '大于等于', '小于等于'] },
                    stats: { acceptReporters: false, items: ['最小值', '最大值', '平均值', '总和', '项数'] },
                    orders: { acceptReporters: false, items: ['最大', '最小'] },
                    compares: { acceptReporters: false, items: ['大于', '小于', '等于', '大于等于', '小于等于', '不等于'] },
                    circleMode: {
                        acceptReporters: false,
                        items: [
                            { text: '右旋转', value: 'cw' },
                            { text: '左旋转', value: 'ccw' },
                            { text: '到角度', value: 'to' }
                        ]
                    },
                    spriteMenu: {
                        acceptReporters: true,
                        items: 'getSpriteMenuItems'
                    },
                    cloneSpriteMenu: {
                        acceptReporters: true,
                        items: 'getCloneSpriteMenuItems'
                    },
                    targetMenu: {
                        acceptReporters: true,
                        items: 'getTargetMenuItems'
                    },
                    propertyMenu: {
                        acceptReporters: false,
                        items: ['x坐标', 'y坐标', '面向角度', '距离', '造型编号', '大小', '队伍编号', '克隆数据']
                    },
                    touchTargetMenu: {
                        acceptReporters: true,
                        items: 'getTouchTargetItems'
                    }
                }
            };
        }

        // ===================== 队伍系统补丁（原版结构不动，仅追加）=====================
        TEAM_VAR_NAME = '__ext_team_id';

        // 获取当前角色/克隆体的队伍编号
        _getTargetTeam(target) {
            if (!target?.variables) return 0;
            const v = target.variables[this.TEAM_VAR_NAME];
            return v ? Cast.toNumber(v.value) : 0;
        }

        // 设置队伍编号
        _setTargetTeam(target, teamNum) {
            if (!target?.variables) return;
            const num = Cast.toNumber(teamNum);
            if (!target.variables[this.TEAM_VAR_NAME]) {
                target.variables[this.TEAM_VAR_NAME] = {
                    value: 0,
                    type: '',
                    isCloud: false
                };
            }
            target.variables[this.TEAM_VAR_NAME].value = num;
        }

        // 全局队伍碰撞检测
        _isTouchingTeam(util, wantTeam) {
            const self = util.target;
            const team = Cast.toNumber(wantTeam);
            if (team === 0) return false;

            for (const target of runtime.targets) {
                if (target === self) continue;
                if (target.isStage) continue;
                if (this._getTargetTeam(target) !== team) continue;

                if (self.isTouchingSprite(target.sprite.name)) {
                    return true;
                }
            }
            return false;
        }

        // ===================== 重新运行作品 =====================

        /**
         * 重新运行作品（等价于点击绿旗）
         * 会先停止全部脚本，再触发绿旗
         */
        restartProject(args, util) {
            try {
                const vm = Scratch.vm;
                // 优先使用 VM 的 greenFlag（会 stopAll + 触发绿旗）
                if (vm && typeof vm.greenFlag === 'function') {
                    vm.greenFlag();
                    return;
                }
                // 回退到 runtime
                if (runtime) {
                    if (typeof runtime.stopAll === 'function') {
                        runtime.stopAll();
                    }
                    if (typeof runtime.greenFlag === 'function') {
                        runtime.greenFlag();
                    }
                }
            } catch (e) {
                console.warn('重新运行作品失败:', e);
            }
        }

        // ===================== 克隆数据系统核心方法 =====================

        /**
         * 为指定克隆体设置数据
         * 使用 WeakMap 存储，避免内存泄漏，克隆体被销毁后数据自动释放
         */
        _setCloneData(cloneTarget, data) {
            if (!cloneTarget || cloneTarget.isStage) return;
            this._cloneDataMap.set(cloneTarget, Cast.toString(data));
        }

        /**
         * 获取指定克隆体的数据
         */
        _getCloneData(cloneTarget) {
            if (!cloneTarget || cloneTarget.isStage) return '';
            return this._cloneDataMap.has(cloneTarget) 
                ? this._cloneDataMap.get(cloneTarget) 
                : '';
        }

        /**
         * 获取本克隆体的数据（供积木调用）
         */
        getMyCloneData(args, util) {
            return this._getCloneData(util.target);
        }

        /**
         * 【核心】创建带数据的克隆体
         */
        createCloneWithData(args, util) {
            const spriteArg = args.SPRITE;
            const x = Cast.toNumber(args.X);
            const y = Cast.toNumber(args.Y);
            const data = Cast.toString(args.DATA);

            let target;
            let spriteName;

            if (spriteArg === '本角色' || !spriteArg) {
                target = util.target;
                spriteName = target.sprite.name;
            } else {
                spriteName = Cast.toString(spriteArg);
                target = this._getSpriteByName(spriteName);
                if (!target) {
                    target = runtime.getSpriteTargetByName?.(spriteName);
                }
            }

            if (!target || target.isStage) return;

            try {
                const sprite = target.sprite;
                const beforeClones = new Set(sprite.clones.map(c => c.id));

                const controlExt = runtime.ext_scratch3_control;
                if (controlExt && controlExt._createClone) {
                    controlExt._createClone(spriteName, util.target);
                } else if (sprite.createClone) {
                    sprite.createClone();
                }

                const afterClones = sprite.clones;
                let newClone = null;

                for (let i = afterClones.length - 1; i >= 0; i--) {
                    if (!beforeClones.has(afterClones[i].id)) {
                        newClone = afterClones[i];
                        break;
                    }
                }

                if (!newClone) {
                    for (let i = afterClones.length - 1; i >= 0; i--) {
                        const c = afterClones[i];
                        if (!c.isOriginal && c !== target) {
                            if (!this._cloneDataMap.has(c)) {
                                newClone = c;
                                break;
                            }
                        }
                    }
                }

                if (newClone) {
                    newClone.setXY(x, y);
                    this._setTargetTeam(newClone, this._getTargetTeam(target));
                    this._setCloneData(newClone, data);

                    setTimeout(() => {
                        if (newClone && !newClone.isDisposed) {
                            newClone.setXY(x, y);
                        }
                    }, 0);
                }
            } catch (e) {
                console.error('带数据克隆创建失败:', e);
            }
        }

        /**
         * 仅带数据的克隆创建（不指定位置，使用当前位置）
         */
        createCloneWithDataOnly(args, util) {
            const spriteArg = args.SPRITE;
            const data = Cast.toString(args.DATA);

            let target;
            let spriteName;

            if (spriteArg === '本角色' || !spriteArg) {
                target = util.target;
                spriteName = target.sprite.name;
            } else {
                spriteName = Cast.toString(spriteArg);
                target = this._getSpriteByName(spriteName);
                if (!target) {
                    target = runtime.getSpriteTargetByName?.(spriteName);
                }
            }

            if (!target || target.isStage) return;

            try {
                const sprite = target.sprite;
                const beforeClones = new Set(sprite.clones.map(c => c.id));

                const controlExt = runtime.ext_scratch3_control;
                if (controlExt && controlExt._createClone) {
                    controlExt._createClone(spriteName, util.target);
                } else if (sprite.createClone) {
                    sprite.createClone();
                }

                const afterClones = sprite.clones;
                let newClone = null;

                for (let i = afterClones.length - 1; i >= 0; i--) {
                    if (!beforeClones.has(afterClones[i].id)) {
                        newClone = afterClones[i];
                        break;
                    }
                }

                if (!newClone) {
                    for (let i = afterClones.length - 1; i >= 0; i--) {
                        const c = afterClones[i];
                        if (!c.isOriginal && c !== target) {
                            if (!this._cloneDataMap.has(c)) {
                                newClone = c;
                                break;
                            }
                        }
                    }
                }

                if (newClone) {
                    this._setTargetTeam(newClone, this._getTargetTeam(target));
                    this._setCloneData(newClone, data);
                }
            } catch (e) {
                console.error('带数据克隆创建失败:', e);
            }
        }

        // ===================== 遮挡检测核心方法 =====================

        /**
         * 【修复版】碰到鼠标指针且上层没有遮挡
         * 
         * 修复内容：
         * 1. 优先使用原生 isTouchingObject('_mouse_') 检测碰撞（如果可用）
         * 2. 回退到 isTouchingPoint(x, y) 使用客户端像素坐标
         * 3. renderer.pick 使用客户端坐标，与渲染器坐标系一致
         * 4. 兼容沙箱/无沙箱、不同舞台尺寸、手机端触摸
         */
        isTouchingMouseNoCover(args, util) {
            try {
                const self = util.target;
                if (!self || self.isStage) return false;

                // 安全检查：确保 mouse 设备可用
                if (!runtime.ioDevices || !runtime.ioDevices.mouse) return false;
                const mouseDevice = runtime.ioDevices.mouse;

                // ===== 第一步：检测自己是否碰到鼠标 =====
                let selfTouching = false;

                // 方案 A：优先使用原生 isTouchingObject（最可靠，已处理坐标转换）
                if (typeof self.isTouchingObject === 'function') {
                    try {
                        selfTouching = self.isTouchingObject('_mouse_');
                    } catch (err) {
                        // 失败则回退
                    }
                }

                // 方案 B：回退到 isTouchingPoint（需要客户端像素坐标）
                if (!selfTouching && typeof self.isTouchingPoint === 'function') {
                    try {
                        const clientX = mouseDevice.getClientX();
                        const clientY = mouseDevice.getClientY();
                        if (clientX !== undefined && clientY !== undefined) {
                            selfTouching = self.isTouchingPoint(clientX, clientY);
                        }
                    } catch (err) {
                        // 失败则无法检测
                    }
                }

                if (!selfTouching) {
                    return false;
                }

                // ===== 第二步：检测是否有上层遮挡 =====
                // 使用 renderer.pick 获取最上层在鼠标位置的 drawable
                // renderer.pick 需要客户端像素坐标
                if (runtime.renderer && typeof runtime.renderer.pick === 'function') {
                    try {
                        const clientX = mouseDevice.getClientX();
                        const clientY = mouseDevice.getClientY();

                        if (clientX === undefined || clientY === undefined ||
                            clientX === null || clientY === null ||
                            isNaN(clientX) || isNaN(clientY)) {
                            // 无法获取坐标，保守返回 true（至少碰到鼠标了）
                            return true;
                        }

                        const topDrawableID = runtime.renderer.pick(clientX, clientY);

                        // 如果最上层就是自己，说明没有被遮挡
                        if (topDrawableID === self.drawableID) {
                            return true;
                        }

                        // 找到最上层的 target
                        let topTarget = null;
                        for (const target of runtime.targets) {
                            if (target.drawableID === topDrawableID) {
                                topTarget = target;
                                break;
                            }
                        }

                        // 如果最上层是舞台，说明自己就是最上层可见角色
                        if (topTarget && topTarget.isStage) {
                            return true;
                        }

                        // 如果最上层是其他角色（不是舞台），说明自己被遮挡
                        if (topTarget && topTarget !== self) {
                            return false;
                        }

                        // 异常情况，默认返回 true
                        return true;

                    } catch (pickErr) {
                        console.warn('renderer.pick 出错:', pickErr);
                        // 回退到层级比较
                    }
                }

                // ===== 备选方案：层级比较 =====
                const selfLayer = self.getLayerOrder ? self.getLayerOrder() : null;
                if (selfLayer === null) {
                    return true; // 无法判断层级，至少确认碰到鼠标了
                }

                let maxOtherLayer = -Infinity;

                for (const target of runtime.targets) {
                    if (!target || target === self || target.isStage) continue;
                    if (target.isDisposed) continue;
                    if (target.visible === false) continue;

                    // 检测其他角色是否碰到鼠标
                    let targetTouching = false;

                    if (typeof target.isTouchingObject === 'function') {
                        try {
                            targetTouching = target.isTouchingObject('_mouse_');
                        } catch (err) {}
                    }

                    if (!targetTouching && typeof target.isTouchingPoint === 'function') {
                        try {
                            const cx = mouseDevice.getClientX();
                            const cy = mouseDevice.getClientY();
                            if (cx !== undefined && cy !== undefined) {
                                targetTouching = target.isTouchingPoint(cx, cy);
                            }
                        } catch (err) {}
                    }

                    if (targetTouching) {
                        const targetLayer = target.getLayerOrder ? target.getLayerOrder() : null;
                        if (targetLayer !== null && targetLayer > maxOtherLayer) {
                            maxOtherLayer = targetLayer;
                        }
                    }
                }

                if (maxOtherLayer === -Infinity || selfLayer > maxOtherLayer) {
                    return true;
                }

                return false;

            } catch (e) {
                console.warn('遮挡检测出错:', e);
                return false;
            }
        }

        // ===================== 精准仅修改单个碰撞克隆体变量 =====================
        addVarToTouchingClone(args, util) {
            const self = util.target;
            const spriteName = Cast.toString(args.SPR);
            const varName = Cast.toString(args.VAR);
            const addVal = Cast.toNumber(args.VAL);

            if (spriteName === '（无角色）' || varName === '（无变量）') return;

            const allClones = this._getClones(spriteName);

            for (const clone of allClones) {
                if (self.isTouchingSprite(clone.sprite.name)) {
                    let oldValue = Cast.toNumber(this._getVar(clone, varName));
                    const newValue = oldValue + addVal;

                    if (!clone.variables) continue;
                    const varObj = Object.values(clone.variables).find(v => v?.name === varName && v.type !== 'list');
                    if (varObj) {
                        varObj.value = newValue;
                    }
                    break;
                }
            }
        }

        // 原版队伍积木
        setTeam(args, util) {
            this._setTargetTeam(util.target, args.TEAM);
        }
        getTeam(_, util) {
            return this._getTargetTeam(util.target);
        }
        isTouchTeam(args, util) {
            return this._isTouchingTeam(util, args.TEAM);
        }

        // 变量菜单追加队伍
        _getAllVarWithTeam() {
            const base = this._getPrivateVarNames();
            base.unshift('队伍编号');
            return base;
        }

        // 原版_getVar函数兼容队伍
        _getVar(target, name) {
            if (name === '队伍编号') return this._getTargetTeam(target);
            if (name === '克隆数据') return this._getCloneData(target);
            if (!target?.variables) return null;
            const v = Object.values(target.variables).find(x => x?.name === name && x.type !== 'list');
            return v?.value ?? null;
        }

        // ========== 原版所有函数完全保留，一丝不改 ==========
        _getAllSpriteNames() {
            const names = [];
            runtime.targets.forEach(t => {
                if (!t.isStage && t.sprite?.name) {
                    const name = t.sprite.name;
                    if (!names.includes(name)) {
                        names.push(name);
                    }
                }
            });
            return names;
        }

        getSpriteMenuItems() {
            const names = ['本角色'];
            const allSprites = this._getAllSpriteNames();
            allSprites.forEach(name => {
                if (!names.includes(name)) {
                    names.push(name);
                }
            });
            return names.length > 1 ? names : ['本角色'];
        }

        getCloneSpriteMenuItems() {
            const names = this._getAllSpriteNames();
            return names.length > 0 ? names : ['（无角色）'];
        }

        getTargetMenuItems() {
            const names = ['没有角色'];
            const allSprites = this._getAllSpriteNames();
            allSprites.forEach(name => {
                if (!names.includes(name)) {
                    names.push(name);
                }
            });
            return names;
        }

        getTouchTargetItems() {
            const items = ['鼠标指针', '舞台边缘', '本角色的克隆体'];
            const allSprites = this._getAllSpriteNames();
            allSprites.forEach(name => {
                if (!items.includes(name)) {
                    items.push(name);
                }
            });
            return items;
        }

        updateSpriteList() {
            this.spriteNames = this._getAllSpriteNames();
        }

        _isClone(target) {
            return !target.isStage && target.sprite && target.isOriginal === false;
        }

        _getClonesOnly(spriteName) {
            if (!spriteName || spriteName === '没有角色') return [];
            return runtime.targets.filter(t => {
                if (!this._isClone(t)) return false;
                return t.sprite?.name === spriteName;
            });
        }

        _getSpriteByName(name) {
            if (!name || name === '没有角色' || name === '本角色') return null;
            for (const target of runtime.targets) {
                if (!target.isStage && target.sprite?.name === name) {
                    return target;
                }
            }
            return null;
        }

        _getDistance(x1, y1, x2, y2) {
            return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        }

        _findNearestClone(sourceSpriteArg, targetSpriteName, util) {
            const source = util.target;

            if (!source || targetSpriteName === '没有角色') {
                return null;
            }

            const clones = this._getClonesOnly(targetSpriteName);
            if (clones.length === 0) {
                return null;
            }

            let nearest = null;
            let minDistance = Infinity;

            for (const clone of clones) {
                if (clone === source) continue;
                const distance = this._getDistance(source.x, source.y, clone.x, clone.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = clone;
                }
            }

            if (!nearest) {
                return null;
            }

            return { clone: nearest, distance: minDistance };
        }

        _getClones(name) {
            return runtime.targets.filter(t => !t.isStage && t.sprite?.name === name && !t.isOriginal);
        }

        _compare(a, op, b) {
            const n1 = Cast.toNumber(a);
            const n2 = Cast.toNumber(b);
            const s1 = Cast.toString(a);
            const s2 = Cast.toString(b);

            switch(op) {
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

            if (editing?.variables) {
                Object.values(editing.variables).forEach(v => {
                    if (v?.type === 'list' && v.name && !names.includes(v.name)) names.push(v.name);
                });
            }

            if (stage?.variables) {
                Object.values(stage.variables).forEach(v => {
                    if (v?.type === 'list' && v.name && !names.includes(v.name)) names.push(v.name);
                });
            }

            return names.length ? names : ['（无列表）'];
        }

        _getSpriteNames() {
            const names = [];
            runtime.targets.forEach(t => {
                if (!t.isStage && t.sprite?.name && !names.includes(t.sprite.name)) {
                    names.push(t.sprite.name);
                }
            });
            return names.length ? names : ['（无角色）'];
        }

        _getPrivateVarNames() {
            const names = [];
            const stage = runtime.getTargetForStage();
            const global = new Set();

            if (stage?.variables) {
                Object.values(stage.variables).forEach(v => {
                    if (v?.name && v.type !== 'list') global.add(v.name);
                });
            }

            runtime.targets.forEach(t => {
                if (t.isStage || !t.variables) return;
                Object.values(t.variables).forEach(v => {
                    if (v?.name && !v.isCloud && v.type !== 'list' && !global.has(v.name)) {
                        if (!names.includes(v.name)) names.push(v.name);
                    }
                });
            });

            return names.length ? names : ['（无变量）'];
        }

        _findList(name) {
            if (!name || name === '（无列表）') return null;

            const stage = runtime.getTargetForStage();
            const editing = runtime.getEditingTarget ? runtime.getEditingTarget() : null;

            if (editing?.variables) {
                const found = Object.values(editing.variables).find(v => v?.name === name && v.type === 'list');
                if (found) return found;
            }

            if (stage?.variables) {
                const found = Object.values(stage.variables).find(v => v?.name === name && v.type === 'list');
                if (found) return found;
            }

            for (const t of runtime.targets) {
                if (!t?.variables) continue;
                const found = Object.values(t.variables).find(v => v?.name === name && v.type === 'list');
                if (found) return found;
            }

            return null;
        }

        _getListValues(name) {
            const list = this._findList(name);
            if (!list?.value) return [];
            if (Array.isArray(list.value)) return list.value;
            if (typeof list.value === 'string') {
                try { return JSON.parse(list.value); } catch { return [list.value]; }
            }
            return [];
        }

        _toNumber(v) {
            if (v == null || v === '') return null;
            const n = Number(v);
            return isNaN(n) ? null : n;
        }

        // ========== 原版克隆创建完全保留，追加队伍继承 ==========
        createCloneAt(args, util) {
            const spriteArg = args.SPRITE;
            const x = Cast.toNumber(args.X);
            const y = Cast.toNumber(args.Y);

            let target;
            let spriteName;

            if (spriteArg === '本角色' || !spriteArg) {
                target = util.target;
                spriteName = target.sprite.name;
            } else {
                spriteName = Cast.toString(spriteArg);
                target = this._getSpriteByName(spriteName);
                if (!target) {
                    target = runtime.getSpriteTargetByName?.(spriteName);
                }
            }

            if (!target || target.isStage) return;

            try {
                const controlExt = runtime.ext_scratch3_control;
                let newClone;
                if (controlExt && controlExt._createClone) {
                    controlExt._createClone(spriteName, util.target);
                    const clones = target.sprite.clones;
                    if (clones.length > 1) {
                        newClone = clones[clones.length - 1];
                    }
                } else {
                    if (target.sprite.createClone) {
                        newClone = target.sprite.createClone();
                    }
                }

                if (newClone) {
                    newClone.setXY(x, y);
                    this._setTargetTeam(newClone, this._getTargetTeam(target));

                    setTimeout(() => {
                        if (newClone && !newClone.isDisposed) {
                            newClone.setXY(x, y);
                        }
                    }, 0);
                }
            } catch (e) {
                console.error('克隆创建失败:', e);
            }
        }

        // 原版所有积木原封不动保留
        isTouching(args, util) {
            const spriteArg = args.SPRITE;
            const targetArg = args.TARGET;

            let source;
            if (spriteArg === '本角色' || !spriteArg) {
                source = util.target;
            } else {
                const spriteName = Cast.toString(spriteArg);
                source = this._getSpriteByName(spriteName);
                if (!source) {
                    source = runtime.getSpriteTargetByName?.(spriteName);
                }
            }

            if (!source) return false;

            const targetName = Cast.toString(targetArg);

            switch(targetName) {
                case '鼠标指针':
                    return source.isTouchingPoint({
                        x: runtime.ioDevices.mouse.getX(), 
                        y: runtime.ioDevices.mouse.getY()
                    });
                case '舞台边缘':
                    return source.isTouchingEdge();
                case '本角色的克隆体':
                    const ownClones = this._getClonesOnly(source.sprite.name);
                    for (const clone of ownClones) {
                        if (clone !== source && source.isTouchingSprite(clone.sprite.name)) {
                            return true;
                        }
                    }
                    return false;
                default:
                    return source.isTouchingSprite(targetName);
            }
        }

        repeatUntil(args, util) {
            const t = util.thread;
            if (!t.loopCounter || t.lastOpcode !== 'moreusefulblocks_repeatUntil') {
                t.loopCounter = 0;
                t.lastOpcode = 'moreusefulblocks_repeatUntil';
            }
            if (t.loopCounter >= Cast.toNumber(args.TIMES) || args.COND) {
                t.loopCounter = 0;
                t.lastOpcode = null;
                return;
            }
            t.loopCounter++;
            util.startBranch(1, true);
        }

        splitText(args) {
            const text = Cast.toString(args.TEXT);
            const sep = Cast.toString(args.SEP);
            const idx = Cast.toNumber(args.IDX) - 1;
            if (!text || !sep) return '';
            const p = text.split(sep);
            return idx >= 0 && idx < p.length ? p[idx] : '';
        }

        listStat(args) {
            const name = args.LIST;
            if (name === '（无列表）') return 0;

            const vals = this._getListValues(name);
            if (!vals.length) return 0;

            const nums = vals.map(v => this._toNumber(v)).filter(v => v !== null);
            if (!nums.length) return 0;

            switch(args.STAT) {
                case '最小值': return Math.min(...nums);
                case '最大值': return Math.max(...nums);
                case '平均值': return nums.reduce((a,b) => a+b, 0) / nums.length;
                case '总和': return nums.reduce((a,b) => a+b, 0);
                case '项数': return vals.length;
                default: return 0;
            }
        }

        listTopN(args) {
            const name = args.LIST;
            const n = Math.max(1, Cast.toNumber(args.N));

            if (name === '（无列表）') return [];

            const vals = this._getListValues(name);
            if (!vals.length) return [];

            const items = vals.map((v, i) => {
                const num = this._toNumber(v);
                return num !== null ? { val: num, idx: i + 1 } : null;
            }).filter(x => x);

            if (!items.length) return [];

            items.sort((a, b) => args.ORDER === '最大' ? b.val - a.val : a.val - b.val);
            return items.slice(0, n).map(x => x.idx);
        }

        findInList(args) {
            const name = args.LIST;
            if (name === '（无列表）') return [];

            const vals = this._getListValues(name);
            if (!vals.length) return [];

            const tNum = this._toNumber(args.VAL);
            const tStr = Cast.toString(args.VAL);
            const res = [];

            vals.forEach((v, i) => {
                const n = this._toNumber(v);
                const s = Cast.toString(v);
                let m = false;

                switch(args.COMPARE) {
                    case '大于': m = n !== null && tNum !== null && n > tNum; break;
                    case '小于': m = n !== null && tNum !== null && n < tNum; break;
                    case '等于': m = s === tStr; break;
                    case '大于等于': m = n !== null && tNum !== null && n >= tNum; break;
                    case '小于等于': m = n !== null && tNum !== null && n <= tNum; break;
                    case '不等于': m = s !== null && tStr !== null && s !== tStr; break;
                }

                if (m) res.push(i + 1);
            });

            return res;
        }

        touchCloneVar(args, util) {
            const t = util.target;
            if (!t || args.SPR === '（无角色）' || args.VAR === '（无变量）') return false;

            for (const c of this._getClones(args.SPR)) {
                if (t.isTouchingSprite(c.sprite.name)) {
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
                if (t.isTouchingSprite(c.sprite.name)) {
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
            const dx = step * Math.cos(rad);
            const dy = step * Math.sin(rad);

            target.setXY(target.x + dx, target.y + dy);

            if (target.direction !== originalDir) {
                target.setDirection(originalDir);
            }
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
            let currentRad = Math.atan2(dy, dx);
            if (dx === 0 && dy === 0) currentRad = 0;

            let newRad;
            if (mode === 'cw') {
                newRad = currentRad - (angle * Math.PI / 180);
            } else if (mode === 'ccw') {
                newRad = currentRad + (angle * Math.PI / 180);
            } else {
                newRad = (90 - angle) * Math.PI / 180;
            }

            const newX = cx + radius * Math.cos(newRad);
            const newY = cy + radius * Math.sin(newRad);

            target.setXY(newX, newY);
        }

        roundToDecimal(args) {
            const num = Cast.toNumber(args.NUM);
            const decimal = Cast.toNumber(args.DECIMAL);
            const multiplier = Math.pow(10, decimal);
            const result = Math.round(num * multiplier) / multiplier;
            return parseFloat(result.toFixed(decimal));
        }

        pointTowardsNearestClone(args, util) {
            const targetName = args.TARGET;
            if (targetName === '没有角色') return;

            const result = this._findNearestClone(args.SPRITE, targetName, util);
            if (!result || !result.clone) return;

            const source = util.target;
            const dx = result.clone.x - source.x;
            const dy = result.clone.y - source.y;
            let angle = (Math.atan2(dx, dy) * 180 / Math.PI);

            source.setDirection(angle);
        }

        getNearestCloneInfo(args, util) {
            const targetName = args.TARGET;
            if (targetName === '没有角色') return 0;

            const result = this._findNearestClone(args.SPRITE, targetName, util);
            if (!result || !result.clone) return 0;

            const clone = result.clone;
            const property = args.PROPERTY;

            switch (property) {
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
            const targetName = args.TARGET;
            if (targetName === '没有角色') return 999999;

            const result = this._findNearestClone(args.SPRITE, targetName, util);
            return result ? result.distance : 999999;
        }
    }

    Scratch.extensions.register(new MoreUsefulBlocks());

})(Scratch);