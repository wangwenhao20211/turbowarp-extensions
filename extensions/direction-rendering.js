// Name:方向渲染
// ID: direction-rendering
// Description: 提供第二个方向和xy的渲染，让角色在左右和不可翻转的情况下也可以旋转
// By: yizhiMC
// License: MIT

(function() {
    'use strict';

    var rotationData = {};
    var secondXY = {};
    var EXT_ID = 'direction-rendering';

    function applyAnotherRotation(target) {
        if (!target || !target.renderer || target.drawableID === null) return;
        var secondRot = rotationData[target.id];
        if (secondRot === undefined) return;
        var result = target._getRenderedDirectionAndScale();
        var finalDirection = result.direction + secondRot;
        target.renderer.updateDrawableDirectionScale(target.drawableID, finalDirection, result.scale);
    }

    function applySecondXY(target) {
        if (!target || !target.renderer || target.drawableID === null) return;
        var xy = secondXY[target.id];
        if (!xy) return;
        var finalX = target.x + xy.x;
        var finalY = target.y + xy.y;
        target.renderer.updateDrawablePosition(target.drawableID, [finalX, finalY]);
    }

    var AnotherRotation = function() {
        this.init();
    };

    AnotherRotation.prototype.init = function() {
        if (!Scratch.vm) {
            setTimeout(this.init.bind(this), 100);
            return;
        }
        var runtime = Scratch.vm.runtime;
        if (!runtime.targets || runtime.targets.length === 0) {
            setTimeout(this.init.bind(this), 100);
            return;
        }

        var RenderedTarget = runtime.targets[0].constructor;
        if (!RenderedTarget) return;

        var origSetDirection = RenderedTarget.prototype.setDirection;
        var origSetRotationStyle = RenderedTarget.prototype.setRotationStyle;
        var origSetSize = RenderedTarget.prototype.setSize;
        var origSetXY = RenderedTarget.prototype.setXY;

        RenderedTarget.prototype.setDirection = function(direction) {
            origSetDirection.call(this, direction);
            if (rotationData[this.id] !== undefined) applyAnotherRotation(this);
        };

        RenderedTarget.prototype.setRotationStyle = function(style) {
            origSetRotationStyle.call(this, style);
            if (rotationData[this.id] !== undefined) applyAnotherRotation(this);
        };

        RenderedTarget.prototype.setSize = function(size) {
            origSetSize.call(this, size);
            if (rotationData[this.id] !== undefined) applyAnotherRotation(this);
        };

        RenderedTarget.prototype.setXY = function(x, y, force) {
            origSetXY.call(this, x, y, force);
            if (secondXY[this.id] !== undefined) applySecondXY(this);
        };

        var origStep = runtime._step;
        runtime._step = function() {
            origStep.call(this);
            var targets = this.targets;
            for (var i = 0; i < targets.length; i++) {
                var target = targets[i];
                if (target.isStage) continue;
                if (rotationData[target.id] !== undefined) applyAnotherRotation(target);
                if (secondXY[target.id] !== undefined) applySecondXY(target);
            }
        };

        runtime.on('TARGET_WILL_BE_REMOVED', function(target) {
            delete rotationData[target.id];
            delete secondXY[target.id];
        });

        runtime.on('PROJECT_START', function() {
            rotationData = {};
            secondXY = {};
        });

        console.log('extension loaded');
    };

    AnotherRotation.prototype.getInfo = function() {
        return {
            id: 'direction-rendering',
            name: '\u65b9\u5411\u6e32\u67d3',
            color1: '#FF6B35',
            color2: '#E85A2C',
            color3: '#D14926',
            blocks: [
                {
                    opcode: 'setRotation',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u53e6\u4e00\u4e2a\u65cb\u8f6c\u8bbe\u4e3a [ANGLE] \u5ea6',
                    arguments: {
                        ANGLE: {
                            type: Scratch.ArgumentType.ANGLE,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'changeRotation',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u53e6\u4e00\u4e2a\u65cb\u8f6c [DIR] [ANGLE] \u5ea6',
                    arguments: {
                        DIR: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'directionMenu',
                            defaultValue: '\u53f3\u8f6c'
                        },
                        ANGLE: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 15
                        }
                    }
                },
                {
                    opcode: 'getRotation',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '\u53e6\u4e00\u4e2a\u65cb\u8f6c\u89d2\u5ea6',
                    disableMonitor: false
                },
                {
                    opcode: 'resetRotation',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u91cd\u7f6e\u53e6\u4e00\u4e2a\u65cb\u8f6c'
                },
                '---',
                {
                    opcode: 'setSecondXY',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u7b2c\u4e8cx\u8bbe\u4e3a [X] \u7b2c\u4e8cy\u8bbe\u4e3a [Y]',
                    arguments: {
                        X: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        Y: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'changeSecondXY',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u7b2c\u4e8cx\u589e\u52a0 [DX] \u7b2c\u4e8cy\u589e\u52a0 [DY]',
                    arguments: {
                        DX: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 10
                        },
                        DY: {
                            type: Scratch.ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'getSecondX',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '\u7b2c\u4e8cx'
                },
                {
                    opcode: 'getSecondY',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '\u7b2c\u4e8cy'
                },
                {
                    opcode: 'resetSecondXY',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u91cd\u7f6e\u7b2c\u4e8cx\u548c\u7b2c\u4e8cy'
                }
            ],
            menus: {
                directionMenu: {
                    acceptReporters: false,
                    items: ['\u53f3\u8f6c', '\u5de6\u8f6c']
                }
            }
        };
    };

    AnotherRotation.prototype.setRotation = function(args, util) {
        var target = util.target;
        var angle = Scratch.Cast.toNumber(args.ANGLE);
        angle = ((angle % 360) + 360) % 360;
        if (angle > 180) angle -= 360;
        rotationData[target.id] = angle;
        applyAnotherRotation(target);
        target.runtime.requestRedraw();
    };

    AnotherRotation.prototype.changeRotation = function(args, util) {
        var target = util.target;
        var current = rotationData[target.id] || 0;
        var change = Scratch.Cast.toNumber(args.ANGLE);
        if (args.DIR === '\u5de6\u8f6c') change = -change;
        var newAngle = current + change;
        newAngle = ((newAngle % 360) + 360) % 360;
        if (newAngle > 180) newAngle -= 360;
        rotationData[target.id] = newAngle;
        applyAnotherRotation(target);
        target.runtime.requestRedraw();
    };

    AnotherRotation.prototype.getRotation = function(args, util) {
        return rotationData[util.target.id] || 0;
    };

    AnotherRotation.prototype.resetRotation = function(args, util) {
        var target = util.target;
        delete rotationData[target.id];
        if (target.renderer && target.drawableID !== null) {
            var result = target._getRenderedDirectionAndScale();
            target.renderer.updateDrawableDirectionScale(target.drawableID, result.direction, result.scale);
            target.runtime.requestRedraw();
        }
    };

    AnotherRotation.prototype.setSecondXY = function(args, util) {
        var target = util.target;
        var x = Scratch.Cast.toNumber(args.X);
        var y = Scratch.Cast.toNumber(args.Y);
        secondXY[target.id] = {x: x, y: y};
        applySecondXY(target);
        target.runtime.requestRedraw();
    };

    AnotherRotation.prototype.changeSecondXY = function(args, util) {
        var target = util.target;
        var current = secondXY[target.id] || {x: 0, y: 0};
        var dx = Scratch.Cast.toNumber(args.DX);
        var dy = Scratch.Cast.toNumber(args.DY);
        secondXY[target.id] = {x: current.x + dx, y: current.y + dy};
        applySecondXY(target);
        target.runtime.requestRedraw();
    };

    AnotherRotation.prototype.getSecondX = function(args, util) {
        var data = secondXY[util.target.id];
        return data ? data.x : 0;
    };

    AnotherRotation.prototype.getSecondY = function(args, util) {
        var data = secondXY[util.target.id];
        return data ? data.y : 0;
    };

    AnotherRotation.prototype.resetSecondXY = function(args, util) {
        var target = util.target;
        delete secondXY[target.id];
        if (target.renderer && target.drawableID !== null) {
            target.renderer.updateDrawablePosition(target.drawableID, [target.x, target.y]);
            target.runtime.requestRedraw();
        }
    };

    if (Scratch.extensions.unsandboxed) {
        Scratch.extensions.register(new AnotherRotation());
    } else {
        alert('\u9700\u8981\u5728\u975e\u6c99\u76f2\u6a21\u5f0f\u4e0b\u8fd0\u884c');
        Scratch.extensions.register(new AnotherRotation());
    }
})();