// Name: SVG 翻译器
// ID: svgTranslator
// Description: 自动替换 SVG 造型中 {{标记}} 的文本，支持多行换行，可随时取消翻译
// Version: v3 (fixes: cancelAll destroys skins, unit detection, cross-language skin eviction)
// License: MIT

(function (Scratch) {
  "use strict";

  const vm = Scratch.vm;
  const runtime = vm.runtime;
  const renderer = runtime.renderer;
  const Cast = Scratch.Cast;

  /* ---------------- LRU 缓存（仅用于纯文本） ---------------- */
  function createLRUCache(maxSize) {
    const cache = new Map();
    return {
      get(key) {
        if (!cache.has(key)) return undefined;
        const val = cache.get(key);
        cache.delete(key);
        cache.set(key, val);
        return val;
      },
      set(key, value) {
        if (cache.has(key)) {
          cache.delete(key);
        } else if (cache.size >= maxSize) {
          const oldest = cache.keys().next().value;
          cache.delete(oldest);
        }
        cache.set(key, value);
      },
      clear() { cache.clear(); },
      get size() { return cache.size; }
    };
  }

  const BACKTRACE_DEPTH = 5;

  const originalSvgCache = createLRUCache(200);
  const translatedSkins = new Map();
  const decodeQueue = new Map();

  /* ---------------- 异步解码队列 ---------------- */
  async function getOriginalSvg(costume) {
    const assetId = costume.assetId;
    const cached = originalSvgCache.get(assetId);
    if (cached) return cached;
    if (decodeQueue.has(assetId)) return decodeQueue.get(assetId);

    const decodePromise = (async () => {
      try {
        const svgText = await costume.asset.decodeText();
        originalSvgCache.set(assetId, svgText);
        return svgText;
      } catch (e) {
        console.error("[SVG Translator] Failed to read SVG:", e);
        throw e;
      } finally {
        decodeQueue.delete(assetId);
      }
    })();

    decodeQueue.set(assetId, decodePromise);
    return decodePromise;
  }

  /* ---------------- 核心 createSVGSkin（带 onload 劫持） ---------------- */
  const createSVGSkin = (...args) => {
    const skinId = renderer.createSVGSkin(...args);
    if (!skinId) return;
    const svgSkin = renderer._allSkins[skinId];
    if (!svgSkin) return;

    const _onload = svgSkin._svgImage.onload;
    svgSkin._svgImage.onload = function (ev) {
      if (!this._size) throw "_size race";
      if (this._size[0] === 0 || this._size[1] === 0) {
        Object.getPrototypeOf(
          vm.renderer.exports.SVGSkin
        ).prototype.setEmptyImageData.call(this);
        return;
      }
      const maxDimension = Math.ceil(Math.max(this._size[0], this._size[1]));
      const rendererMax = this._renderer.maxTextureDimension;
      let testScale = 2;
      for (
        testScale;
        maxDimension * testScale <= rendererMax;
        testScale = testScale * 2
      ) {
        this._maxTextureScale = testScale;
      }
      this.resetMIPs();
      const rotationCenter = this.calculateRotationCenter();
      if (!Array.isArray(rotationCenter)) throw "rotationCenter race";
      if (!Array.isArray(this._rotationCenter)) this._rotationCenter = [0, 0];
      return _onload.call(this, ev);
    }.bind(svgSkin);

    return skinId;
  };

  function createSVGSkinSafe(svgText, rotationCenter) {
    try {
      return createSVGSkin(svgText, rotationCenter);
    } catch (e) {
      console.error("[SVG Translator] createSVGSkin error:", e);
      return null;
    }
  }

  const waitForSkin = (skinId) =>
    new Promise((resolve) => {
      const skin = renderer._allSkins[skinId];
      if (!skin || !skin._svgImage) return resolve();
      if (skin._svgImageLoaded) return resolve();
      skin._svgImage.addEventListener("load", () => resolve(), { once: true });
      skin._svgImage.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 5000);
    });

  class SVGTranslator {
    constructor() {
      this.translations = {};
      this.currentLang = "zh";
      this._translatedTargets = new Set();
      this._ensurePatched();
    }

    /* ---------------- 原型补丁（可重复调用） ---------------- */
    _ensurePatched() {
      const self = this;
      const classes = new Set();
      try {
        for (const t of runtime.targets || []) {
          if (t && t.constructor) classes.add(t.constructor);
        }
      } catch (e) {
        console.warn("[SVG Translator] Failed to enumerate targets:", e);
      }
      for (const cls of classes) {
        if (!cls || cls._svgTranslatorPatched) continue;
        try {
          const proto = cls.prototype;
          if (!proto || typeof proto.updateAllDrawableProperties !== "function")
            continue;
          const original = proto.updateAllDrawableProperties;
          proto.updateAllDrawableProperties = function () {
            original.call(this);
            if (!self._translatedTargets.has(this)) return;
            self._reapplyIfTranslated(this);
          };
          cls._svgTranslatorPatched = true;
        } catch (e) {
          console.warn("[SVG Translator] Prototype patch failed:", e);
        }
      }
    }

    getInfo() {
      return {
        id: "svgTranslator",
        name: "SVG 翻译器",
        color1: "#4C97FF",
        color2: "#3373CC",
        blocks: [
          {
            opcode: "loadTranslations",
            blockType: Scratch.BlockType.COMMAND,
            text: "加载翻译 JSON [JSON]",
            arguments: {
              JSON: {
                type: Scratch.ArgumentType.STRING,
                defaultValue:
                  '{"zh":{"btn":"开始","title":"菜单","welcome":["欢迎来到","我的游戏"]},"en":{"btn":"Start","title":"Menu","welcome":["Welcome to","My Game"]}}',
              },
            },
          },
          {
            opcode: "setLanguage",
            blockType: Scratch.BlockType.COMMAND,
            text: "切换到语言 [LANG]（翻译所有角色和舞台）",
            arguments: {
              LANG: { type: Scratch.ArgumentType.STRING, defaultValue: "zh" },
            },
          },
          {
            opcode: "cancelAll",
            blockType: Scratch.BlockType.COMMAND,
            text: "取消所有翻译（还原全部角色和舞台）",
          },
          "---",
          {
            opcode: "getLanguage",
            blockType: Scratch.BlockType.REPORTER,
            text: "当前语言",
          },
        ],
      };
    }

    /* ---------------- 积木实现 ---------------- */

    loadTranslations(args) {
      try {
        this.translations = JSON.parse(Cast.toString(args.JSON));
        console.log(
          "[SVG Translator] Loaded translations:",
          Object.keys(this.translations)
        );
      } catch (e) {
        console.error("[SVG Translator] JSON parse failed:", e);
      }
    }

    async setLanguage(args) {
      try {
        this.currentLang = Cast.toString(args.LANG);
        console.log("[SVG Translator] Switching to language:", this.currentLang);
        this._ensurePatched();
        await this._refreshAll();
        // ★ 翻译完成后再清理其它语言的皮肤（此时不再使用）
        this._evictOtherLanguages();
      } catch (e) {
        console.error("[SVG Translator] Language switch failed:", e);
      }
    }

    cancelAll() {
      try {
        console.log("[SVG Translator] Cancelling all translations");

        for (const target of runtime.targets || []) {
          if (!target) continue;
          this._translatedTargets.delete(target);
          try {
            if (typeof target.setCostume === "function") {
              target.setCostume(target.currentCostume);
            } else if (
              typeof target.updateAllDrawableProperties === "function"
            ) {
              target.updateAllDrawableProperties();
            }
          } catch (e) {
            console.warn("[SVG Translator] Cancel target error:", e);
          }
        }

        // ★ 关键修复：销毁所有翻译 skin，避免孤儿化
        for (const skinId of translatedSkins.values()) {
          try {
            if (renderer._allSkins && renderer._allSkins[skinId]) {
              renderer.destroySkin(skinId);
            }
          } catch (e) {
            console.warn("[SVG Translator] destroySkin failed:", e);
          }
        }
        translatedSkins.clear();
        originalSvgCache.clear();
        this._translatedTargets = new Set();

        console.log("[SVG Translator] All translations cancelled, skins destroyed");
      } catch (e) {
        console.error("[SVG Translator] Cancel failed:", e);
      }
    }

    getLanguage() {
      return this.currentLang;
    }

    /* ---------------- 内部工具 ---------------- */

    // ★ 新增：清理其它语言的翻译皮肤
    _evictOtherLanguages() {
      const suffix = "_" + this.currentLang;
      const toDestroy = [];
      for (const [key, skinId] of translatedSkins) {
        if (!key.endsWith(suffix)) {
          toDestroy.push([key, skinId]);
        }
      }
      for (const [key, skinId] of toDestroy) {
        try {
          if (renderer._allSkins && renderer._allSkins[skinId]) {
            renderer.destroySkin(skinId);
          }
        } catch (e) {
          console.warn("[SVG Translator] destroySkin (evict) failed:", e);
        }
        translatedSkins.delete(key);
      }
      if (toDestroy.length) {
        console.log(
          "[SVG Translator] Evicted",
          toDestroy.length,
          "skin(s) from other languages"
        );
      }
    }

    _setDrawableSkin(target, skinId) {
      try {
        if (typeof renderer.updateDrawableSkinId === "function") {
          renderer.updateDrawableSkinId(target.drawableID, skinId);
        } else {
          const drawable =
            renderer._allDrawables && renderer._allDrawables[target.drawableID];
          if (drawable)
            drawable.skin = renderer._allSkins && renderer._allSkins[skinId];
        }
      } catch (e) {
        console.warn("[SVG Translator] Set skin failed:", e);
      }
    }

    async _refreshAll() {
      this._translatedTargets.clear();
      try {
        for (const target of runtime.targets || []) {
          if (target && target.isOriginal) {
            try {
              await this._translateTarget(target);
            } catch (e) {
              console.warn("[SVG Translator] Translate target failed:", e);
            }
          }
        }
        console.log(
          "[SVG Translator] Refresh complete, translated",
          this._translatedTargets.size,
          "targets"
        );
      } catch (e) {
        console.error("[SVG Translator] _refreshAll error:", e);
      }
    }

    async _translateTarget(target) {
      try {
        const costumes = target.getCostumes();
        if (!costumes || costumes.length === 0) return;
        const costume = costumes[target.currentCostume];
        if (!costume || costume.dataFormat !== "svg" || !costume.asset) return;
        await this._applySkin(target, costume);
      } catch (e) {
        console.warn("[SVG Translator] _translateTarget error:", e);
      }
    }

    async _applySkin(target, costume) {
      const assetId = costume.assetId;

      let originalSvg;
      try {
        originalSvg = await getOriginalSvg(costume);
      } catch (e) {
        console.warn("[SVG Translator] Failed to get original SVG:", e);
        return;
      }

      if (!/\{\{[\w\-.]+\}\}/.test(originalSvg)) return;

      const cacheKey = `${assetId}_${this.currentLang}`;
      let skinId = translatedSkins.get(cacheKey);

      if (!skinId || !renderer._allSkins[skinId]) {
        let translatedSvg = this._translateSVG(originalSvg);
        translatedSvg = this._enforceSize(translatedSvg, costume);

        const rc =
          costume.rotationCenterX != null && costume.rotationCenterY != null
            ? [costume.rotationCenterX, costume.rotationCenterY]
            : null;

        skinId = createSVGSkinSafe(translatedSvg, rc);
        if (!skinId) {
          console.error(
            "[SVG Translator] Failed to create skin for asset:",
            assetId
          );
          return;
        }
        translatedSkins.set(cacheKey, skinId);

        try {
          await waitForSkin(skinId);
        } catch (e) {
          console.warn("[SVG Translator] waitForSkin timed out:", e);
        }
      }

      if (!renderer._allSkins || !renderer._allSkins[skinId]) return;
      this._setDrawableSkin(target, skinId);
      this._translatedTargets.add(target);
    }

    /* ---------------- SVG 尺寸修正 ---------------- */
    _enforceSize(svgText, costume) {
      let size;
      try { size = costume.size; } catch (e) { return svgText; }
      if (!size || !size[0] || !size[1]) return svgText;

      const w = Math.ceil(size[0]);
      const h = Math.ceil(size[1]);

      const match = svgText.match(/<svg\b([^>]*)>/);
      if (!match) return svgText;

      const attrs = match[1];

      const getWidth = (a) => {
        const m = a.match(/\s+width="([^"]*)"/) || a.match(/^width="([^"]*)"/);
        return m ? m[1] : null;
      };
      const getHeight = (a) => {
        const m = a.match(/\s+height="([^"]*)"/) || a.match(/^height="([^"]*)"/);
        return m ? m[1] : null;
      };

      const existingWidth = getWidth(attrs);
      const existingHeight = getHeight(attrs);

      // ★ 修正：去掉 em / ex（它们是相对单位），并支持裸数字
      const isAbsoluteUnit = (val) =>
        /^[\d.]+(?:px|pt|cm|mm|in|pc)?$/.test(val) && /[\d.]/.test(val);

      const needWidth = !existingWidth || !isAbsoluteUnit(existingWidth);
      const needHeight = !existingHeight || !isAbsoluteUnit(existingHeight);

      if (!needWidth && !needHeight) return svgText;

      let newAttrs = attrs
        .replace(/\s+width="[^"]*"/gi, "")
        .replace(/\s+height="[^"]*"/gi, "")
        .replace(/^width="[^"]*"/gi, "")
        .replace(/^height="[^"]*"/gi, "");

      if (needWidth) newAttrs += ` width="${w}"`;
      if (needHeight) newAttrs += ` height="${h}"`;

      const newTag = `<svg${newAttrs}>`;
      return svgText.replace(/<svg\b[^>]*>/, newTag);
    }

    _reapplyIfTranslated(target) {
      if (!target) return;
      try {
        const costumes = target.getCostumes();
        if (!costumes) return;
        const costume = costumes[target.currentCostume];
        if (!costume || costume.dataFormat !== "svg") return;
        const key = costume.assetId + "_" + this.currentLang;
        const skinId = translatedSkins.get(key);
        if (!skinId || !renderer._allSkins || !renderer._allSkins[skinId]) return;
        this._setDrawableSkin(target, skinId);
      } catch (e) {
        console.warn("[SVG Translator] _reapplyIfTranslated error:", e);
      }
    }

    /* ---------------- SVG 文本替换 ---------------- */
    _translateSVG(svgText) {
      const langData = this.translations[this.currentLang] || {};
      let result = svgText;

      const markers = new Set();
      const re = /\{\{([\w\-.]+)\}\}/g;
      let m;
      while ((m = re.exec(svgText)) !== null) markers.add(m[1]);

      for (const key of markers) {
        const val = langData[key];
        if (val === undefined) continue;

        if (typeof val === "string") {
          result = result.replace(
            new RegExp("\\{\\{" + this._escapeRegex(key) + "\\}\\}", "g"),
            this._escapeXml(val)
          );
        } else if (Array.isArray(val)) {
          result = this._replaceArrayMarker(result, key, val);
        }
      }
      return result;
    }

    _replaceArrayMarker(svgText, key, lines) {
      const escapedKey = this._escapeRegex(key);
      const re = new RegExp("\\{\\{" + escapedKey + "\\}\\}", "g");
      let out = "";
      let lastIndex = 0;
      let m;
      while ((m = re.exec(svgText)) !== null) {
        out += svgText.slice(lastIndex, m.index);
        out += this._buildTspansAt(svgText, m.index, lines);
        lastIndex = m.index + m[0].length;
      }
      out += svgText.slice(lastIndex);
      return out;
    }

    _buildTspansAt(svgText, offset, lines) {
      const before = svgText.slice(0, offset);

      let x = null;
      let y = null;
      let fontSize = 12;
      let anchor = null;

      const re = /<(text|tspan)\b([^>]*)>/g;
      const attrsList = [];
      let m;
      while ((m = re.exec(before)) !== null) attrsList.push(m[2]);

      for (const attrs of attrsList.slice(-BACKTRACE_DEPTH)) {
        const xm = attrs.match(/\sx="([^"]*)"/);
        if (xm) x = xm[1];
        const ym = attrs.match(/\sy="([^"]*)"/);
        if (ym) y = ym[1];
        const fm = attrs.match(/font-size\s*[:=]\s*["']?([\d.]+)/);
        if (fm) fontSize = parseFloat(fm[1]);
        const am = attrs.match(/text-anchor\s*[:=]\s*["']?([^"';]+)/);
        if (am) anchor = am[1].trim();
      }

      if (x === null) x = "0";
      const lineHeight = fontSize * 1.25;

      let out = "";
      for (let i = 0; i < lines.length; i++) {
        const attrs = [`x="${x}"`];
        if (y !== null) {
          const yNum = parseFloat(y) + i * lineHeight;
          attrs.push(`y="${yNum}"`);
        } else if (i > 0) {
          attrs.push(`dy="${lineHeight}"`);
        }
        if (anchor) attrs.push(`text-anchor="${anchor}"`);
        out += `<tspan ${attrs.join(" ")}>${this._escapeXml(lines[i])}</tspan>`;
      }
      return out;
    }

    _escapeXml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    _escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }

  Scratch.extensions.register(new SVGTranslator());
})(Scratch);
