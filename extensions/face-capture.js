// Name: 面部捕捉
// ID: faceCapture
// Description: 用摄像头实时捕捉面部动作，输出头部姿态、眼睛开合、嘴型等数据。
// By: 你的名字 <https://github.com/你的用户名>
// License: CC-BY-NC-4.0

(function (Scratch) {
  "use strict";
  if (!Scratch.extensions.unsandboxed) {
    throw new Error("需要 TurboWarp 非沙箱扩展模式");
  }

  /*
   * 复用 zkcpku/live2d-face-release 中的 lib/face_mesh.js 和 lib/kalidokit.umd.js
   * 上游许可证：非商用
   */

  const LIB_BASE  = "https://cdn.jsdelivr.net/gh/zkcpku/live2d-face-release@main/lib/";
  const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/";

  const OVERLAY_ID = "__face_loading_overlay__";
  let overlayEl = null;
  let barEl = null;
  let pctEl = null;
  let textEl = null;
  let fakeTimer = null;
  let currentPct = 0;

  function buildOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
      return document.getElementById(OVERLAY_ID);
    }
    const ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    ov.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483600;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      width: 320px; padding: 24px 24px 20px;
      background: #1a1d24; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      border: 1px solid #2b2f3a; color: #eaeef5;
    `;

    const title = document.createElement("div");
    title.textContent = "面部捕捉";
    title.style.cssText = "font-size: 17px; font-weight: 600; margin-bottom: 6px;";

    textEl = document.createElement("div");
    textEl.textContent = "准备中…";
    textEl.style.cssText = "font-size: 13px; color: #98a2b3; margin-bottom: 14px; min-height: 18px;";

    const barBg = document.createElement("div");
    barBg.style.cssText = `
      width: 100%; height: 8px; background: #2a2f3a;
      border-radius: 6px; overflow: hidden;
    `;

    barEl = document.createElement("div");
    barEl.style.cssText = `
      width: 0%; height: 100%; background: linear-gradient(90deg, #4C97FF, #FF6680);
      transition: width 0.25s ease; border-radius: 6px;
    `;
    barBg.appendChild(barEl);

    pctEl = document.createElement("div");
    pctEl.textContent = "0%";
    pctEl.style.cssText = "font-size: 12px; color: #98a2b3; text-align: right; margin-top: 6px;";

    box.appendChild(title);
    box.appendChild(textEl);
    box.appendChild(barBg);
    box.appendChild(pctEl);
    ov.appendChild(box);
    document.body.appendChild(ov);
    return ov;
  }

  function showOverlay() {
    if (!document.body) return;
    overlayEl = buildOverlay();
    overlayEl.style.display = "flex";
    setProgress(0, "准备中…");
  }

  function setProgress(pct, text) {
    currentPct = Math.max(0, Math.min(100, pct));
    if (barEl) barEl.style.width = currentPct + "%";
    if (pctEl) pctEl.textContent = Math.round(currentPct) + "%";
    if (textEl && text != null) textEl.textContent = text;
  }

  function startFakeProgress(from, to, text) {
    stopFakeProgress();
    setProgress(from, text);
    fakeTimer = setInterval(() => {
      if (currentPct >= to) {
        stopFakeProgress();
        return;
      }
      const remain = to - currentPct;
      setProgress(currentPct + Math.max(0.3, remain * 0.06));
    }, 200);
  }

  function stopFakeProgress() {
    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null; }
  }

  function hideOverlay(delay = 250) {
    stopFakeProgress();
    setProgress(100, "完成");
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = barEl = pctEl = textEl = null;
    }, delay);
  }

  function failOverlay(msg) {
    stopFakeProgress();
    if (textEl) { textEl.textContent = "失败：" + msg; textEl.style.color = "#ff6b6b"; }
    if (barEl) barEl.style.background = "#ff6b6b";
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = barEl = pctEl = textEl = null;
    }, 2000);
  }

  function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = res;
      s.onerror = () => rej(new Error("加载失败 " + url));
      document.head.appendChild(s);
    });
  }
  function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  class FaceExtension {
    constructor() {
      this.video = null;
      this.faceMesh = null;
      this.running = false;
      this.busy = false;
      this.lastSend = 0;
      this.last = this.empty();
      this.lm = null;
      this.smoothEyeL = 1;
      this.smoothEyeR = 1;
      this.invertPitch = false;
      this.invertYaw = true;
      this.invertRoll = false;
      this.libsLoaded = false;
    }

    getInfo() {
      return {
        id: "faceCapture",
        name: "面部捕捉",
        color1: "#FF6680",
        color2: "#CC4D66",
        blocks: [
          { opcode: "start", blockType: Scratch.BlockType.COMMAND, text: "启动面部捕捉" },
          { opcode: "stop",  blockType: Scratch.BlockType.COMMAND, text: "停止面部捕捉" },
          { opcode: "isRunning", blockType: Scratch.BlockType.BOOLEAN, text: "正在运行？" },
          { opcode: "hasFace",   blockType: Scratch.BlockType.BOOLEAN, text: "检测到人脸？" },
          "---",
          { opcode: "headPitch", blockType: Scratch.BlockType.REPORTER, text: "头部 上下（抬头为正）" },
          { opcode: "headYaw",   blockType: Scratch.BlockType.REPORTER, text: "头部 左右（左转为正）" },
          { opcode: "headRoll",  blockType: Scratch.BlockType.REPORTER, text: "头部 倾斜（右歪为正）" },
          { opcode: "headPosX",  blockType: Scratch.BlockType.REPORTER, text: "头部位置 X" },
          { opcode: "headPosY",  blockType: Scratch.BlockType.REPORTER, text: "头部位置 Y" },
          "---",
          { opcode: "eyeL", blockType: Scratch.BlockType.REPORTER, text: "左眼开合 0~1" },
          { opcode: "eyeR", blockType: Scratch.BlockType.REPORTER, text: "右眼开合 0~1" },
          { opcode: "isBlinking", blockType: Scratch.BlockType.BOOLEAN, text: "正在眨眼？" },
          "---",
          { opcode: "mouthOpen", blockType: Scratch.BlockType.REPORTER, text: "嘴巴张开程度" },
          { opcode: "mouthX",    blockType: Scratch.BlockType.REPORTER, text: "嘴巴横向偏移" },
          { opcode: "mouthShape", blockType: Scratch.BlockType.REPORTER,
            text: "嘴型 [V]",
            arguments: { V: { type: Scratch.ArgumentType.STRING, menu: "vowels" } }
          },
          "---",
          { opcode: "debug", blockType: Scratch.BlockType.REPORTER, text: "调试信息" }
        ],
        menus: {
          vowels: { acceptReporters: true, items: ["A", "E", "I", "O", "U"] }
        }
      };
    }

    empty() {
      return {
        eye: { l: 1, r: 1 },
        mouth: { x: 0, y: 0, shape: { A: 0, E: 0, I: 0, O: 0, U: 0 } },
        head: {
          x: 0, y: 0, z: 0,
          degrees: { x: 0, y: 0, z: 0 },
          position: { x: 0, y: 0, z: 0 },
          width: 0, height: 0
        }
      };
    }

    async start() {
      if (this.running) return;

      showOverlay();

      try {
        if (!this.libsLoaded) {
          setProgress(5, "加载 face_mesh.js…");
          await loadScript(LIB_BASE + "face_mesh.js");
          setProgress(25, "加载 kalidokit…");
          await loadScript(LIB_BASE + "kalidokit.umd.js");
          setProgress(40, "库加载完成");
          this.libsLoaded = true;
        } else {
          setProgress(40, "库已缓存");
        }

        if (typeof window.FaceMesh !== "function" ||
            typeof window.Kalidokit?.Face?.solve !== "function") {
          throw new Error("库未加载成功");
        }

        setProgress(50, "请求摄像头权限…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360 }, audio: false
        });

        if (!this.video) {
          this.video = document.createElement("video");
          this.video.autoplay = true;
          this.video.muted = true;
          this.video.playsInline = true;
          Object.assign(this.video.style, {
            position: "fixed", left: "-9999px", top: "-9999px",
            width: "1px", height: "1px"
          });
          document.body.appendChild(this.video);
        }
        this.video.srcObject = stream;
        await this.video.play();
        setProgress(60, "摄像头就绪");

        startFakeProgress(60, 95, "加载 MediaPipe 模型…");

        this.faceMesh = new window.FaceMesh({
          locateFile: f => WASM_BASE + f
        });
        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(r => {
          const lm = r.multiFaceLandmarks?.[0];
          if (!lm) { this.lm = null; this.last = this.empty(); return; }
          this.lm = lm;
          try {
            this.last = window.Kalidokit.Face.solve(lm, {
              runtime: "mediapipe",
              video: this.video
            });
          } catch (e) {}
        });

        try { await this.faceMesh.send({ image: this.video }); } catch (e) {}

        stopFakeProgress();
        setProgress(95, "初始化检测循环…");

        this.running = true;
        this.busy = false;
        this.lastSend = 0;

        const loop = async () => {
          if (!this.running) return;
          const now = performance.now();
          if (!this.busy && now - this.lastSend > 33 && this.video.readyState >= 2) {
            this.busy = true;
            this.lastSend = now;
            try { await this.faceMesh.send({ image: this.video }); } catch (e) {}
            this.busy = false;
          }
          requestAnimationFrame(loop);
        };
        loop();

        hideOverlay();
      } catch (e) {
        this.running = false;
        failOverlay(e.message || String(e));
        throw e;
      }
    }

    stop() {
      this.running = false;
      if (this.video?.srcObject) this.video.srcObject.getTracks().forEach(t => t.stop());
      if (this.video?.parentNode) this.video.parentNode.removeChild(this.video);
      this.video = null;
      this.faceMesh = null;
      this.lm = null;
      this.last = this.empty();
    }

    isRunning() { return this.running; }
    hasFace() { return !!this.lm; }

    headPitch() {
      const v = num(this.last.head?.degrees?.x);
      return this.invertPitch ? -v : v;
    }
    headYaw() {
      const v = num(this.last.head?.degrees?.y);
      return this.invertYaw ? -v : v;
    }
    headRoll() {
      const v = num(this.last.head?.degrees?.z);
      return this.invertRoll ? -v : v;
    }
    headPosX() {
      return num(this.last.head?.position?.x);
    }
    headPosY() {
      return num(this.last.head?.position?.y);
    }

    _ear(upperIdx, lowerIdx, innerIdx, outerIdx) {
      const lm = this.lm;
      if (!lm) return 0;
      const up = lm[upperIdx], lo = lm[lowerIdx];
      const a = lm[innerIdx], b = lm[outerIdx];
      if (!up || !lo || !a || !b) return 0;
      const h = Math.abs(up.y - lo.y);
      const w = Math.abs(a.x - b.x) || 0.001;
      return h / w;
    }

    eyeL() {
      const ear = this._ear(386, 374, 362, 263);
      const open = clamp((ear - 0.05) / 0.20, 0, 1);
      this.smoothEyeL = this.smoothEyeL * 0.5 + open * 0.5;
      return this.smoothEyeL;
    }
    eyeR() {
      const ear = this._ear(159, 145, 133, 33);
      const open = clamp((ear - 0.05) / 0.20, 0, 1);
      this.smoothEyeR = this.smoothEyeR * 0.5 + open * 0.5;
      return this.smoothEyeR;
    }
    isBlinking() { return this.eyeL() < 0.4 && this.eyeR() < 0.4; }

    mouthOpen() { return num(this.last.mouth?.y); }
    mouthX()    { return num(this.last.mouth?.x); }
    mouthShape(args) {
      return num(this.last.mouth?.shape?.[String(args.V || "A").toUpperCase()]);
    }

    debug() {
      if (!this.lm) return "无人脸";
      return JSON.stringify({
        posX: num(this.last.head?.position?.x),
        posY: num(this.last.head?.position?.y),
        posZ: num(this.last.head?.position?.z),
        width: num(this.last.head?.width),
        height: num(this.last.head?.height),
        headDeg: this.last.head?.degrees
      });
    }
  }

  Scratch.extensions.register(new FaceExtension());
})(Scratch);