import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { QualitySettings } from './quality.ts'
import { stoneReliefNormal } from './textures.ts'
import { TIME_OF_DAY, type TimeOfDay } from '../config.ts'
import fuPanelUrl from '../assets/fu-yingbi.png'

/**
 * 「庭院秋夜」环境（移植自独立的微缩庭院 diorama）。
 * 场景内容按原文件逐字保留：夜空、星、月、月洞门、院墙、大门、正房、厢房、
 * 石径、树、夜灯、落叶、烟、尘与描边；此处只把它包成可注入的模块。
 *
 * 与游戏道具对接的高度基准：庭院地坪 y=0 对齐到 GROUND_Y（石桌、石凳、石灯笼的既有基准）。
 */
export interface NightCourt {
  /** 环境根节点（已按 GROUND_Y 下移，与石桌对齐） */
  root: THREE.Group
  update(dt: number): void
  render(): void
  setSize(width: number, height: number): void
  /** 大门开合：0 = 关闭，1 = 全开 */
  setGateOpen(progress: number): void
  /** 切换昼夜（会即时重配天空、灯光、环境反射、雾、Bloom 与灯火亮度） */
  setTimeOfDay(next: TimeOfDay): void
  timeOfDay(): TimeOfDay
}

/** 与 src/art/stoneSet.ts 中的石桌基准一致 */
const GROUND_Y = -7.2

/**
 * 庭院整体缩放。石桌与棂笼保持原尺寸，因此院子放大后建筑才压得住场，
 * 不再出现「一只盒子塞满院子」的观感。
 */
export const COURT_SCALE = 2.7

/** 「福」影壁贴图的宽高比（src/assets/fu-yingbi.png 实际像素 454×437） */
const FU_PANEL_ASPECT = 454 / 437

/**
 * 白日 / 夜里的整套舞台参数。切换时段只需替换这一份数据，
 * 天空着色器、灯光、环境反射、雾、Bloom 与灯火亮度都从这里取。
 */
interface StagePalette {
  bg: number
  fog: number
  fogDensity: number
  /** 天空里的发光体方向（夜=月亮，昼=太阳） */
  bodyDir: THREE.Vector3
  sky: {
    top: THREE.Color
    mid: THREE.Color
    hor: THREE.Color
    glow: THREE.Color
    halo: THREE.Color
    disc: THREE.Color
    /** 中层天空起始 / 顶层起始 / 顶层结束 */
    curve: THREE.Vector3
  }
  key: { color: number; intensity: number; dir: THREE.Vector3 }
  hemi: { sky: number; ground: number; intensity: number }
  fill: { color: number; intensity: number }
  envIntensity: number
  envStops: Array<[string, number]>
  envGlow: { core: string; edge: string }
  bloom: number
  /** 灯笼 / 火盆亮度系数：白天基本熄灯 */
  lampScale: number
  exposure: number
}

const STAGE: Record<TimeOfDay, StagePalette> = {
  night: {
    bg: 0x060b14,
    fog: 0x060b14,
    fogDensity: 0.0046,
    bodyDir: new THREE.Vector3(-46, 13.3, -60).normalize(),
    sky: {
      top: new THREE.Color(0.0022, 0.0042, 0.0135),
      mid: new THREE.Color(0.0068, 0.0125, 0.03),
      hor: new THREE.Color(0.026, 0.034, 0.052),
      glow: new THREE.Color(0.03, 0.016, 0.007),
      halo: new THREE.Color(0.34, 0.44, 0.7),
      disc: new THREE.Color(1.32, 1.36, 1.42),
      curve: new THREE.Vector3(0.2, 0.16, 0.82),
    },
    key: { color: 0xbccdf2, intensity: 1.34, dir: new THREE.Vector3(-42, 50, 47).normalize() },
    hemi: { sky: 0x2b4468, ground: 0x120e09, intensity: 0.33 },
    fill: { color: 0x4a6791, intensity: 0.26 },
    envIntensity: 0.38,
    envStops: [
      ['#070c18', 0],
      ['#0e1a30', 0.36],
      ['#22304a', 0.5],
      ['#3a3128', 0.58],
      ['#1b1610', 0.72],
      ['#0a0806', 1],
    ],
    envGlow: { core: 'rgba(255,158,74,0.34)', edge: 'rgba(255,150,70,0)' },
    bloom: 0.42,
    lampScale: 1,
    exposure: 1.12,
  },
  day: {
    /* 傍晚四五点钟：金黄主导的天色，太阳压得更低更偏西 */
    bg: 0xf0d08e,
    fog: 0xf2d8a6,
    fogDensity: 0.0030,
    bodyDir: new THREE.Vector3(-58, 11, -38).normalize(),
    sky: {
      top: new THREE.Color(0.83, 0.58, 0.24),
      mid: new THREE.Color(0.95, 0.73, 0.38),
      hor: new THREE.Color(0.99, 0.86, 0.58),
      glow: new THREE.Color(0.22, 0.12, 0.04),
      halo: new THREE.Color(1.0, 0.8, 0.46),
      disc: new THREE.Color(3.0, 2.72, 2.15),
      curve: new THREE.Vector3(0.08, 0.14, 0.62),
    },
    // 主光仍放在西南高处：太阳如果也压到 10°，院子会整片背光发黑（风格化取舍）
    key: { color: 0xffd9a2, intensity: 3.3, dir: new THREE.Vector3(-38, 55, 48).normalize() },
    hemi: { sky: 0xf0d5a0, ground: 0x7a6a4c, intensity: 0.5 },
    fill: { color: 0xd6bd8c, intensity: 0.26 },
    envIntensity: 0.72,
    envStops: [
      ['#e2a94e', 0],
      ['#f0c577', 0.36],
      ['#f7e0b0', 0.5],
      ['#e8d6ab', 0.58],
      ['#b2a077', 0.72],
      ['#77694e', 1],
    ],
    envGlow: { core: 'rgba(255,238,200,0.34)', edge: 'rgba(255,238,200,0)' },
    bloom: 0.26,
    lampScale: 0.14,
    exposure: 0.94,
  },
}

export function createNightCourt(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  quality: QualitySettings,
): NightCourt {
  const root = new THREE.Group()
  root.name = 'night-courtyard'
  root.position.y = GROUND_Y
  root.scale.setScalar(COURT_SCALE)
  scene.add(root)

  let mode: TimeOfDay = TIME_OF_DAY
  const stage = (): StagePalette => STAGE[mode]
  const isDay = (): boolean => mode === 'day'
  const lampScale = (): number => stage().lampScale

  scene.background = new THREE.Color(stage().bg)
  scene.fog = new THREE.FogExp2(stage().fog, stage().fogDensity / COURT_SCALE)

  /* ---------- deterministic rng ---------- */
  let _s = 20261108;
  const rng = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rr = (a: any, b: any) => a + (b - a) * rng();
  const pick = (arr: any) => arr[Math.floor(rng() * arr.length) % arr.length];
  const anims: any[] = []
  /* ---------- sky & ambient body ( moon at night / sun by day ) ---------- */
  /*
   * 天空里的发光体：夜里是压到约 10° 的月亮（挂在正房上方的西北天际，开场全景就能看到）；
   * 白天是同样低挂的太阳，配合大面积暖光晕。
   * 关键光（key light）另取更高仰角——发光体若也压这么低，院子会整片背光发黑（风格化取舍）。
   */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 44, 26),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uBody: { value: stage().bodyDir.clone() },
        uTop: { value: stage().sky.top.clone() },
        uMid: { value: stage().sky.mid.clone() },
        uHor: { value: stage().sky.hor.clone() },
        uGlow: { value: stage().sky.glow.clone() },
        uHalo: { value: stage().sky.halo.clone() },
        uDisc: { value: stage().sky.disc.clone() },
        uCurve: { value: stage().sky.curve.clone() },
        /* 1 = 月面细节（环形山 + 描边）；白天太阳为 0 */
        uDetail: { value: isDay() ? 0 : 1 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uBody, uTop, uMid, uHor, uGlow, uHalo, uDisc, uCurve;
      uniform float uDetail;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHor, uMid, smoothstep(0.0, uCurve.x, h));
        col = mix(col, uTop, smoothstep(uCurve.y, uCurve.z, h));
        float glow = exp(-pow(max(0.0, 1.0 - h * 7.0), 2.0));
        col += uGlow * glow;
        float s = max(dot(d, uBody), 0.0);
        col += uHalo * pow(s, 9.0) * 0.12;
        col += uHalo * pow(s, 260.0) * 0.80;
        /* 发光体本体（角径约 2°）：外圈柔和过渡，内圈高亮，Bloom 会带出光晕 */
        float disc = smoothstep(0.99928, 0.99962, s);
        float limb = smoothstep(0.99890, 0.99928, s);
        col += uHalo * limb * 0.35;
        col = mix(col, uDisc, disc);
        /* 月面细节：以发光体方向为轴取切平面坐标，叠几团「环形山」暗斑 */
        if (uDetail > 0.5) {
          vec3 t1 = normalize(cross(uBody, vec3(0.0, 1.0, 0.02)));
          vec3 t2 = cross(uBody, t1);
          vec2 p = vec2(dot(d, t1), dot(d, t2)) / 0.038;
          float maria = 0.0;
          maria += smoothstep(0.34, 0.05, length(p - vec2(-0.28, 0.22))) * 0.17;
          maria += smoothstep(0.30, 0.04, length(p - vec2(0.19, -0.30))) * 0.14;
          maria += smoothstep(0.24, 0.04, length(p - vec2(0.34, 0.17))) * 0.10;
          maria += smoothstep(0.20, 0.03, length(p - vec2(-0.09, -0.11))) * 0.09;
          col -= col * maria * disc;
          /* 描边：贴着月轮外沿的一圈淡晕环 */
          float ring = smoothstep(0.99868, 0.99888, s) * (1.0 - smoothstep(0.99908, 0.99926, s));
          col += uHalo * ring * 0.55;
        }
        if (d.y < 0.0) col = mix(col, uHor * 0.35, min(-d.y * 4.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`
    })
  );
  root.add(sky);
  const skyMat = sky.material as THREE.ShaderMaterial;

  /* stars */
  let starPoints: THREE.Points | null = null
  {
    const N = 1100;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const y = Math.pow(rng(), 0.62) * 0.985 + 0.015;
      const a = rng() * Math.PI * 2, r = Math.sqrt(Math.max(0, 1 - y * y));
      pos.set([Math.cos(a) * r * 470, y * 470, Math.sin(a) * r * 470], i * 3);
      sd[i] = rng(); sz[i] = rr(1.1, 3.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const sm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uT: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `uniform float uT, uPx; attribute float aSeed; attribute float aSize; varying float vA;
      void main(){
        float tw = 0.55 + 0.45 * sin(uT * (0.7 + aSeed * 1.8) + aSeed * 41.0);
        vA = (0.45 + 0.55 * tw) * (0.5 + 0.5 * aSeed) * 1.35;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx * (1.0 + 0.35 * tw);
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.02, d) * vA;
        gl_FragColor = vec4(vec3(0.82, 0.88, 1.0), a);
      }`
    });
    const stars = new THREE.Points(g, sm);
    stars.frustumCulled = false;
    stars.visible = !isDay();
    starPoints = stars;
    root.add(stars);
    anims.push((t: any) => { sm.uniforms.uT.value = t; });
  }

  /* ---------- clouds (day only) ---------- */
  const clouds = new THREE.Group();
  clouds.visible = isDay();
  root.add(clouds);
  {
    /* 远景：Canvas 贴图软云，钉在天空穹壳内侧（浓度要够，否则化在金色天里） */
    const makeCloudTexture = () => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d')!;
      for (let i = 0; i < 34; i++) {
        const x = 36 + rng() * 184, y = 44 + rng() * 40, r = 14 + rng() * 32;
        const rg = g.createRadialGradient(x, y, 2, x, y, r);
        rg.addColorStop(0, 'rgba(255,252,243,0.85)');
        rg.addColorStop(0.55, 'rgba(255,250,240,0.38)');
        rg.addColorStop(1, 'rgba(255,250,240,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: makeCloudTexture(), transparent: true,
        opacity: rr(0.78, 1.0), fog: false, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      /* 仰角抬到屋脊线以上（22°-52°），地面机位才看得见 */
      const az = rng() * Math.PI * 2, el = rr(0.38, 0.9), R = 445;
      sp.position.set(Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R);
      const w = rr(150, 300);
      sp.scale.set(w, w * rr(0.3, 0.44), 1);
      clouds.add(sp);
    }
    /* 近景：压扁球拼出的朵云，吃光带体积感，缓慢东移（关雾：远处会被金雾洗没） */
    const puffMat = new THREE.MeshStandardMaterial({
      color: 0xfffaf0, roughness: 1, metalness: 0, fog: false,
    });
    const puffs: Array<{ cl: THREE.Group; speed: number }> = [];
    for (let i = 0; i < 7; i++) {
      const cl = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < n; j++) {
        const r = rr(8, 16);
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), puffMat);
        m.position.set((j - (n - 1) / 2) * r * 1.12 + rr(-2, 2), rr(-1.5, 2.5) + r * 0.18, rr(-3, 3));
        m.scale.y = 0.55;
        cl.add(m);
      }
      const az = rng() * Math.PI * 2, dist = rr(180, 260);
      cl.position.set(Math.cos(az) * dist, rr(140, 220), Math.sin(az) * dist);
      clouds.add(cl);
      puffs.push({ cl, speed: rr(1.1, 2.4) });
    }
    anims.push((_t: any, dt: any) => {
      if (!clouds.visible) return;
      for (const p of puffs) {
        p.cl.position.x += p.speed * dt;
        if (p.cl.position.x > 360) p.cl.position.x = -360;
      }
    });
  }

  /* ---------- environment maps (both built up-front, swapped on toggle) ---------- */
  const makeEnv = (pal: StagePalette): THREE.Texture => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    for (const [color, stop] of pal.envStops) grd.addColorStop(stop, color);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 14; i++) {
      const x = rng() * 512, y = 136 + rr(-10, 14), rad = rr(26, 62);
      const rg = g.createRadialGradient(x, y, 2, x, y, rad);
      rg.addColorStop(0, pal.envGlow.core);
      rg.addColorStop(1, pal.envGlow.edge);
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  };

  const envMaps: Record<TimeOfDay, THREE.Texture> = {
    night: makeEnv(STAGE.night),
    day: makeEnv(STAGE.day),
  };
  scene.environment = envMaps[mode];
  scene.environmentIntensity = stage().envIntensity;

  /* ---------- key light & ambience ---------- */
  const moonLight = new THREE.DirectionalLight(stage().key.color, stage().key.intensity);
  moonLight.position.copy(stage().key.dir).multiplyScalar(96);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  moonLight.shadow.camera.left = -37 * COURT_SCALE; moonLight.shadow.camera.right = 37 * COURT_SCALE;
  moonLight.shadow.camera.top = 37 * COURT_SCALE; moonLight.shadow.camera.bottom = -37 * COURT_SCALE;
  moonLight.shadow.camera.near = 40 * COURT_SCALE; moonLight.shadow.camera.far = 175 * COURT_SCALE;
  moonLight.shadow.bias = -0.00028;
  moonLight.shadow.normalBias = 0.042;
  root.add(moonLight);
  root.add(moonLight.target);

  const hemi = new THREE.HemisphereLight(stage().hemi.sky, stage().hemi.ground, stage().hemi.intensity);
  root.add(hemi);
  const fill = new THREE.DirectionalLight(stage().fill.color, stage().fill.intensity);
  fill.position.set(44, 24, -36);
  root.add(fill);

  /* warm interior light of the main hall */
  const roomLight = new THREE.PointLight(0xffa457, 19 * stage().lampScale, 16, 2);
  roomLight.position.set(0, 3.45, -12.3);
  root.add(roomLight);

  /* point-light factory used all over the courtyard (lanterns, censers, braziers) */
  const flickerLights: any[] = []
  const lampLights: any[] = []
  function addLight(color: any, intensity: any, distance: any, x: any, y: any, z: any, opt: any = {}) {
    const l = new THREE.PointLight(color, intensity * stage().lampScale, distance, 2);
    l.position.set(x, y, z);
    l.castShadow = false;
    root.add(l);
    lampLights.push({ l, raw: intensity });
    if (opt.flicker) flickerLights.push({ l, raw: intensity, amp: opt.flicker, ph: rng() * 9, sp: opt.speed || 6.5 });
    return l;
  }

  /* ---------- post processing (bloom for lanterns / moon) ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), stage().bloom, 0.66, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ---------- realistic PBR material factory (name `toon` kept for the call sites) ---------- */
  function toon(color: any, opt: any = {}) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opt.rough !== undefined ? opt.rough : 0.85,
      metalness: opt.metal !== undefined ? opt.metal : 0.0,
      map: opt.map || null,
      emissive: opt.emissive || 0x000000,
      emissiveIntensity: opt.emissiveIntensity !== undefined ? opt.emissiveIntensity : 1,
      emissiveMap: opt.emissiveMap || null,
      side: opt.side || THREE.FrontSide,
      transparent: !!opt.transparent,
      opacity: opt.opacity !== undefined ? opt.opacity : 1,
      alphaTest: opt.alphaTest || 0,
      flatShading: !!opt.flat,
      envMapIntensity: opt.env !== undefined ? opt.env : 0.8,
    });
    m.fog = opt.fog !== false;
    if (opt.bump) { m.bumpMap = opt.bump; m.bumpScale = opt.bumpScale !== undefined ? opt.bumpScale : 0.02; }
    if (opt.normal) {
      m.normalMap = opt.normal;
      const ns = opt.normalScale !== undefined ? opt.normalScale : 0.5;
      m.normalScale = new THREE.Vector2(ns, ns);
    }
    return m;
  }

  /* ---------- canvas texture helpers ---------- */
  function canvasTex(w: any, h: any, draw: any, opt: any = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat[0], opt.repeat[1]); }
    return t;
  }
  const FONT = '"KaiTi","STKaiti","KaiTi_GB2312","Noto Serif SC",serif';

  /* roof tiles: vertical stripe columns + faint course lines (colors live in the texture; material stays near-white) */
  function makeTileTex(rx: any, ry: any) {
    return canvasTex(128, 128, (g: any) => {
      g.fillStyle = '#7d8996'; g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = '#94a0ac'; g.fillRect(x + 2, 0, 9, 128);
        g.fillStyle = '#b3bcc6'; g.fillRect(x + 3, 0, 3, 128);
        g.fillStyle = '#66727e'; g.fillRect(x + 11, 0, 4, 128);
      }
      g.fillStyle = 'rgba(45,55,66,0.30)';
      for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 2);
    }, { repeat: [rx, ry] });
  }
  function tileMat(rx: any, ry: any, tint: any = 0xd9dee2, side: any = THREE.FrontSide) {
    const t = makeTileTex(rx, ry);
    return toon(tint, { map: t, bump: t, bumpScale: 0.014, rough: 0.6, side, env: 0.9 });
  }
  /* stone slab paving */
  const pavingTex = canvasTex(512, 512, (g: any) => {
    g.fillStyle = '#8f8676'; g.fillRect(0, 0, 512, 512);
    const cell = 128;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const l = 66 + Math.floor(rng() * 14);
      g.fillStyle = `hsl(38,${10 + rng() * 8}%,${l}%)`;
      g.fillRect(i * cell + 3, j * cell + 3, cell - 6, cell - 6);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(i * cell + 5, j * cell + 5, cell - 10, 3);
    }
    g.fillStyle = 'rgba(60,50,40,0.25)';
    for (let k = 0; k < 500; k++) g.fillRect(rng() * 512, rng() * 512, 2, 2);
  }, { repeat: [5.2, 5.6] });
  /* wood plank floor */
  const plankTex = canvasTex(256, 256, (g: any) => {
    g.fillStyle = '#7c5232'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = `hsl(28,32%,${30 + rng() * 9}%)`;
      g.fillRect(0, y + 2, 256, 28);
      g.fillStyle = 'rgba(40,22,10,0.6)'; g.fillRect(0, y, 256, 2);
      g.strokeStyle = 'rgba(50,28,14,0.25)';
      for (let k = 0; k < 5; k++) { g.beginPath(); const yy = y + 6 + rng() * 20; g.moveTo(0, yy); g.bezierCurveTo(80, yy + rng() * 4 - 2, 170, yy + rng() * 4 - 2, 256, yy); g.stroke(); }
    }
  }, { repeat: [4, 2] });
  /* plaster subtle grain */
  const plasterTex = canvasTex(128, 128, (g: any) => {
    g.fillStyle = '#f4efe3'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(150,140,120,0.10)';
    for (let k = 0; k < 160; k++) g.fillRect(rng() * 128, rng() * 128, 2, 1);
  }, { repeat: [3, 1.6] });

  /* leaf card textures */
  function ginkgoTex() {
    return canvasTex(128, 128, (g: any) => {
      g.clearRect(0, 0, 128, 128);
      g.translate(64, 66);
      g.beginPath();
      g.moveTo(0, 52); g.lineTo(0, 8);
      g.arc(0, 8, 44, Math.PI * 1.06, Math.PI * 1.94, false);
      g.closePath();
      const gr = g.createLinearGradient(0, -40, 0, 50);
      gr.addColorStop(0, '#ffd45e'); gr.addColorStop(0.55, '#f5b840'); gr.addColorStop(1, '#d8902a');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(150,90,20,0.45)'; g.lineWidth = 1.6;
      for (const a of [-0.55, -0.28, 0, 0.28, 0.55]) { g.beginPath(); g.moveTo(0, 46); g.lineTo(Math.sin(a) * 40, 8 - Math.cos(a) * 40); g.stroke(); }
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(-3, -34); g.lineTo(3, -34); g.lineTo(0, -22); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#a06a20'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 52); g.lineTo(0, 38); g.stroke();
    });
  }
  function mapleTex() {
    return canvasTex(128, 128, (g: any) => {
      g.clearRect(0, 0, 128, 128);
      g.translate(64, 66);
      g.beginPath(); g.moveTo(0, 54); g.lineTo(0, 6);
      const R = 44;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
        const w = 0.30;
        g.quadraticCurveTo(Math.cos(a - w) * R * 0.55, Math.sin(a - w) * R * 0.55, Math.cos(a - w * 0.35) * R, Math.sin(a - w * 0.35) * R);
        g.quadraticCurveTo(Math.cos(a + w * 0.35) * R, Math.sin(a + w * 0.35) * R, Math.cos(a + w) * R * 0.55, Math.sin(a + w) * R * 0.55);
      }
      g.closePath();
      const gr = g.createLinearGradient(0, -40, 0, 50);
      gr.addColorStop(0, '#f0653a'); gr.addColorStop(0.6, '#d8402c'); gr.addColorStop(1, '#a52a18');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(120,30,10,0.4)'; g.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; g.beginPath(); g.moveTo(0, 6); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke(); }
      g.strokeStyle = '#8a2a14'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 54); g.lineTo(0, 40); g.stroke();
    });
  }
  function bambooLeafTex() {
    return canvasTex(64, 128, (g: any) => {
      g.clearRect(0, 0, 64, 128);
      g.translate(32, 64);
      g.beginPath();
      g.moveTo(0, -56);
      g.quadraticCurveTo(16, -12, 3, 56);
      g.quadraticCurveTo(-14, -10, 0, -56);
      g.closePath();
      const gr = g.createLinearGradient(-10, -50, 10, 50);
      gr.addColorStop(0, '#8fae62'); gr.addColorStop(1, '#5f8443');
      g.fillStyle = gr; g.fill();
    });
  }
  const TEX_GINKGO = ginkgoTex(), TEX_MAPLE = mapleTex(), TEX_BMLEAF = bambooLeafTex();

  /* ---------- shared materials ---------- */
  const M = {
    wallOut: toon(0xf0e9d8, { map: plasterTex, rough: 0.95, bump: plasterTex, bumpScale: 0.035, env: 0.55 }),
    wallIn: toon(0xe2d3b3, { rough: 0.96, env: 0.5 }),
    tile: null,
    ridge: toon(0x49535e, { rough: 0.66 }),
    fascia: toon(0x5f4027, { rough: 0.82, side: THREE.DoubleSide }),
    woodDark: toon(0x4d301c, { rough: 0.74 }),
    woodMid: toon(0x6b4225, { rough: 0.7 }),
    woodLattice: toon(0x7f4d2d, { rough: 0.72 }),
    column: toon(0x5f3520, { rough: 0.66 }),
    stone: toon(0x9b968a, { rough: 0.93 }),
    stoneDark: toon(0x807c71, { rough: 0.95 }),
    stonePath: toon(0x98938a, { rough: 0.9 }),
    rock: toon(0x8b8d86, { rough: 0.97 }),
    ceramicDark: toon(0x333941, { rough: 0.5 }),
    bronze: toon(0xae8b43, { rough: 0.36, metal: 0.88, env: 1.5 }),
    redLacquer: toon(0x96200f, { rough: 0.4 }),
    lanternRed: toon(0xcf3624, { emissive: 0xff4a1c, emissiveIntensity: 0.95, rough: 0.62 }),
    lampRed: toon(0xc42d22, { emissive: 0xff7a34, emissiveIntensity: 1.25, rough: 0.58 }),
    gold: toon(0xd6a53b, { rough: 0.32, metal: 0.92, env: 1.6 }),
    fabricBlue: toon(0x515f6e, { rough: 0.94 }),
    fabricRed: toon(0x8c3f35, { rough: 0.94 }),
    carpet: null,
    paper: toon(0xe6dcc2, { rough: 0.9 }),
    ink: null,
    floor: toon(0xffffff, { map: plankTex, rough: 0.62, bump: plankTex, bumpScale: 0.02 }),
    bamboo: toon(0x74924f, { rough: 0.8 }),
    bambooNode: toon(0x54703a, { rough: 0.82 }),
    trunk: toon(0x6b4d35, { rough: 0.94 }),
    trunkDark: toon(0x543a24, { rough: 0.95 }),
    plasterGray: toon(0xcfc9b8, { rough: 0.95 }),
    clay: toon(0x8d5231, { rough: 0.85 }),
    inkLine: toon(0x221a14, { rough: 0.9 }),
  };
  const hullInk = new THREE.Color(0x38291e);
  const hullMats = new Map();
  function hullMat(th: any) {
    if (!hullMats.has(th)) hullMats.set(th, new THREE.ShaderMaterial({
      uniforms: { uT: { value: th }, uC: { value: hullInk } },
      vertexShader: `uniform float uT;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        wp.xyz += n * uT;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
      fragmentShader: `uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`,
      side: THREE.BackSide
    }));
    return hullMats.get(th);
  }
  const INK_OUTLINE = false;   /* ink outlines were part of the toon look; the realistic pass keeps clean silhouettes */
  function bakeOutline(root: any, th: any) {
    if (!INK_OUTLINE) return;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const parts: any[] = []
    root.traverse((o: any) => {
      if (o.isMesh && !o.isInstancedMesh && !o.userData.hull && !o.userData.noOutline) {
        let g = o.geometry.index ? o.geometry.clone().toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        parts.push(g);
      }
    });
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    const hull = new THREE.Mesh(merged, hullMat(th));
    hull.userData.hull = true;
    root.add(hull);
  }

  /* ---------- small mesh helpers ---------- */
  function box(w: any, h: any, d: any, m: any, opt: any = {}) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.castShadow = opt.cast !== false; o.receiveShadow = opt.recv !== false;
    if (opt.noOutline) o.userData.noOutline = true;
    return o;
  }
  function cyl(rt: any, rb: any, h: any, m: any, seg: any = 16, opt: any = {}) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    o.castShadow = opt.cast !== false; o.receiveShadow = opt.recv !== false;
    if (opt.noOutline) o.userData.noOutline = true;
    return o;
  }
  function put(o: any, x: any, y: any, z: any, ry: any = 0) { o.position.set(x, y, z); if (ry) o.rotation.y = ry; return o; }

  /* ---------- curved roof: closed shell (tiles above, boards below, rim all round) ---------- */
  const ROOF_THICK = 0.30;
  function curvedRoofGeo(w: any, d: any, rise: any, eaveUp: any = 0.55, seg: any = 16, rows: any = 8) {
    const g = new THREE.PlaneGeometry(w, d, seg, rows);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const az = Math.min(Math.abs(z) / (d / 2), 1);
      let y = rise * Math.pow(1 - az, 1.45);
      y += eaveUp * Math.pow(Math.abs(x) / (w / 2), 3.0) * Math.pow(az, 1.2);
      p.setY(i, y);
    }
    g.computeVertexNormals();
    return g;
  }
  /* height of the roof skin at a point (same formula as the mesh above) */
  function roofEdgeY(x: any, z: any, w: any, d: any, rise: any, eaveUp: any) {
    const az = Math.min(Math.abs(z) / (d / 2), 1);
    const ax = Math.min(Math.abs(x) / (w / 2), 1);
    return rise * Math.pow(1 - az, 1.45) + eaveUp * Math.pow(ax, 3.0) * Math.pow(az, 1.2);
  }
  function flipWinding(g: any) {
    const idx = g.getIndex();
    if (idx) {
      const a = idx.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
      idx.needsUpdate = true;
    }
    g.computeVertexNormals();
    return g;
  }
  /* vertical band around the roof perimeter, closing the shell */
  function roofRimGeo(w: any, d: any, rise: any, eaveUp: any, thick: any, seg: any) {
    const pts: any[] = []
    const push = (x: any, z: any) => pts.push([x, z, roofEdgeY(x, z, w, d, rise, eaveUp)]);
    for (let i = 0; i <= seg; i++) push(-w / 2 + w * i / seg, d / 2);
    for (let i = 1; i <= seg; i++) push(w / 2, d / 2 - d * i / seg);
    for (let i = 1; i <= seg; i++) push(w / 2 - w * i / seg, -d / 2);
    for (let i = 1; i <= seg; i++) push(-w / 2, -d / 2 + d * i / seg);
    const pos: any[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pos.push(a[0], a[2], a[1], a[0], a[2] - thick, a[1], b[0], b[2], b[1]);
      pos.push(a[0], a[2] - thick, a[1], b[0], b[2] - thick, b[1], b[0], b[2], b[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  function roofOf(w: any, d: any, rise: any, eaveUp: any, ridgeLenRatio: any = 1, opt: any = {}) {
    const grp = new THREE.Group();
    const thick = opt.thick !== undefined ? opt.thick : ROOF_THICK;
    const seg = Math.max(8, Math.round(w / 1.6));
    const rx = Math.max(1, Math.round(w / 2.4)), rz = Math.max(1, Math.round(d / 2.2));
    const top = new THREE.Mesh(curvedRoofGeo(w, d, rise, eaveUp), tileMat(rx, rz));
    top.castShadow = top.receiveShadow = true;
    grp.add(top);
    /* underside */
    const bot = new THREE.Mesh(flipWinding(curvedRoofGeo(w, d, rise, eaveUp)).translate(0, -thick, 0), M.fascia);
    bot.receiveShadow = true;
    grp.add(bot);
    /* eave boards / gable edges all round */
    const rim = new THREE.Mesh(roofRimGeo(w, d, rise, eaveUp, thick, seg), M.fascia);
    rim.castShadow = rim.receiveShadow = true;
    grp.add(rim);
    /* ridge */
    const ridge = box(w * ridgeLenRatio * 0.985, 0.3, 0.52, M.ridge);
    ridge.position.y = rise + 0.01;
    grp.add(ridge);
    /* upturned ridge ends (chiwen) */
    for (const s of [1, -1]) {
      const end = box(0.34, 0.6, 0.5, M.ridge);
      end.position.set(s * w * 0.4925 * ridgeLenRatio, rise + 0.22, 0);
      end.rotation.z = -s * 0.38;
      grp.add(end);
      const curl = box(0.2, 0.34, 0.3, M.ridge);
      curl.position.set(s * w * 0.4925 * ridgeLenRatio + s * 0.16, rise + 0.62, 0);
      curl.rotation.z = -s * 0.8;
      grp.add(curl);
    }
    grp.userData.roof = { w, d, rise, eaveUp, thick };
    return grp;
  }
  /* gable wall triangle that tucks into the roof shell */
  function gableInfill(d: any, rise: any, eaveUp: any, depth: any, mat: any, lift: any = -0.06, halfRef: any = 0, axWall: any = 1) {
    const half = d / 2, N = 12, ref = halfRef || half;
    const edge = eaveUp * Math.pow(axWall, 3);
    const pts = [new THREE.Vector2(-half, -0.2), new THREE.Vector2(half, -0.2)];
    for (let i = N; i >= 0; i--) {
      const z = -half + (i / N) * d;
      const az = Math.min(Math.abs(z) / ref, 1);
      const prof = rise * Math.pow(Math.max(1 - az, 0), 1.45) + edge * Math.pow(az, 1.2);
      pts.push(new THREE.Vector2(z, prof + lift));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false });
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  /* wall-top tile cap */
  function wallCap(len: any) {
    const grp = new THREE.Group();
    const rx = Math.max(1, Math.round(len / 2.2));
    const slab = new THREE.Mesh(curvedRoofGeo(len + 0.5, 1.55, 0.34, 0.14, Math.max(4, Math.round(len / 3)), 2), tileMat(rx, 1, 0xd9dee2, THREE.DoubleSide));
    slab.castShadow = slab.receiveShadow = true;
    grp.add(slab);
    const under = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.1, 1.35), toon(0x4a3c2c, { rough: 0.9, side: THREE.DoubleSide }));
    under.position.y = -0.05;
    grp.add(under);
    const ridge = box(len + 0.3, 0.18, 0.3, toon(0x6a7580));
    ridge.position.y = 0.4;
    grp.add(ridge);
    return grp;
  }

  /* ---------- the base plinth ---------- */
  const baseG = new THREE.Group(); root.add(baseG);
  {
    const sideTex = canvasTex(512, 128, (g: any) => {
      g.fillStyle = '#8a7f6d'; g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#6e6353'; g.fillRect(0, 18, 512, 110);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = 0; x < 512; x += 64) g.fillRect(x, 18, 3, 110);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let x = 0; x < 512; x += 64) g.fillRect(x + 4, 20, 56, 3);
    }, { repeat: [4, 1] });
    const topMat = toon(0x8b8474, { rough: 0.95 });
    const sideMat = toon(0x9c917d, { map: sideTex, rough: 0.9 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(46, 2.2, 46), [sideMat, sideMat, topMat, topMat, sideMat, sideMat]);
    top.position.y = -1.1;
    top.castShadow = top.receiveShadow = true;
    baseG.add(top);
    const mid = box(44.6, 0.9, 44.6, toon(0x5c5347, { rough: 0.95 })); mid.position.y = -2.65; baseG.add(mid);
    const bot = box(42.6, 1.0, 42.6, toon(0x4a4237, { rough: 0.96 })); bot.position.y = -3.6; baseG.add(bot);
  }

  /* ---------- ground & paving ---------- */
  const groundG = new THREE.Group(); root.add(groundG);
  {
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(27.4, 31.4), toon(0x8a8478, { map: pavingTex, rough: 0.92, bump: pavingTex, bumpScale: 0.02 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, 0.012, 0);
    yard.receiveShadow = true;
    yard.userData.noOutline = true;
    groundG.add(yard);
    /* base top surface beyond the walls：庭院放大后基座也要跟着外扩，免得从院外全景看到硬边 */
    const apron = new THREE.Mesh(new THREE.BoxGeometry(64, 0.16, 64), toon(0x6b6153, { rough: 0.95 }));
    apron.position.y = -0.09; apron.receiveShadow = true; apron.userData.noOutline = true;
    groundG.add(apron);
  }

  /* ---------- stone slab path: gate -> fork around the screen wall -> moon gate -> hall ---------- */
  const pathG = new THREE.Group(); groundG.add(pathG);
  function slabRun(points: any, count: any, w: any, d: any, y: any) {
    const curve = new THREE.CatmullRomCurve3(points.map((p: any) => new THREE.Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.3);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = curve.getPoint(t), tan = curve.getTangent(t);
      const m = toon(new THREE.Color().setHSL(0.085, 0.04, 0.32 + rng() * 0.07), { rough: 0.88, bump: pavingTex, bumpScale: 0.012 });
      const s = box(w, 0.14, d, m);
      put(s, p.x + rr(-0.025, 0.025), y, p.z + rr(-0.025, 0.025), Math.atan2(tan.x, tan.z) + rr(-0.035, 0.035));
      s.rotation.z = rr(-0.008, 0.008);
      pathG.add(s);
    }
  }
  /* through the gate and up to the fork */
  slabRun([[0, 15.42], [0, 14.9], [0, 14.3]], 3, 1.55, 1.0, 0.06);
  /* two branches that pass on either side of the screen wall and meet again */
  for (const s of [-1, 1]) {
    slabRun([[0, 14.3], [s * 1.7, 14.05], [s * 3.45, 13.15], [s * 3.55, 12.05], [s * 2.3, 11.15]], 10, 1.18, 0.88, 0.062);
  }
  /* merged run: straight through the moon gate to the hall steps */
  slabRun([[0, 11.05], [0, 10.2], [0, 8.0], [0, 4.5], [0, 0], [0, -4.0], [0, -7.3]], 27, 1.42, 1.02, 0.06);
  {
    const pad = box(2.7, 0.12, 2.0, toon(0x8d8779, { rough: 0.9 }));
    put(pad, 0, 0.055, 15.45); pathG.add(pad);
  }

  /* ---------- enclosure walls ---------- */
  const wallsG = new THREE.Group(); root.add(wallsG);
  const WH = 4.3, WT = 0.6;
  function wallRun(len: any, h: any) {
    const m = box(len, h, WT, M.wallOut);
    return m;
  }
  /* south wall with gate opening */
  {
    const segW = (14 - 1.8 - WT / 2);
    const l = wallRun(segW, WH); put(l, -(1.8 + segW / 2), WH / 2, 16); wallsG.add(l);
    const r = wallRun(segW, WH); put(r, (1.8 + segW / 2), WH / 2, 16); wallsG.add(r);
    const lintel = box(4.2, WH - 3.4, WT, M.wallOut);
    put(lintel, 0, 3.4 + (WH - 3.4) / 2, 16); wallsG.add(lintel);
    for (const s of [-1, 1]) {
      const cap = wallCap(segW);
      put(cap, s * (1.8 + segW / 2), WH, 16); wallsG.add(cap);
    }
  }
  /* moon-gate partition wall (front yard / main courtyard) */
  {
    const z = 8, cx = 0, r = 1.7, cy = 2.05;
    const shape = new THREE.Shape();
    shape.moveTo(-14, 0); shape.lineTo(14, 0); shape.lineTo(14, WH); shape.lineTo(-14, WH); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
    g.translate(0, 0, -0.275);
    const wall = new THREE.Mesh(g, M.wallOut);
    wall.position.set(0, 0, z);
    wall.castShadow = wall.receiveShadow = true;
    wallsG.add(wall);
    const lining = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.125, 10, 44), toon(0x7d7568, { rough: 0.93 }));
    lining.scale.z = 0.42;
    put(lining, cx, cy, z);
    lining.castShadow = true;
    lining.userData.noOutline = true;
    wallsG.add(lining);
    const liningLine = new THREE.Mesh(new THREE.TorusGeometry(r + 0.28, 0.03, 6, 48), M.inkLine);
    liningLine.scale.z = 0.42;
    liningLine.position.set(cx, cy, z);
    liningLine.userData.noOutline = true;
    wallsG.add(liningLine);
    /* stone threshold across the bottom of the moon gate */
    const sill = box(2.5, 0.38, 0.9, M.stone);
    put(sill, 0, 0.19, z); wallsG.add(sill);
    const cap = wallCap(28.6);
    put(cap, 0, WH, z); wallsG.add(cap);
  }
  /* corner posts at the four enclosure corners */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.92, WH + 0.06, 0.92, M.wallOut);
    put(post, sx * 14, (WH + 0.06) / 2, sz * 16); wallsG.add(post);
    const pcap = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.34, 4), M.ridge);
    pcap.rotation.y = Math.PI / 4;
    pcap.position.set(sx * 14, WH + 0.2, sz * 16);
    pcap.castShadow = true;
    wallsG.add(pcap);
    const plinth = box(1.05, 0.24, 1.05, M.stoneDark);
    put(plinth, sx * 14, 0.12, sz * 16); wallsG.add(plinth);
  }
  /* east & west walls */
  for (const s of [-1, 1]) {
    const w = box(31.4, WH, WT, M.wallOut);
    put(w, s * 14, WH / 2, 0, Math.PI / 2);
    wallsG.add(w);
    const cap = wallCap(31.6);
    put(cap, s * 14, WH, 0, Math.PI / 2);
    wallsG.add(cap);
  }
  /* north wall segments beside the hall */
  for (const s of [-1, 1]) {
    const segLen = 14 - 8.8;
    const w = box(segLen, WH, WT, M.wallOut);
    put(w, s * (8.8 + segLen / 2), WH / 2, -16);
    wallsG.add(w);
    const cap = wallCap(segLen + 0.4);
    put(cap, s * (8.8 + segLen / 2), WH, -16);
    wallsG.add(cap);
  }
  /* screen wall (yingbi) inside the gate */
  let fuMaterial: THREE.MeshStandardMaterial | null = null
  {
    const grp = new THREE.Group();
    const plinth = box(5.6, 0.4, 1.4, M.stoneDark); plinth.position.y = 0.2; grp.add(plinth);
    const body = box(5.0, 2.55, 0.55, M.wallOut); body.position.y = 0.4 + 2.55 / 2; grp.add(body);
    const cap = wallCap(5.6); cap.position.y = 2.95; grp.add(cap);
    const fuTex = new THREE.TextureLoader().load(fuPanelUrl)
    fuTex.colorSpace = THREE.SRGBColorSpace
    fuTex.anisotropy = 8
    const panelH = 2.35
    const panelW = panelH * FU_PANEL_ASPECT
    // 夜色里也用同一张图做微弱自发光，让红底金字在灯光下更喜庆
    const fuMat = new THREE.MeshStandardMaterial({
      map: fuTex,
      roughness: 0.68,
      metalness: 0.06,
      emissive: 0xffffff,
      emissiveMap: fuTex,
      emissiveIntensity: isDay() ? 0.05 : 0.14,
    })
    fuMaterial = fuMat
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.1), fuMat);
      p.position.set(0, 1.72, s * 0.34);
      p.castShadow = true;
      grp.add(p);
    }
    put(grp, 0, 0, 12.6);
    wallsG.add(grp);
    bakeOutline(grp, 0.05);
  }

  /* ---------- main gate (south face, on the z=16 wall) ---------- */
  const gateG = new THREE.Group(); root.add(gateG);
  const gateLeaves: Array<{ pivot: THREE.Group; dir: number }> = []
  const GATE = { z: 16, wallTop: 4.3, bodyTop: 5.24, roofBase: 4.89 };
  {
    const doorMat = toon(0x4e3420, { rough: 0.55 });
    const studMat = M.bronze;
    const leafW = 2.0;
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      const frame = box(leafW, 3.3, 0.14, doorMat); frame.position.y = 1.66; leaf.add(frame);
      for (let i = 0; i < 3; i++) {
        const seam = box(0.022, 3.2, 0.03, toon(0x2c1c0e, { rough: 0.7 }));
        seam.position.set(-0.34 + i * 0.34, 1.66, 0.09); leaf.add(seam);
      }
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), studMat);
        stud.position.set(-0.55 + i * 1.1, 0.8 + j * 0.95, 0.1);
        stud.castShadow = true; leaf.add(stud);
      }
      const mount = box(0.3, 0.3, 0.05, studMat); mount.position.set(s * -0.5, 1.95, 0.1); leaf.add(mount);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), studMat);
      ring.position.set(s * -0.5, 1.66, 0.16); ring.castShadow = true; leaf.add(ring);
      leaf.position.set(-s * 1.0, 0, 0);
      // 以门框外缘为铰链，开场镜头才有「开门」可看
      const pivot = new THREE.Group();
      pivot.position.set(s * 2.0, 0, GATE.z);
      pivot.add(leaf);
      gateG.add(pivot);
      gateLeaves.push({ pivot, dir: s });
    }
    /* door frame */
    for (const s of [-1, 1]) {
      const post = box(0.17, 3.44, 0.68, toon(0x3f2a19, { rough: 0.76 }));
      put(post, s * 2.02, 1.72, GATE.z); gateG.add(post);
    }
    const head = box(4.28, 0.2, 0.68, toon(0x3f2a19, { rough: 0.76 }));
    put(head, 0, 3.44, GATE.z); gateG.add(head);
    /* stone piers + threshold：门枕石上蹲一对石狮，面朝门外（+z） */
    /* 石狮用自己的石料副本：小件用更密的浮雕法线，避免纹路被拉伸 */
    let lionStone: any = null;
    let lionStoneDark: any = null;
    function stoneLion(withBall: boolean): THREE.Group {
      if (!lionStone) {
        lionStone = toon(0x9b968a, { rough: 0.93, normal: stoneReliefNormal(5), normalScale: 0.45 });
        lionStoneDark = toon(0x807c71, { rough: 0.95, normal: stoneReliefNormal(5), normalScale: 0.4 });
      }
      const g = new THREE.Group();
      const pill = (r: number, m: any, seg = 12): THREE.Mesh => {
        const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 2)), m);
        o.castShadow = true; o.receiveShadow = true;
        return o;
      };
      /* 须弥座：下枋、束腰、上枋 */
      const seat0 = box(0.56, 0.07, 0.68, lionStoneDark); seat0.position.y = 0.035; g.add(seat0);
      const seat1 = box(0.46, 0.07, 0.58, lionStone); seat1.position.y = 0.105; g.add(seat1);
      const seat2 = box(0.5, 0.06, 0.62, lionStoneDark); seat2.position.y = 0.17; g.add(seat2);
      /* 蹲坐的身量：后胯敦实、前胸高挺 */
      const rump = pill(0.2, lionStone); rump.scale.set(0.9, 0.92, 1.06); rump.position.set(0, 0.38, -0.09); g.add(rump);
      const chest = pill(0.155, lionStone); chest.scale.set(0.96, 1.02, 0.94); chest.position.set(0, 0.46, 0.09); g.add(chest);
      const shoulder = pill(0.135, lionStone); shoulder.scale.set(1.02, 0.9, 0.9); shoulder.position.set(0, 0.55, 0.03); g.add(shoulder);
      /* 胸前绶带 */
      const sash = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.02, 6, 22), lionStoneDark);
      sash.position.set(0, 0.5, 0.07); sash.scale.set(1.02, 1, 0.92); sash.rotation.x = Math.PI * 0.5;
      sash.castShadow = true; g.add(sash);
      /* 前腿：粗壮直立，爪分三趾 */
      for (const sx of [-1, 1]) {
        const leg = cyl(0.058, 0.072, 0.3, lionStone, 10); leg.position.set(sx * 0.1, 0.36, 0.18); g.add(leg);
        const paw = box(0.15, 0.09, 0.21, lionStone); paw.position.set(sx * 0.1, 0.245, 0.2); g.add(paw);
        for (let t = -1; t <= 1; t++) {
          const toe = box(0.032, 0.05, 0.06, lionStoneDark); toe.position.set(sx * 0.1 + t * 0.042, 0.235, 0.305); g.add(toe);
        }
      }
      /* 鬃毛底盘 + 两圈卷毛，撑出狮子的轮廓 */
      const maneBack = pill(0.185, lionStone); maneBack.scale.set(1, 0.95, 0.55); maneBack.position.set(0, 0.69, -0.01); g.add(maneBack);
      for (const [ringR, curlR, count, z, phase] of [
        [0.185, 0.05, 12, 0.01, 0],
        [0.125, 0.042, 9, 0.08, Math.PI / 9],
      ] as Array<[number, number, number, number, number]>) {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + phase;
          const curl = pill(curlR, lionStone, 8);
          curl.position.set(Math.cos(a) * ringR, 0.69 + Math.sin(a) * ringR, z);
          g.add(curl);
        }
      }
      /* 头：略小于鬃毛，才不像玩偶 */
      const head = pill(0.135, lionStone); head.scale.set(1, 0.93, 0.96); head.position.set(0, 0.695, 0.12); g.add(head);
      /* 耳（藏在鬃毛里，只露一点） */
      for (const sx of [-1, 1]) {
        const ear = pill(0.034, lionStone, 8); ear.scale.set(1, 0.8, 0.6); ear.position.set(sx * 0.148, 0.775, 0.07); g.add(ear);
      }
      /* 鼻吻、阔口：贴在球面之前，才看得见 */
      const muzzle = box(0.13, 0.075, 0.07, lionStone); muzzle.position.set(0, 0.66, 0.235); g.add(muzzle);
      const nose = box(0.062, 0.035, 0.035, lionStoneDark); nose.position.set(0, 0.678, 0.272); g.add(nose);
      const mouth = box(0.1, 0.022, 0.03, M.inkLine); mouth.position.set(0, 0.638, 0.268); g.add(mouth);
      /* 眉压得低、眼小：才凶 */
      for (const sx of [-1, 1]) {
        const brow = box(0.072, 0.03, 0.03, lionStoneDark); brow.position.set(sx * 0.058, 0.744, 0.243); brow.rotation.z = sx * 0.3; g.add(brow);
        const eye = pill(0.024, M.inkLine, 8); eye.scale.set(1, 0.9, 0.45); eye.position.set(sx * 0.058, 0.714, 0.242); g.add(eye);
      }
      /* 尾：身后上翘再卷回 */
      const tail1 = pill(0.05, lionStone, 8); tail1.position.set(0, 0.52, -0.27); g.add(tail1);
      const tail2 = pill(0.045, lionStone, 8); tail2.position.set(0, 0.61, -0.29); g.add(tail2);
      const tail3 = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.024, 6, 14), lionStone);
      tail3.position.set(0, 0.68, -0.28); tail3.rotation.set(Math.PI * 0.5, 0, 0.4);
      tail3.castShadow = true; g.add(tail3);
      if (withBall) {
        /* 雄狮踏绣球 */
        const orb = pill(0.082, lionStone); orb.position.set(0.115, 0.275, 0.28); g.add(orb);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.013, 6, 20), lionStoneDark);
        band.position.copy(orb.position); band.rotation.set(1.1, 0.4, 0);
        band.castShadow = true; g.add(band);
      } else {
        /* 雌狮抚幼狮 */
        const cubBody = pill(0.062, lionStone); cubBody.scale.set(1, 0.92, 1.08); cubBody.position.set(-0.12, 0.27, 0.27); g.add(cubBody);
        const cubHead = pill(0.05, lionStone); cubHead.position.set(-0.12, 0.375, 0.3); g.add(cubHead);
        const cubMane = pill(0.042, lionStone, 8); cubMane.scale.set(1, 0.9, 0.6); cubMane.position.set(-0.12, 0.38, 0.27); g.add(cubMane);
        for (const sx of [-1, 1]) {
          const cubEar = pill(0.019, lionStone, 6); cubEar.position.set(-0.12 + sx * 0.03, 0.41, 0.3); g.add(cubEar);
        }
      }
      /* 头微微侧转，雌雄相对 */
      g.rotation.y = withBall ? -0.2 : 0.2;
      return g;
    }
    for (const s of [-1, 1]) {
      const pier = new THREE.Group();
      const b = box(0.75, 0.5, 1.1, M.stoneDark); b.position.y = 0.25; pier.add(b);
      const lion = stoneLion(s > 0);
      lion.position.y = 0.5;
      lion.scale.setScalar(1.25);
      pier.add(lion);
      put(pier, s * 2.45, 0, 16.7);
      gateG.add(pier);
    }
    const th = box(3.9, 0.22, 0.9, M.stoneDark); put(th, 0, 0.11, 16.0); gateG.add(th);
    /* ---- gate tower: solid wall panel above the opening, roof seated on it ---- */
    const tower = new THREE.Group();
    const tH = GATE.bodyTop - GATE.wallTop;
    const body = box(4.24, tH, 1.5, M.wallOut);
    put(body, 0, GATE.wallTop + tH / 2, GATE.z + 0.03);
    tower.add(body);
    const band = box(4.46, 0.22, 1.72, M.woodDark);
    put(band, 0, GATE.bodyTop - 0.1, GATE.z + 0.03);
    tower.add(band);
    /* gate plaque */
    const gateTex = canvasTex(512, 160, (g: any) => {
      g.fillStyle = '#20323c'; g.fillRect(0, 0, 512, 160);
      g.strokeStyle = '#d9a83e'; g.lineWidth = 8; g.strokeRect(9, 9, 494, 142);
      g.fillStyle = '#e8bd55';
      g.font = '86px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('听 秋 别 院', 256, 84);
    });
    const gatePlaque = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 0.1), toon(0xffffff, { map: gateTex, rough: 0.6 }));
    put(gatePlaque, 0, 4.42, GATE.z + 0.82);
    gatePlaque.castShadow = true;
    tower.add(gatePlaque);
    /* two red lanterns under the gate eave */
    for (const s of [-1, 1]) {
      const lampG = new THREE.Group();
      const cord = cyl(0.012, 0.012, 0.42, toon(0x3a2818), 6);
      cord.position.y = 0.21; lampG.add(cord);
      const bodyL = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), M.lanternRed);
      bodyL.scale.y = 0.85; bodyL.position.y = -0.2; bodyL.castShadow = true; lampG.add(bodyL);
      for (const sy of [0.02, -0.44]) {
        const capL = cyl(0.1, 0.12, 0.06, M.gold, 10); capL.position.y = sy; lampG.add(capL);
      }
      const tas = box(0.032, 0.22, 0.032, toon(0xa8281c));
      tas.position.y = -0.64; lampG.add(tas);
      put(lampG, s * 1.55, 4.18, GATE.z + 0.86);
      tower.add(lampG);
      addLight(0xff7b34, 4.6, 7.5, s * 1.55, 3.86, GATE.z + 0.86, { flicker: 0.14, speed: 7.5 });
    }
    const roof = roofOf(6.4, 3.4, 0.86, 0.34, 0.92, { thick: 0.28 });
    put(roof, 0, GATE.roofBase, GATE.z + 0.05);
    tower.add(roof);
    gateG.add(tower);
    bakeOutline(gateG, 0.045);
  }

  /* ---------- lattice builders ---------- */
  function latticeGeo(w: any, h: any, cols: any, rows: any, bar: any = 0.055, depth: any = 0.05) {
    const parts: any[] = []
    for (let i = 0; i <= cols; i++) {
      const b = new THREE.BoxGeometry(bar, h, depth);
      b.translate(-w / 2 + (w - bar) * i / cols + bar / 2, 0, 0);
      parts.push(b);
    }
    for (let j = 0; j <= rows; j++) {
      const b = new THREE.BoxGeometry(w, bar, depth);
      b.translate(0, -h / 2 + (h - bar) * j / rows + bar / 2, 0);
      parts.push(b);
    }
    /* corner motifs */
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const b = new THREE.BoxGeometry(w * 0.16, bar * 0.9, depth * 0.9);
      b.rotateZ(sx * sy * 0.7);
      b.translate(sx * w * 0.14, sy * h * 0.14, 0);
      parts.push(b);
    }
    return mergeGeometries(parts, false);
  }
  function latticeMesh(w: any, h: any, cols: any, rows: any) {
    const m = new THREE.Mesh(latticeGeo(w, h, cols, rows), M.woodLattice);
    m.castShadow = true;
    return m;
  }
  /* jianshan door leaf: lattice top + solid lower panel */
  function doorLeaf(w: any, h: any) {
    const grp = new THREE.Group();
    const stile = 0.1;
    for (const s of [-1, 1]) {
      const st = box(stile, h, 0.09, M.woodDark); st.position.set(s * (w / 2 - stile / 2), h / 2, 0); grp.add(st);
    }
    const latH = h * 0.52, panH = h * 0.42;
    const lat = latticeMesh(w - stile * 2, latH, 3, 4);
    lat.position.set(0, h - latH / 2 - 0.08, 0); grp.add(lat);
    const mid = box(w - stile * 2, h * 0.08, 0.07, M.woodMid);
    mid.position.set(0, h - latH - 0.16, 0); grp.add(mid);
    const pan = box(w - stile * 2, panH, 0.07, M.woodMid);
    pan.position.set(0, panH / 2 + 0.06, 0); grp.add(pan);
    return grp;
  }
  /* lattice window with frame */
  function latticeWindow(w: any, h: any, cols: any, rows: any) {
    const grp = new THREE.Group();
    const fr = 0.12;
    const frameGeoParts: any[] = []
    const f1 = new THREE.BoxGeometry(w, fr, 0.12); f1.translate(0, h / 2 - fr / 2, 0);
    const f2 = new THREE.BoxGeometry(w, fr, 0.12); f2.translate(0, -h / 2 + fr / 2, 0);
    const f3 = new THREE.BoxGeometry(fr, h, 0.12); f3.translate(-w / 2 + fr / 2, 0, 0);
    const f4 = new THREE.BoxGeometry(fr, h, 0.12); f4.translate(w / 2 - fr / 2, 0, 0);
    const midm = new THREE.BoxGeometry(w, fr * 0.8, 0.12); midm.translate(0, 0, 0);
    frameGeoParts.push(f1, f2, f3, f4, midm);
    const frame = new THREE.Mesh(mergeGeometries(frameGeoParts, false), M.woodDark);
    frame.castShadow = true;
    grp.add(frame);
    const lat = latticeMesh(w - fr * 2, h * 0.44, cols, rows);
    lat.position.y = h / 2 - fr - (h * 0.44) / 2;
    grp.add(lat);
    const lat2 = latticeMesh(w - fr * 2, h * 0.44, cols, rows);
    lat2.position.y = -h / 2 + fr + (h * 0.44) / 2;
    grp.add(lat2);
    return grp;
  }

  /* ---------- the main hall (zhengfang) ---------- */
  const hallG = new THREE.Group(); root.add(hallG);
  const HALL = { px: 17.6, pd: 6.6, pz: -12.3, floorY: 0.85, colH: 3.75 };
  {
    /* stone platform */
    const plat = box(17.6, 0.85, 6.6, M.stone);
    put(plat, 0, 0.425, -12.3);
    hallG.add(plat);
    const edgeMat = M.stoneDark;
    const eF = box(17.6, 0.14, 0.3, edgeMat); put(eF, 0, 0.82, -9.05); hallG.add(eF);
    const eB = box(17.6, 0.14, 0.3, edgeMat); put(eB, 0, 0.82, -15.55); hallG.add(eB);
    for (const s of [-1, 1]) {
      const eS = box(0.3, 0.14, 6.6, edgeMat); put(eS, s * 8.65, 0.82, -12.3); hallG.add(eS);
    }
    /* steps */
    for (let i = 0; i < 3; i++) {
      const st = box(5.4, 0.29, 0.62 - i * 0.02, M.stone);
      put(st, 0, 0.85 - (i + 0.5) * 0.29, -8.75 + i * 0.62);
      hallG.add(st);
    }
    /* wooden floor */
    const floor = box(16.9, 0.12, 6.2, M.floor);
    put(floor, 0, 0.9, -12.3);
    floor.userData.noOutline = true;
    hallG.add(floor);
    /* columns: outer + inner */
    const colXs = [-7.9, -3.2, 3.2, 7.9];
    for (const s of [-1, 1]) for (const x of colXs) {
      const c = cyl(0.2, 0.23, HALL.colH, M.column, 14);
      put(c, x, 0.96 + HALL.colH / 2, s < 0 ? -9.6 : -15.0);
      hallG.add(c);
      const base = cyl(0.3, 0.34, 0.16, M.stoneDark, 14);
      put(base, x, 1.02, s < 0 ? -9.6 : -15.0);
      hallG.add(base);
    }
    /* lintel beams */
    const lintelF = box(17.4, 0.5, 0.42, M.woodDark); put(lintelF, 0, 4.78, -9.6); hallG.add(lintelF);
    const lintelB = box(17.4, 0.5, 0.42, M.woodDark); put(lintelB, 0, 4.78, -15.0); hallG.add(lintelB);
    for (const s of [-1, 1]) {
      const lintelS = box(0.42, 0.5, 5.6, M.woodDark); put(lintelS, s * 7.9, 4.78, -12.3); hallG.add(lintelS);
    }
    /* back wall */
    const backW = box(16.2, 3.8, 0.4, M.wallIn);
    backW.material = M.wallIn;
    put(backW, 0, 2.85, -15.35);
    hallG.add(backW);
    /* side walls with window openings (extruded shape with holes) */
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-2.9, 0.96); shape.lineTo(2.9, 0.96); shape.lineTo(2.9, 4.53); shape.lineTo(-2.9, 4.53); shape.closePath();
      const win = new THREE.Path();
      win.moveTo(-1.35, 2.0); win.lineTo(1.35, 2.0); win.lineTo(1.35, 4.1); win.lineTo(-1.35, 4.1); win.closePath();
      shape.holes.push(win);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
      const w = new THREE.Mesh(g, M.wallIn);
      w.rotation.y = Math.PI / 2;
      w.position.set(s * 8.1, 0, -12.3 - 0.2);
      w.castShadow = w.receiveShadow = true;
      hallG.add(w);
      const winM = latticeWindow(2.5, 1.9, 4, 4);
      put(winM, s * 8.1, 3.06, -12.3, Math.PI / 2);
      hallG.add(winM);
      /* small high window on the west wall interior side only */
      if (s < 0) {
        const hi = new THREE.Path();
        hi.moveTo(1.5, 2.6); hi.lineTo(2.35, 2.6); hi.lineTo(2.35, 3.7); hi.lineTo(1.5, 3.7); hi.closePath();
        /* reuse wall shape: build second wall piece is complex; skip - light comes from front+east */
      }
    }
    /* interior ceiling + beams */
    const ceil = box(16.2, 0.1, 5.6, toon(0x4a3828));
    put(ceil, 0, 4.56, -12.3);
    ceil.userData.noOutline = true;
    hallG.add(ceil);
    for (const bz of [-10.6, -12.3, -14.0]) {
      const beam = box(16.2, 0.34, 0.3, toon(0x5a4030));
      put(beam, 0, 4.38, bz);
      hallG.add(beam);
    }
    /* roof: shell seated on the walls; the band under the eaves closes every gap */
    const roof = roofOf(20.4, 9.0, 3.15, 0.66);
    put(roof, 0, 4.80, -12.3);
    hallG.add(roof);
    {
      /* plaster tympanum above the front lintel */
      const front = box(16.72, 0.44, 0.46, M.wallIn);
      put(front, 0, 5.03 + 0.2, -9.6);
      hallG.add(front);
      const frontBeam = box(16.8, 0.2, 0.5, M.woodDark);
      put(frontBeam, 0, 5.05, -9.6);
      hallG.add(frontBeam);
      /* and above the back wall */
      const back = box(16.4, 0.42, 0.5, M.wallIn);
      put(back, 0, 4.74 + 0.19, -15.35);
      hallG.add(back);
    }
    for (const s of [-1, 1]) {
      /* gable wall triangle, tucked into the roof shell */
      const inf = gableInfill(6.6, 3.15, 0.66, 0.5, M.wallIn, -0.06, 4.5, 8.2 / 10.2);
      inf.rotation.y = Math.PI / 2;
      put(inf, s * 8.2, 4.80, -12.3);
      hallG.add(inf);
    }
    /* plaque + couplets */
    const plaqueTex = canvasTex(512, 160, (g: any) => {
      g.fillStyle = '#1f3038'; g.fillRect(0, 0, 512, 160);
      g.strokeStyle = '#d9a83e'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 140);
      g.strokeStyle = 'rgba(217,168,62,0.5)'; g.lineWidth = 2; g.strokeRect(22, 22, 468, 116);
      g.fillStyle = '#e8bd55';
      g.font = '92px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('秋 水 堂', 256, 86);
    });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.82, 0.14), toon(0xffffff, { map: plaqueTex, rough: 0.55 }));
    put(plaque, 0, 4.62, -9.35);
    plaque.castShadow = true;
    hallG.add(plaque);
    const coupTexR = coupletTex('金风入院银杏老');
    const coupTexL = coupletTex('秋水映窗枫叶红');
    for (const s of [-1, 1]) {
      const tex = s > 0 ? coupTexR : coupTexL;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.3, 0.1), toon(0xffffff, { map: tex }));
      put(b, s * 3.2 - s * 0.3, 2.62, -9.38);
      hallG.add(b);
    }
    /* front bay wall panels around the windows */
    for (const s of [-1, 1]) {
      const topStrip = box(4.7, 0.5, 0.38, M.wallIn);
      put(topStrip, s * 5.55, 4.28, -9.62);
      hallG.add(topStrip);
      for (const fx of [3.29, 7.81]) {
        const filler = box(0.22, 3.57, 0.38, M.wallIn);
        put(filler, s * fx, 2.74, -9.62);
        hallG.add(filler);
      }
      const doorFiller = box(0.26, 3.55, 0.38, M.wallIn);
      put(doorFiller, s * 3.08, 2.73, -9.62);
      hallG.add(doorFiller);
    }
    /* front jianshan doors: 4 leaves, middle two ajar */
    const leafW = 1.48;
    const hingeXs = [-2.96, -1.48, 1.48, 2.96];
    const ajar = [0, -1.9, 1.75, 0];
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      put(pivot, hingeXs[i], 0.96, -9.62);
      const leaf = doorLeaf(leafW, 3.55);
      leaf.position.x = i < 2 ? leafW / 2 : -leafW / 2;
      pivot.add(leaf);
      pivot.rotation.y = ajar[i];
      hallG.add(pivot);
    }
    /* front lattice windows flanking the door bay */
    for (const s of [-1, 1]) {
      const win = latticeWindow(4.35, 3.0, 6, 4);
      put(win, s * 5.55, 2.56, -9.72);
      hallG.add(win);
      const sillB = box(4.6, 0.35, 0.3, M.woodMid);
      put(sillB, s * 5.55, 0.98, -9.7);
      hallG.add(sillB);
    }
    /* rafter tips under front eave */
    {
      const parts: any[] = []
      for (let i = 0; i < 26; i++) {
        const r = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
        r.rotateX(Math.PI / 2);
        r.translate(-9.9 + i * 0.79, 4.42, -0.12);
        parts.push(r);
      }
      const m = new THREE.Mesh(mergeGeometries(parts, false), M.woodMid);
      m.position.z = -8.05;
      m.castShadow = true;
      hallG.add(m);
    }
  }
  function coupletTex(text: any) {
    return canvasTex(128, 768, (g: any, w: any, h: any) => {
      g.fillStyle = '#93261a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a83e'; g.lineWidth = 5; g.strokeRect(7, 7, w - 14, h - 14);
      g.fillStyle = '#ecd07c';
      g.font = '64px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = Array.from(text);
      chars.forEach((ch: any, i: any) => g.fillText(ch, w / 2, 78 + i * 104));
    });
  }

  /* ---------- hall interior furnishing ---------- */
  const furnG = new THREE.Group(); root.add(furnG);
  const FY = 0.96; /* floor top */
  {
    /* carpet */
    const carpetTex = canvasTex(512, 384, (g: any) => {
      g.fillStyle = '#8e3a2f'; g.fillRect(0, 0, 512, 384);
      g.strokeStyle = '#2e4a5a'; g.lineWidth = 16; g.strokeRect(14, 14, 484, 356);
      g.strokeStyle = '#d9a83e'; g.lineWidth = 4; g.strokeRect(38, 38, 436, 308);
      g.strokeStyle = 'rgba(217,168,62,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.arc(256, 192, 66, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(256, 192, 44, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#d9a83e';
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        g.beginPath(); g.arc(256 + Math.cos(a) * 88, 192 + Math.sin(a) * 66, 7, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(46,74,90,0.55)';
      for (let x = 60; x < 460; x += 40) for (const yy of [28, 356]) { g.beginPath(); g.arc(x, yy, 5, 0, Math.PI * 2); g.fill(); }
    });
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 2.6), toon(0xffffff, { map: carpetTex }));
    carpet.position.set(0, FY + 0.02, -12.35);
    carpet.receiveShadow = true;
    carpet.userData.noOutline = true;
    furnG.add(carpet);

    /* altar table (tiaoan) against the north wall */
    const an = new THREE.Group();
    const anTop = box(4.3, 0.12, 0.9, M.woodMid); anTop.position.y = 1.12; an.add(anTop);
    const anApron = box(4.0, 0.3, 0.7, M.woodDark); anApron.position.y = 0.92; an.add(anApron);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.14, 1.06, 0.14, M.woodDark);
      leg.position.set(sx * 2.0, 0.53, sz * 0.32); an.add(leg);
    }
    put(an, 0, FY, -14.75);
    furnG.add(an);
    /* on the altar table: vases, incense burner, candles, books */
    function vase(x: any, z: any, s: any, col: any) {
      const pts: any[] = []
      const prof = [[0, 0], [0.16, 0.02], [0.24, 0.1], [0.3, 0.28], [0.24, 0.5], [0.15, 0.68], [0.18, 0.82], [0.13, 0.92], [0.17, 0.98]];
      for (const [px, py] of prof) pts.push(new THREE.Vector2(px * s, py * s));
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), toon(col));
      m.position.set(x, FY + 1.18, z);
      m.castShadow = true;
      return m;
    }
    const vw = vase(-1.45, -14.72, 0.62, 0xeef0ec); furnG.add(vw);
    const vw2 = vase(1.45, -14.72, 0.62, 0xeef0ec); furnG.add(vw2);
    /* blue bands on vases */
    for (const vx of [-1.45, 1.45]) {
      const band = cyl(0.155, 0.17, 0.1, toon(0x4a6d9c), 20);
      band.position.set(vx, FY + 1.32, -14.72);
      band.userData.noOutline = true;
      furnG.add(band);
      /* dried branches with red berries */
      const br = new THREE.Group();
      const t1 = cyl(0.012, 0.02, 0.6, M.trunkDark, 6); t1.position.y = 0.3; t1.rotation.z = 0.12; br.add(t1);
      const t2 = cyl(0.008, 0.014, 0.4, M.trunkDark, 6); t2.position.set(0.1, 0.62, 0); t2.rotation.z = -0.5; br.add(t2);
      for (let i = 0; i < 5; i++) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(0xc2402a));
        berry.position.set(rr(-0.16, 0.2), rr(0.5, 0.85), rr(-0.08, 0.08)); br.add(berry);
      }
      put(br, vx, FY + 1.18, -14.72);
      furnG.add(br);
    }
    /* incense burner */
    const burner = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), toon(0x6a5a3a));
    bb.scale.y = 0.72; bb.position.y = 0.16; burner.add(bb);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const leg = cyl(0.02, 0.025, 0.14, toon(0x5a4c30), 8);
      leg.position.set(Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12); burner.add(leg);
    }
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), toon(0x5a4c30));
      ear.position.set(s * 0.2, 0.3, 0); ear.rotation.z = s * Math.PI / 2; burner.add(ear);
    }
    put(burner, 0, FY + 1.18, -14.68);
    furnG.add(burner);
    /* candlesticks */
    for (const sx of [-1, 1]) {
      const cs = new THREE.Group();
      const b = cyl(0.09, 0.12, 0.06, M.bronze, 12); b.position.y = 0.03; cs.add(b);
      const st = cyl(0.02, 0.03, 0.3, M.bronze, 8); st.position.y = 0.2; cs.add(st);
      const cup = cyl(0.06, 0.04, 0.05, M.bronze, 10); cup.position.y = 0.37; cs.add(cup);
      const candle = cyl(0.035, 0.035, 0.24, toon(0xd8d2c0), 10); candle.position.y = 0.5; cs.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
      flame.scale.y = 1.7; flame.position.y = 0.66; cs.add(flame);
      put(cs, sx * 2.0, FY + 1.18, -14.7);
      furnG.add(cs);
    }
    const books = box(0.5, 0.09, 0.34, toon(0x4a6a8a)); books.position.set(0.62, FY + 1.25, -14.66); books.rotation.y = 0.2; furnG.add(books);
    const books2 = box(0.44, 0.08, 0.3, toon(0x8a5a34)); books2.position.set(0.64, FY + 1.33, -14.64); books2.rotation.y = -0.1; furnG.add(books2);

    /* hanging scrolls on the north wall */
    function scrollTex(_chars: any, draw: any) {
      return canvasTex(128, 384, (g: any) => {
        g.fillStyle = '#eae1c8'; g.fillRect(0, 0, 128, 384);
        g.fillStyle = 'rgba(120,100,70,0.15)';
        for (let k = 0; k < 40; k++) g.fillRect(rng() * 128, rng() * 384, 3, 2);
        draw(g);
        g.fillStyle = '#a5281c';
        g.fillRect(94, 320, 22, 22);
      });
    }
    const landTex = scrollTex(null, (g: any) => {
      g.fillStyle = 'rgba(70,80,90,0.75)';
      g.beginPath(); g.moveTo(20, 150); g.quadraticCurveTo(45, 60, 70, 130); g.quadraticCurveTo(90, 170, 108, 120); g.lineTo(108, 150); g.lineTo(20, 150); g.fill();
      g.fillStyle = 'rgba(70,80,90,0.45)';
      g.beginPath(); g.moveTo(30, 190); g.quadraticCurveTo(60, 130, 100, 180); g.lineTo(100, 200); g.lineTo(30, 200); g.fill();
      g.strokeStyle = 'rgba(40,50,60,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(40, 230); g.lineTo(40, 290); g.stroke();
      g.beginPath(); g.arc(40, 300, 14, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    });
    const calTex = scrollTex(null, (g: any) => {
      g.fillStyle = '#3a3430';
      g.font = '52px ' + FONT;
      g.textAlign = 'center';
      const chars = ['静', '观', '秋', '水'];
      chars.forEach((c: any, i: any) => g.fillText(c, 64, 80 + i * 68));
    });
    function hangingScroll(tex: any, x: any, y: any, z: any) {
      const grp = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.15, 0.04), toon(0xffffff, { map: tex }));
      p.position.y = 0; p.userData.noOutline = true; grp.add(p);
      const tr = cyl(0.03, 0.03, 0.92, M.woodDark, 10); tr.rotation.z = Math.PI / 2; tr.position.y = 1.1; grp.add(tr);
      const br = cyl(0.035, 0.035, 0.92, M.woodDark, 10); br.rotation.z = Math.PI / 2; br.position.y = -1.1; grp.add(br);
      put(grp, x, y, z);
      return grp;
    }
    furnG.add(hangingScroll(landTex, -1.6, FY + 2.85, -15.1));
    furnG.add(hangingScroll(calTex, 1.6, FY + 2.85, -15.1));

    /* eight-immortals table + four armchairs */
    const table = new THREE.Group();
    const tTop = box(1.6, 0.12, 1.6, M.woodMid); tTop.position.y = 0.94; table.add(tTop);
    const tApron = box(1.4, 0.22, 1.4, M.woodDark); tApron.position.y = 0.78; table.add(tApron);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = box(0.15, 0.88, 0.15, M.woodDark);
      leg.position.set(sx * 0.66, 0.44, sz * 0.66); table.add(leg);
    }
    const str = box(1.32, 0.08, 0.1, M.woodDark); str.position.set(0, 0.18, 0.62); table.add(str);
    const str2 = str.clone(); str2.position.z = -0.62; table.add(str2);
    put(table, 0, FY, -12.35);
    furnG.add(table);
    /* tea set on the table */
    const pot = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), toon(0x8f5a36));
    pb.scale.y = 0.75; pb.position.y = 0.07; pot.add(pb);
    const spout = cyl(0.015, 0.025, 0.12, toon(0x8f5a36), 8);
    spout.rotation.z = 1.1; spout.position.set(0.11, 0.09, 0); pot.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), toon(0x8f5a36));
    handle.position.set(-0.1, 0.08, 0); handle.rotation.z = -Math.PI / 2; pot.add(handle);
    const lid = cyl(0.045, 0.05, 0.02, toon(0x7a4a2c), 10); lid.position.y = 0.14; pot.add(lid);
    put(pot, 0.3, FY + 1.0, -12.2, 0.5);
    furnG.add(pot);
    for (const [cx, cz] of [[-0.25, -12.1], [-0.05, -12.55], [0.42, -12.6]]) {
      const cup = cyl(0.05, 0.035, 0.05, toon(0xe8e2d2), 10);
      put(cup, cx, FY + 1.06, cz);
      furnG.add(cup);
    }
    function armchair(x: any, z: any, ry: any) {
      const g = new THREE.Group();
      const seat = box(0.56, 0.1, 0.5, M.woodMid); seat.position.y = 0.48; g.add(seat);
      const cush = box(0.5, 0.06, 0.44, M.fabricRed); cush.position.y = 0.56; g.add(cush);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.08, 0.48, 0.08, M.woodDark);
        leg.position.set(sx * 0.24, 0.24, sz * 0.2); g.add(leg);
      }
      const back = box(0.56, 0.62, 0.07, M.woodMid); back.position.set(0, 0.86, -0.22); g.add(back);
      const crest = cyl(0.03, 0.03, 0.6, M.woodDark, 10);
      crest.rotation.z = Math.PI / 2; crest.position.set(0, 1.18, -0.22); g.add(crest);
      for (const sx of [-1, 1]) {
        const arm = box(0.07, 0.06, 0.44, M.woodDark);
        arm.position.set(sx * 0.28, 0.68, 0); g.add(arm);
        const armPost = box(0.06, 0.2, 0.06, M.woodDark);
        armPost.position.set(sx * 0.28, 0.58, 0.18); g.add(armPost);
      }
      put(g, x, FY, z, ry);
      return g;
    }
    furnG.add(armchair(-1.15, -12.95, 0));
    furnG.add(armchair(1.15, -12.95, 0));
    furnG.add(armchair(-1.15, -11.75, Math.PI));
    furnG.add(armchair(1.15, -11.75, Math.PI));

    /* arhat bed along the west wall */
    const bed = new THREE.Group();
    const bedBase = box(1.5, 0.42, 2.7, M.woodDark); bedBase.position.y = 0.21; bed.add(bedBase);
    const bedMat = box(1.34, 0.14, 2.5, M.fabricBlue); bedMat.position.y = 0.49; bed.add(bedMat);
    const quilt = box(1.34, 0.1, 1.2, toon(0xc8542e)); quilt.position.set(0, 0.58, 0.5); quilt.rotation.z = 0.02; bed.add(quilt);
    for (const sz of [-1.35, 0, 1.35]) {
      const rail = box(1.5, 0.3, 0.09, M.woodMid);
      rail.position.set(0, 0.62, sz); bed.add(rail);
    }
    for (const sx of [-0.72, 0.72]) {
      const rail = box(0.09, 0.3, 2.7, M.woodMid);
      rail.position.set(sx, 0.62, 0); bed.add(rail);
    }
    const smallTable = box(0.42, 0.32, 0.42, M.woodMid); smallTable.position.set(0.28, 0.68, -0.6); bed.add(smallTable);
    const bedCup = cyl(0.04, 0.03, 0.05, toon(0xe8e2d2), 10); bedCup.position.set(0.28, 0.88, -0.6); bed.add(bedCup);
    put(bed, -6.55, FY, -12.7, 0);
    furnG.add(bed);

    /* folding screen behind the bed */
    const screenG = new THREE.Group();
    function panelTex(seedN: any) {
      return canvasTex(192, 384, (g: any) => {
        g.fillStyle = '#e6dcc2'; g.fillRect(0, 0, 192, 384);
        g.strokeStyle = '#5e3a22'; g.lineWidth = 10; g.strokeRect(5, 5, 182, 374);
        g.fillStyle = 'rgba(70,80,95,0.7)';
        g.beginPath();
        g.moveTo(18, 250); g.quadraticCurveTo(60 + seedN * 18, 120 + seedN * 30, 105, 190);
        g.quadraticCurveTo(140, 240, 176, 160); g.lineTo(176, 250); g.lineTo(18, 250); g.fill();
        g.fillStyle = 'rgba(70,80,95,0.4)';
        g.beginPath();
        g.moveTo(18, 210); g.quadraticCurveTo(80, 150 + seedN * 20, 176, 210); g.lineTo(176, 240); g.lineTo(18, 240); g.fill();
        g.fillStyle = 'rgba(217,140,60,0.5)';
        g.beginPath(); g.arc(140 - seedN * 30, 100, 16, 0, Math.PI * 2); g.fill();
      });
    }
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      const fr = box(1.24, 2.05, 0.07, M.woodDark); fr.position.y = 1.02; p.add(fr);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.03), toon(0xffffff, { map: panelTex(i) }));
      pan.position.set(0, 1.02, 0.05); pan.userData.noOutline = true; p.add(pan);
      p.rotation.y = (i - 1) * 0.42;
      p.position.x = Math.sin((i - 1) * 0.42) * -1.05;
      screenG.add(p);
    }
    put(screenG, -6.6, FY, -14.1, 0.9);
    furnG.add(screenG);

    /* curio shelf (bogujia) SW corner */
    function curioShelf(x: any, z: any, ry: any) {
      const g = new THREE.Group();
      const W = 1.5, H = 2.5, D = 0.42;
      const body = box(W, H, D, M.woodMid); body.position.y = H / 2; g.add(body);
      /* hollow it visually with dark inset back */
      const back = box(W - 0.16, H - 0.16, 0.05, toon(0x3a2818));
      back.position.set(0, H / 2, -D / 2 + 0.06); back.userData.noOutline = true; g.add(back);
      for (let i = 1; i < 4; i++) {
        const sh = box(W - 0.14, 0.05, D - 0.06, M.woodDark);
        sh.position.set(0, i * H / 4, 0.02); g.add(sh);
      }
      for (const sx of [-0.25, 0.25]) {
        const dv = box(0.045, H - 0.14, D - 0.08, M.woodDark);
        dv.position.set(sx, H / 2, 0.02); g.add(dv);
      }
      /* curios */
      const curioCols = [0x9fb8a4, 0xe8e2d2, 0x6a5a3a, 0xa5281c, 0x4a6d9c, 0xd9a83e];
      let ci = 0;
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        if (rng() < 0.2) continue;
        const cx = (col - 1) * 0.44 + rr(-0.03, 0.03);
        const cy = (row + 0.5) * H / 4 + 0.05;
        const kind = Math.floor(rng() * 3);
        let obj;
        if (kind === 0) {
          obj = new THREE.Mesh(new THREE.SphereGeometry(rr(0.07, 0.11), 12, 10), toon(curioCols[ci++ % 6]));
          obj.scale.y = 0.8; obj.position.set(cx, cy + 0.06, 0.05);
        } else if (kind === 1) {
          obj = new THREE.Mesh(new THREE.BoxGeometry(rr(0.12, 0.2), rr(0.08, 0.16), 0.1), toon(curioCols[ci++ % 6]));
          obj.position.set(cx, cy + 0.06, 0.05);
        } else {
          const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.01), new THREE.Vector2(0.07, 0.06), new THREE.Vector2(0.05, 0.14), new THREE.Vector2(0.06, 0.18)];
          obj = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), toon(curioCols[ci++ % 6]));
          obj.position.set(cx, cy, 0.05);
        }
        obj.castShadow = true;
        g.add(obj);
      }
      put(g, x, FY, z, ry);
      return g;
    }
    furnG.add(curioShelf(-7.35, -10.7, Math.PI / 2));

    /* bookshelf NE corner with scrolls */
    const bookshelf = new THREE.Group();
    {
      const W = 1.5, H = 2.4, D = 0.4;
      const body = box(W, H, D, M.woodMid); body.position.y = H / 2; bookshelf.add(body);
      const back = box(W - 0.16, H - 0.16, 0.05, toon(0x3a2818));
      back.position.set(0, H / 2, -D / 2 + 0.06); back.userData.noOutline = true; bookshelf.add(back);
      for (let i = 1; i < 4; i++) {
        const sh = box(W - 0.14, 0.05, D - 0.06, M.woodDark);
        sh.position.set(0, i * H / 4, 0.02); bookshelf.add(sh);
      }
      const bookCols = [0x4a6a8a, 0x8a5a34, 0x6a7a52, 0x9c4a3a, 0x3a5a6a];
      for (let row = 0; row < 4; row++) {
        let bx = -W / 2 + 0.14;
        while (bx < W / 2 - 0.2) {
          const bw = rr(0.07, 0.13), bh = rr(0.28, 0.42);
          const b = box(bw, bh, 0.26, toon(bookCols[Math.floor(rng() * 5)]));
          b.position.set(bx + bw / 2, row * H / 4 + bh / 2 + 0.06, 0.02);
          b.rotation.z = rr(-0.05, 0.05);
          bookshelf.add(b);
          bx += bw + 0.015;
        }
        if (row === 2) {
          for (let k = 0; k < 3; k++) {
            const sc = cyl(0.055, 0.055, 0.5, toon(0xd9c9a0), 10);
            sc.rotation.z = Math.PI / 2;
            sc.position.set(-0.35 + k * 0.35, row * H / 4 + 0.14, 0.02);
            bookshelf.add(sc);
            const capEnd = cyl(0.058, 0.058, 0.03, toon(0x6a5a3a), 10);
            capEnd.rotation.z = Math.PI / 2;
            capEnd.position.set(-0.35 + k * 0.35 + 0.26, row * H / 4 + 0.14, 0.02);
            bookshelf.add(capEnd);
          }
        }
      }
      put(bookshelf, 7.4, FY, -14.0, -Math.PI / 2);
      furnG.add(bookshelf);
    }
    /* writing desk near the east window */
    const desk = new THREE.Group();
    {
      const top = box(1.35, 0.09, 0.68, M.woodMid); top.position.y = 0.78; desk.add(top);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.1, 0.76, 0.1, M.woodDark);
        leg.position.set(sx * 0.58, 0.38, sz * 0.26); desk.add(leg);
      }
      const brushPot = cyl(0.06, 0.07, 0.14, toon(0x4a6d9c), 12);
      brushPot.position.set(0.4, 0.9, 0.1); desk.add(brushPot);
      const brush = cyl(0.008, 0.012, 0.3, M.trunkDark, 6);
      brush.position.set(0.4, 1.1, 0.1); brush.rotation.z = 0.25; desk.add(brush);
      const page1 = box(0.4, 0.015, 0.3, toon(0xe8e0c8)); page1.position.set(-0.2, 0.835, 0); page1.rotation.y = 0.15; desk.add(page1);
      const page2 = page1.clone(); page2.rotation.z = 0.35; page2.position.y = 0.86; desk.add(page2);
      const chairS = new THREE.Group();
      const st = box(0.45, 0.07, 0.42, M.woodMid); st.position.y = 0.46; chairS.add(st);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.07, 0.45, 0.07, M.woodDark);
        leg.position.set(sx * 0.18, 0.22, sz * 0.16); chairS.add(leg);
      }
      const backS = box(0.45, 0.5, 0.06, M.woodMid); backS.position.set(0, 0.75, -0.18); chairS.add(backS);
      put(chairS, 5.3, FY, -12.2, Math.PI / 2);
      furnG.add(chairS);
      put(desk, 6.0, FY, -12.2, Math.PI / 2);
      furnG.add(desk);
    }
    /* palace lanterns hanging inside */
    function palaceLantern(scale: any = 1) {
      const g = new THREE.Group();
      const tex = canvasTex(128, 128, (g2: any) => {
        g2.fillStyle = '#b8321f'; g2.fillRect(0, 0, 128, 128);
        const gr = g2.createRadialGradient(64, 64, 10, 64, 64, 70);
        gr.addColorStop(0, 'rgba(255,190,90,0.95)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
        g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
        g2.strokeStyle = 'rgba(90,20,10,0.8)'; g2.lineWidth = 3;
        for (let i = 0; i <= 4; i++) { g2.beginPath(); g2.moveTo(i * 32, 0); g2.lineTo(i * 32, 128); g2.stroke(); }
        for (let j = 0; j <= 4; j++) { g2.beginPath(); g2.moveTo(0, j * 32); g2.lineTo(128, j * 32); g2.stroke(); }
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 6), toon(0xffffff, { map: tex, emissive: 0xff8040, emissiveIntensity: 0.6, emissiveMap: tex }));
      body.userData.noOutline = true;
      g.add(body);
      for (const sy of [0.24, -0.24]) {
        const cap = cyl(0.09, 0.11, 0.06, M.gold, 6); cap.position.y = sy; g.add(cap);
      }
      const tassel = box(0.03, 0.22, 0.03, toon(0xb8321f)); tassel.position.y = -0.36; g.add(tassel);
      g.scale.setScalar(scale);
      return g;
    }
    const pl1 = palaceLantern(1.2); pl1.position.set(0, 3.85, -12.35); furnG.add(pl1);
    const cord1 = cyl(0.012, 0.012, 0.55, toon(0x3a2818), 6); cord1.position.set(0, 4.28, -12.35); cord1.userData.noOutline = true; furnG.add(cord1);
    const pl2 = palaceLantern(1); pl2.position.set(-2.6, 3.9, -10.6); furnG.add(pl2);
    const cord2 = cyl(0.012, 0.012, 0.5, toon(0x3a2818), 6); cord2.position.set(-2.6, 4.3, -10.6); cord2.userData.noOutline = true; furnG.add(cord2);
    furnG.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /* ---------- wings (xiangfang) with verandas ---------- */
  function buildWing(side: any) {
    const g = new THREE.Group();
    const s = side;
    const bx = s * 11.65, bz = -5.4;
    /* body: 再削矮——屋面在墙缘中段（az=0.8、脊向中点）最低只到 y≈3.59，
       墙顶必须压到 3.55 以下才全线不穿模 */
    const body = box(3.5, 3.3, 6.4, M.wallOut);
    put(body, bx, 1.65, bz);
    g.add(body);
    /* wooden door + window on courtyard face */
    const face = bx - s * 1.78;
    const door = doorLeaf(1.15, 2.4);
    put(door, face - s * 0.02, 0.05, bz + 1.4, -Math.PI / 2 * s + (s > 0 ? Math.PI : 0));
    door.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    put(door, face - s * 0.05, 0.02, bz + 1.4);
    g.add(door);
    const win = latticeWindow(1.7, 1.5, 3, 3);
    put(win, face - s * 0.06, 1.9, bz - 1.2);
    win.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(win);
    /* roof, ridge along z */
    const roof = roofOf(7.0, 4.4, 1.35, 0.4);
    roof.rotation.y = Math.PI / 2;
    put(roof, bx, 3.45, bz);
    g.add(roof);
    for (const ez of [-1, 1]) {
      const inf = gableInfill(3.5, 1.35, 0.4, 0.4, M.wallOut, -0.06, 2.2, 1.75 / 2.2);
      put(inf, bx, 3.45, bz + ez * 3.12);
      g.add(inf);
    }
    /* veranda */
    const vp = box(1.3, 0.4, 6.8, M.stone);
    put(vp, bx - s * 2.45, 0.2, bz);
    g.add(vp);
    for (const vz of [-2.6, 0, 2.6]) {
      const col = cyl(0.13, 0.15, 2.75, M.column, 12);
      put(col, bx - s * 3.02, 1.62, bz + vz);
      g.add(col);
    }
    const vBeam = box(1.2, 0.26, 6.6, M.woodDark);
    put(vBeam, bx - s * 3.02, 3.05, bz);
    g.add(vBeam);
    const vRoof = roofOf(7.6, 2.2, 0.42, 0.2, 0.98, { thick: 0.22 });
    vRoof.rotation.y = Math.PI / 2;
    put(vRoof, bx - s * 2.75, 2.95, bz);
    g.add(vRoof);
    /* lantern hanging from veranda beam */
    const lantPivot = new THREE.Group();
    put(lantPivot, bx - s * 2.95, 3.0, bz + 2.0);
    const cordL = cyl(0.012, 0.012, 0.35, toon(0x3a2818), 6);
    cordL.position.y = -0.17; cordL.userData.noOutline = true; lantPivot.add(cordL);
    const lamp = new THREE.Group();
    const lbody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), M.lanternRed);
    lbody.scale.y = 0.82; lbody.position.y = -0.68; lamp.add(lbody);
    for (const sy of [-0.44, -0.92]) {
      const cap = cyl(0.1, 0.13, 0.07, M.gold, 10);
      cap.position.y = sy; lamp.add(cap);
    }
    const tas = box(0.035, 0.24, 0.035, toon(0xb8321f));
    tas.position.y = -1.14; lamp.add(tas);
    lantPivot.add(lamp);
    g.add(lantPivot);
    lanternPivots.push(lantPivot);
    /* chimney on the west wing */
    if (s < 0) {
      const chim = box(0.55, 1.5, 0.55, toon(0x8a8078));
      put(chim, bx + 0.4, 4.1, bz - 1.6);
      g.add(chim);
      const capC = box(0.7, 0.16, 0.7, toon(0x6e665e));
      put(capC, bx + 0.4, 4.9, bz - 1.6);
      g.add(capC);
      chimneyTop.set(bx + 0.4, 5.0, bz - 1.6);
    }
    root.add(g);
    bakeOutline(g, 0.05);
    return g;
  }
  const lanternPivots: any[] = []
  const chimneyTop = new THREE.Vector3();
  buildWing(1);
  buildWing(-1);

  /* ---------- courtyard props ---------- */
  const propsG = new THREE.Group(); root.add(propsG);
  /* water vat with koi */
  const waterUniforms = { uT: { value: 0 } };
  {
    const vat = new THREE.Group();
    const vatGlow = new THREE.PointLight(0xffd9a0, 4, 6, 2);
    vatGlow.position.set(0, 2.4, 0);
    vat.add(vatGlow);
    const outer = cyl(1.16, 0.9, 1.5, M.ceramicDark, 26);
    outer.userData.noOutline = true;
    outer.position.y = 0.75; vat.add(outer);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.09, 10, 30), toon(0x39414a));
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.5; rim.userData.noOutline = true; vat.add(rim);
    const rimLine = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.028, 6, 40), M.inkLine);
    rimLine.rotation.x = Math.PI / 2; rimLine.position.y = 1.52; rimLine.userData.noOutline = true; vat.add(rimLine);
    const band = cyl(1.18, 1.18, 0.18, toon(0x4a4038), 26);
    band.position.y = 1.18; band.userData.noOutline = true; vat.add(band);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI), toon(0x4a4038));
      ear.position.set(s * 1.1, 1.2, 0); ear.rotation.y = Math.PI / 2;
      ear.userData.noOutline = true;
      vat.add(ear);
    }
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 0.9, 1.3, 26, 1, true), toon(0x1a2028, { side: THREE.BackSide, rough: 0.9 }));
    inner.position.y = 0.72; inner.userData.noOutline = true; vat.add(inner);
    const vbottom = cyl(0.95, 0.95, 0.06, toon(0x232a34), 26);
    vbottom.position.y = 0.12; vbottom.userData.noOutline = true; vat.add(vbottom);
    /* water surface with animated golden ripples */
    const waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: waterUniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv;
      void main(){
        vec2 c = vUv - 0.5;
        float r = length(c);
        float w = sin((vUv.x*26.0 + vUv.y*15.0)*1.7 + uT*1.5)
                * sin(vUv.y*27.0 - uT*1.15)
                * sin((vUv.x - vUv.y)*21.0 + uT*0.6);
        float ring = sin(r*42.0 - uT*2.4)*0.5+0.5;
        ring *= smoothstep(0.52, 0.10, r);
        float spark = pow(max(w, 0.0), 2.2);
        vec3 col = mix(vec3(0.24,0.52,0.44), vec3(0.62,0.85,0.66), ring*0.6 + spark*0.35);
        float glint = exp(-pow(length(c - vec2(-0.30,-0.24))*5.0, 2.0));
        col += vec3(1.0,0.86,0.55)*(spark*0.35 + glint*0.85 + ring*0.14);
        gl_FragColor = vec4(col, 0.85);
      }`
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.36;
    water.renderOrder = 5;
    water.userData.noOutline = true;
    vat.add(water);
    /* koi */
    const kois: any[] = []
    const koiCols = [0xe8632c, 0xe8e2da, 0xd94f2a];
    for (let i = 0; i < 3; i++) {
      const k = new THREE.Group();
      const glow = { emissive: koiCols[i], emissiveIntensity: 0.25 };
      const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), toon(koiCols[i], glow));
      bodyM.scale.set(1.5, 0.62, 0.62); k.add(bodyM);
      if (i === 1) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), toon(0xd94f2a, glow));
        spot.position.set(0.08, 0.05, 0.02); spot.scale.set(1.3, 0.6, 0.7); k.add(spot);
      }
      const tail = new THREE.Group();
      const tf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), toon(koiCols[i] === 0xe8e2da ? 0xe07030 : 0xf0e8dc, { emissive: 0xf0c8a0, emissiveIntensity: 0.2 }));
      tf.rotation.z = Math.PI / 2; tf.scale.x = 0.45; tf.scale.z = 1.8;
      tf.position.x = 0.24; tail.add(tf);
      tail.position.x = -0.24;
      k.add(tail);
      const finL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), toon(0xf0e8dc, { emissive: 0xf0e8dc, emissiveIntensity: 0.18 }));
      finL.rotation.x = Math.PI / 2; finL.scale.set(1, 0.4, 1);
      finL.position.set(0.04, -0.02, 0.1); k.add(finL);
      const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), toon(0x1a1a1a));
      eye1.position.set(0.19, 0.03, 0.06); k.add(eye1);
      const eye2 = eye1.clone(); eye2.position.z = -0.06; k.add(eye2);
      k.userData.tail = tail;
      k.scale.setScalar(1.22);
      vat.add(k);
      kois.push(k);
    }
    /* floating ginkgo leaves on the water */
    const floatLeaves: any[] = []
    const fGeo = new THREE.PlaneGeometry(0.24, 0.24);
    const fMat = new THREE.MeshBasicMaterial({ map: TEX_GINKGO, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fGeo, fMat);
      f.rotation.x = -Math.PI / 2;
      f.rotation.z = rng() * Math.PI * 2;
      water.add(f);
      floatLeaves.push(f);
    }
    put(vat, 7.1, 0, -4.7);
    propsG.add(vat);
    bakeOutline(vat, 0.04);
    anims.push((t: any, dt: any) => {
      waterUniforms.uT.value = t;
      kois.forEach((k: any, i: any) => {
        const a = t * (0.32 + i * 0.07) + i * 2.1;
        const rad = 0.55 + Math.sin(t * 0.3 + i) * 0.1;
        k.position.set(Math.cos(a) * rad, 1.295 + Math.sin(t * 0.9 + i * 2) * 0.025, Math.sin(a) * rad);
        k.rotation.y = -a + Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.15;
        k.userData.tail.rotation.y = Math.sin(t * 6 + i * 3) * 0.4;
      });
      floatLeaves.forEach((f: any, i: any) => {
        const a = t * 0.1 + i * 1.7;
        f.position.set(Math.cos(a) * 0.45, 0.004, Math.sin(a) * 0.45);
        f.rotation.z += dt * 0.15;
      });
    });
  }
  /* taihu rockery */
  {
    const rockery = new THREE.Group();
    const slab = box(3.0, 0.28, 2.2, M.stoneDark); slab.position.y = 0.14; rockery.add(slab);
    function taihuRock(r: any, x: any, y: any, z: any, sy: any) {
      const geo = new THREE.IcosahedronGeometry(r, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = 0.72 + rng() * 0.55;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, M.rock);
      m.scale.y = sy;
      m.position.set(x, y, z);
      m.rotation.y = rng() * Math.PI;
      m.castShadow = m.receiveShadow = true;
      return m;
    }
    rockery.add(taihuRock(0.8, -0.3, 0.85, 0.1, 1.5));
    rockery.add(taihuRock(0.55, 0.55, 0.6, -0.35, 1.2));
    rockery.add(taihuRock(0.45, -0.85, 0.5, -0.3, 1.1));
    rockery.add(taihuRock(0.5, 0.15, 1.9, -0.15, 1.4));
    rockery.add(taihuRock(0.3, -0.15, 2.6, -0.2, 1.2));
    for (let i = 0; i < 5; i++) {
      const moss = new THREE.Mesh(new THREE.SphereGeometry(rr(0.1, 0.2), 8, 6), toon(0x6a7d48));
      moss.scale.y = 0.5;
      moss.position.set(rr(-1.2, 1.2), 0.3, rr(-0.8, 0.8));
      rockery.add(moss);
    }
    put(rockery, -10.6, 0, -6.2, 0.4);
    propsG.add(rockery);
    bakeOutline(rockery, 0.045);
  }
  /* flower pots: chrysanthemums & bonsai */
  function chrysPot(x: any, z: any, scale: any = 1, onFloorY: any = 0) {
    const g = new THREE.Group();
    const potPts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0.01), new THREE.Vector2(0.2, 0.1), new THREE.Vector2(0.24, 0.24), new THREE.Vector2(0.26, 0.28)];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(potPts, 16), toon(0x9c5a34));
    pot.scale.setScalar(scale); pot.castShadow = true;
    g.add(pot);
    const soil = cyl(0.22 * scale, 0.22 * scale, 0.03, toon(0x4a3828), 14);
    soil.position.y = 0.27 * scale; soil.userData.noOutline = true; g.add(soil);
    const leafB = new THREE.Mesh(new THREE.SphereGeometry(0.17 * scale, 10, 8), toon(0x5f7d40));
    leafB.scale.y = 0.55; leafB.position.y = 0.33 * scale; g.add(leafB);
    const cols = [0xffd44a, 0xf09a3e, 0xe8e2da, 0xd94f2a];
    const base = Math.floor(rng() * 4);
    for (let i = 0; i < 6; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 10, 8), toon(cols[(base + (rng() < 0.25 ? 2 : 0)) % 4]));
      fl.position.set(rr(-0.14, 0.14) * scale, rr(0.36, 0.5) * scale, rr(-0.14, 0.14) * scale);
      fl.castShadow = true;
      g.add(fl);
    }
    put(g, x, onFloorY, z, rng() * Math.PI * 2);
    return g;
  }
  for (const x of [2.6, 5.6, 8.4]) propsG.add(chrysPot(x, 7.1, 1.15));
  propsG.add(chrysPot(13.0, 4.8, 1.0));
  propsG.add(chrysPot(13.0, 1.4, 1.1));
  propsG.add(chrysPot(-13.0, 4.2, 1.0));
  propsG.add(chrysPot(13.1, 12.8, 1.0));
  propsG.add(chrysPot(2.9, -9.4, 0.85, 0.85));
  propsG.add(chrysPot(-2.9, -9.4, 0.85, 0.85));
  /* potted plants lining both sides of the slab path */
  const pathPotSpots = [
    [-1.62, 10.3, 1.05], [1.62, 9.35, 0.95], [-1.62, 6.6, 1.1], [1.62, 5.7, 0.92],
    [-1.62, 2.95, 0.98], [1.62, 2.05, 1.08], [-1.62, -0.85, 1.0], [1.62, -1.8, 0.95],
    [-1.62, -4.5, 1.06], [1.62, -5.42, 0.98], [-1.75, -6.85, 1.0],
    [-4.7, 12.6, 0.95], [4.7, 12.6, 0.95], [-4.3, 14.35, 0.9], [4.3, 14.35, 0.9]
  ];
  for (const [px, pz, sc] of pathPotSpots) propsG.add(chrysPot(px, pz, sc));
  propsG.add(bonsai(-4.55, 10.9, 0, 1));
  propsG.add(bonsai(4.55, 10.9, 0, -1));
  function bonsai(x: any, z: any, y: any, lean: any) {
    const g = new THREE.Group();
    const potPts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0.01), new THREE.Vector2(0.34, 0.08), new THREE.Vector2(0.3, 0.18), new THREE.Vector2(0.34, 0.2)];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(potPts, 16), toon(0x5a6a7a));
    pot.castShadow = true;
    g.add(pot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.6, 8), M.trunkDark);
    trunk.position.set(lean * 0.1, 0.45, 0);
    trunk.rotation.z = -lean * 0.4;
    g.add(trunk);
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(0x5f7d40));
    b1.scale.set(1.3, 0.6, 1); b1.position.set(-lean * 0.12, 0.68, 0); g.add(b1);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(0x6d8a4a));
    b2.scale.y = 0.7; b2.position.set(lean * 0.18, 0.58, 0.05); g.add(b2);
    put(g, x, y, z, rng() * Math.PI);
    return g;
  }
  propsG.add(bonsai(5.8, -9.7, 0.85, 1));
  propsG.add(bonsai(-5.8, -9.7, 0.85, -1));
  propsG.add(bonsai(12.9, 10.5, 0, -1));

  /* ---------- night light props: stone lanterns, fire basins, candles ---------- */
  const flameTex = canvasTex(64, 64, (g: any) => {
    g.clearRect(0, 0, 64, 64);
    const gr = g.createRadialGradient(32, 34, 1, 32, 34, 30);
    gr.addColorStop(0, 'rgba(255,248,222,1)');
    gr.addColorStop(0.25, 'rgba(255,204,120,0.95)');
    gr.addColorStop(0.55, 'rgba(255,126,36,0.5)');
    gr.addColorStop(1, 'rgba(255,80,10,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(32, 34, 15, 27, 0, 0, Math.PI * 2); g.fill();
  });
  const flames: any[] = []
  function flameAt(x: any, y: any, z: any, sc: any) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffcf92
    }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(sc);
    sp.visible = !isDay();
    root.add(sp);
    flames.push({ sp, base: sc, ph: rng() * 9 });
    return sp;
  }
  anims.push((t: any) => {
    for (const f of flames) {
      const k = 1 + Math.sin(t * 9 + f.ph) * 0.12 + Math.sin(t * 21 + f.ph * 2.1) * 0.06;
      f.sp.scale.set(f.base * k * 0.86, f.base * k, 1);
      f.sp.material.opacity = 0.82 + 0.18 * Math.sin(t * 13 + f.ph);
    }
  });

  /* stone lantern (石灯) generator */
  function stoneLantern(x: any, z: any, sc: any = 1, intensity: any = 9) {
    const g = new THREE.Group();
    const base = box(0.64 * sc, 0.2 * sc, 0.64 * sc, M.stoneDark); base.position.y = 0.1 * sc; g.add(base);
    const shaft = cyl(0.1 * sc, 0.13 * sc, 0.85 * sc, M.stone, 10); shaft.position.y = 0.62 * sc; g.add(shaft);
    const plate = box(0.5 * sc, 0.12 * sc, 0.5 * sc, M.stoneDark); plate.position.y = 1.1 * sc; g.add(plate);
    /* fire chamber: warm glowing core with a stone frame */
    const core = box(0.3 * sc, 0.34 * sc, 0.3 * sc, toon(0xffe6b8, { emissive: 0xffa94e, emissiveIntensity: 1.15, rough: 0.65 }));
    core.position.y = 1.34 * sc; g.add(core);
    for (const s of [-1, 1]) {
      const pil = box(0.09 * sc, 0.4 * sc, 0.09 * sc, M.stoneDark);
      pil.position.set(s * 0.19 * sc, 1.34 * sc, 0.19 * sc); g.add(pil);
      const pil2 = pil.clone(); pil2.position.z = -0.19 * sc; g.add(pil2);
    }
    const roofC = new THREE.Mesh(new THREE.ConeGeometry(0.44 * sc, 0.3 * sc, 4), M.stoneDark);
    roofC.rotation.y = Math.PI / 4; roofC.position.y = 1.68 * sc; roofC.castShadow = true; g.add(roofC);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08 * sc, 10, 8), M.stoneDark);
    knob.position.y = 1.88 * sc; g.add(knob);
    put(g, x, 0, z);
    propsG.add(g);
    flameAt(x, 1.34 * sc, z, 0.42 * sc);
    addLight(0xffb469, intensity, 9.5, x, 1.36 * sc, z, { flicker: 0.13, speed: 5.4 });
    return g;
  }
  /*
   * 石灯沿中轴两侧**成对对称**摆放（关于 x=0 镜像），成四组。
   * 石桌在庭院坐标系里半径 3.1，因此靠近桌子的点位推到 |x|=2.6、|z|≥3.6，
   * 既与石桌/石凳留出余量，又不会压到宽 1.42 的石径。
   */
  const lanternSpots = [
    [2.6, 10.6], [-2.6, 10.6],
    [2.6, 6.4], [-2.6, 6.4],
    [2.6, -3.6], [-2.6, -3.6],
    [2.6, -7.0], [-2.6, -7.0],
  ];
  for (const [lx, lz] of lanternSpots) stoneLantern(lx, lz, 1, 8.2);

  /* fire basin (火盆) */
  function fireBasin(x: any, z: any, sc: any = 1) {
    const g = new THREE.Group();
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0.4, 0.2), new THREE.Vector2(0.5, 0.42), new THREE.Vector2(0.52, 0.48)];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), M.bronze);
    bowl.position.y = 0.48 * sc; bowl.scale.setScalar(sc); bowl.castShadow = true; g.add(bowl);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + 0.4;
      const leg = cyl(0.03 * sc, 0.05 * sc, 0.5 * sc, M.bronze, 8);
      leg.position.set(Math.cos(a) * 0.3 * sc, 0.25 * sc, Math.sin(a) * 0.3 * sc);
      leg.rotation.z = Math.cos(a) * 0.18; leg.rotation.x = -Math.sin(a) * 0.18;
      g.add(leg);
    }
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.42 * sc, 20), toon(0xff5a12, { emissive: 0xff4a08, emissiveIntensity: 1.5, rough: 0.9 }));
    coals.rotation.x = -Math.PI / 2; coals.position.y = 0.86 * sc; g.add(coals);
    put(g, x, 0, z);
    propsG.add(g);
    flameAt(x, 1.12 * sc, z, 0.95 * sc);
    flameAt(x + 0.12, 1.3 * sc, z + 0.08, 0.55 * sc);
    addLight(0xff7c32, 15, 13, x, 1.25 * sc, z, { flicker: 0.22, speed: 4.6 });
    return g;
  }
  fireBasin(-5.4, 13.9, 1);
  fireBasin(5.4, 13.9, 1);
  fireBasin(-4.3, -7.4, 0.9);
  fireBasin(4.3, -7.4, 0.9);

  /* red lanterns flanking the moon gate */
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const cord = cyl(0.012, 0.012, 0.5, toon(0x3a2818), 6); cord.position.y = 0.25; g.add(cord);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), M.lanternRed);
    body.scale.y = 0.86; body.position.y = -0.22; body.castShadow = true; g.add(body);
    for (const sy of [0.04, -0.48]) {
      const cap = cyl(0.1, 0.13, 0.07, M.gold, 10); cap.position.y = sy; g.add(cap);
    }
    const tas = box(0.035, 0.24, 0.035, toon(0xa8281c)); tas.position.y = -0.7; g.add(tas);
    put(g, s * 2.55, 3.5, 8.3);
    propsG.add(g);
    addLight(0xff8a3e, 6.5, 8, s * 2.55, 3.15, 8.35, { flicker: 0.12, speed: 6.2 });
  }

  /* candle clusters on the courtyard paving */
  function candleCluster(x: any, z: any) {
    const g = new THREE.Group();
    const dish = cyl(0.22, 0.24, 0.05, M.bronze, 14); dish.position.y = 0.025; g.add(dish);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const c = cyl(0.032, 0.036, 0.22 + i * 0.04, toon(0xd8d0bc), 10);
      c.position.set(Math.cos(a) * 0.1, 0.14 + i * 0.02, Math.sin(a) * 0.1); g.add(c);
      flameAt(x + Math.cos(a) * 0.1, 0.3 + i * 0.04, z + Math.sin(a) * 0.1, 0.2);
    }
    put(g, x, 0, z);
    propsG.add(g);

  }
  candleCluster(-2.0, 14.6);
  candleCluster(2.0, 14.6);
  candleCluster(-2.2, 9.4);
  candleCluster(2.2, 9.4);
  candleCluster(-2.3, -7.2);
  candleCluster(2.3, -7.2);

  /* grass tufts */
  {
    const tuftGeo = new THREE.ConeGeometry(0.05, 0.3, 5);
    tuftGeo.translate(0, 0.15, 0);
    const tuftMat = new THREE.MeshLambertMaterial({ color: 0x8a9a4e });
    const N = 130;
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, N);
    tufts.castShadow = true;
    const dummy = new THREE.Object3D();
    const spots = [
      [-17, 17], [-19, 12], [17, -18], [19, -13], [-18, -17], [16, 18], [12, -19], [-13, 19],
      [12.8, 7], [-12.8, 6.5], [13, -1], [-13, -2], [10.5, -7.8], [-8, 7.2]
    ];
    let i = 0;
    for (const [sx, sz] of spots) {
      const n = 5 + Math.floor(rng() * 5);
      for (let k = 0; k < n && i < N; k++, i++) {
        dummy.position.set(sx + rr(-1.2, 1.2), 0, sz + rr(-1.2, 1.2));
        dummy.rotation.set(rr(-0.15, 0.15), rng() * Math.PI * 2, rr(-0.15, 0.15));
        dummy.scale.setScalar(rr(0.7, 1.5));
        dummy.updateMatrix();
        tufts.setMatrixAt(i, dummy.matrix);
      }
    }
    tufts.count = i;
    groundG.add(tufts);
  }

  /* ---------- trees ---------- */
  const treesG = new THREE.Group(); root.add(treesG);
  const windSwayGroups: any[] = []
  function makeLeafCards(tex: any, count: any, tintFn: any) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.11
    });
    const m = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      dummy.scale.setScalar(rr(0.5, 0.85));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.set(tintFn()));
    }
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.needsUpdate = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 });
    return m;
  }
  function makeTree(kind: any, x: any, z: any, h: any, canopyR: any) {
    const g = new THREE.Group();
    const isGinkgo = kind === 'ginkgo';
    /* trunk: two stacked tapered cylinders with slight lean + branches */
    const trunkMat = isGinkgo ? M.trunk : M.trunkDark;
    const t1 = cyl(0.26, 0.46, h * 0.52, trunkMat, 10);
    t1.position.y = h * 0.26;
    t1.rotation.z = rr(-0.05, 0.05);
    g.add(t1);
    const t2 = cyl(0.17, 0.26, h * 0.4, trunkMat, 10);
    t2.position.set(rr(-0.1, 0.1), h * 0.7, rr(-0.1, 0.1));
    t2.rotation.z = rr(-0.1, 0.1);
    g.add(t2);
    for (let i = 0; i < 5; i++) {
      const br = cyl(0.07, 0.13, h * 0.34, trunkMat, 8);
      const a = i / 5 * Math.PI * 2 + rng();
      put(br, Math.cos(a) * 0.34, h * (0.5 + rng() * 0.16), Math.sin(a) * 0.34, rng() * Math.PI * 2);
      br.rotation.z = rr(0.6, 1.15) * (rng() < 0.5 ? 1 : -1);
      br.rotation.x = rr(0.35, 0.9) * (rng() < 0.5 ? 1 : -1);
      g.add(br);
    }
    /* canopy of leaf cards: dense ellipsoid that swallows the crown and the trunk top */
    const cy = h * 0.66;
    const canopy = new THREE.Group();
    canopy.position.y = cy;
    const tint = isGinkgo
      ? () => pick([0xf2b53a, 0xffcf5e, 0xe7a52e, 0xd9971f, 0xffdf7a])
      : () => pick([0xd4402c, 0xe86a3a, 0xb73018, 0xe04a28, 0xc03a20]);
    const n = isGinkgo ? 1500 : 1100;
    const cards = makeLeafCards(isGinkgo ? TEX_GINKGO : TEX_MAPLE, n, tint);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      let vx = rr(-1, 1), vy = rr(-1, 1), vz = rr(-1, 1);
      const len = Math.hypot(vx, vy, vz) || 1;
      /* biased toward the shell so the crown reads as a solid mass, with interior fill */
      const rad = canopyR * (0.2 + 0.8 * Math.pow(rng(), 0.45));
      vx = vx / len * rad; vy = vy / len * rad * 0.7; vz = vz / len * rad;
      dummy.position.set(vx, vy, vz);
      dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      dummy.scale.setScalar(rr(0.72, 1.25) * (isGinkgo ? 1.25 : 1.1));
      dummy.updateMatrix();
      cards.setMatrixAt(i, dummy.matrix);
    }
    cards.instanceMatrix.needsUpdate = true;
    canopy.add(cards);
    /* a low skirt of leaves that hides the trunk and the branch forks */
    const lowN = isGinkgo ? 520 : 400;
    const low = makeLeafCards(isGinkgo ? TEX_GINKGO : TEX_MAPLE, lowN, tint);
    for (let i = 0; i < lowN; i++) {
      const a = rng() * Math.PI * 2;
      const t = Math.pow(rng(), 0.8);
      const rad = canopyR * (0.18 + 0.62 * (1 - t * 0.55)) * (0.65 + 0.35 * rng());
      dummy.position.set(Math.cos(a) * rad, -t * h * 0.56 + rr(-0.2, 0.2), Math.sin(a) * rad);
      dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      dummy.scale.setScalar(rr(0.62, 1.05) * (isGinkgo ? 1.18 : 1.02));
      dummy.updateMatrix();
      low.setMatrixAt(i, dummy.matrix);
    }
    low.instanceMatrix.needsUpdate = true;
    canopy.add(low);
    g.add(canopy);
    windSwayGroups.push({ obj: canopy, phase: rng() * 9, amp: 0.016, base: canopy.rotation.z });
    put(g, x, 0, z, rng() * Math.PI * 2);
    treesG.add(g);
    bakeOutline(g, 0.05);
    return { group: g, canopy, center: new THREE.Vector3(x, cy, z), radius: canopyR, tex: isGinkgo ? TEX_GINKGO : TEX_MAPLE };
  }
  const ginkgo = makeTree('ginkgo', -8.9, 2.9, 10.5, 4.35);
  const maple = makeTree('maple', 9.9, 3.6, 8.2, 3.8);
  /* warm up-lights under the two trees so the crowns glow from below */
  addLight(0xffb066, 34, 11, -8.2, 0.5, 3.4, { flicker: 0.07, speed: 2.4 });
  addLight(0xff8f4c, 30, 10.5, 9.2, 0.5, 4.2, { flicker: 0.07, speed: 2.1 });

  /* bamboo */
  const bambooCulms: any[] = []
  function bambooCluster(cx: any, cz: any, n: any, hBase: any) {
    for (let i = 0; i < n; i++) {
      const h = hBase + rr(-0.8, 1.2);
      const culm = new THREE.Group();
      const x = cx + rr(-1.0, 1.0), z = cz + rr(-0.8, 0.8);
      const lean = rr(-0.06, 0.06);
      const segN = 5;
      for (let sIdx = 0; sIdx < segN; sIdx++) {
        const segH = h / segN;
        const seg = cyl(0.075 * (1 - sIdx * 0.07), 0.085 * (1 - sIdx * 0.07), segH, M.bamboo, 8);
        seg.position.y = sIdx * segH + segH / 2;
        culm.add(seg);
        const node = cyl(0.095 * (1 - sIdx * 0.07), 0.095 * (1 - sIdx * 0.07), 0.05, M.bambooNode, 8);
        node.position.y = sIdx * segH;
        culm.add(node);
      }
      /* leaf clusters near the top */
      const cardGeo = new THREE.PlaneGeometry(0.13, 0.7);
      const lmat = new THREE.MeshLambertMaterial({ map: TEX_BMLEAF, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xc4dc96 });
      for (let l = 0; l < 18; l++) {
        const c = new THREE.Mesh(cardGeo, lmat);
        c.position.set(rr(-0.3, 0.3), h * rr(0.55, 0.99), rr(-0.3, 0.3));
        c.rotation.set(rr(-1.4, -0.3), rng() * Math.PI * 2, rr(-0.6, 0.6));
        culm.add(c);
      }
      culm.rotation.z = lean;
      culm.rotation.x = rr(-0.05, 0.05);
      put(culm, x, 0, z, rng() * Math.PI * 2);
      treesG.add(culm);
      bambooCulms.push({ obj: culm, phase: rng() * 9 });
    }
  }
  bambooCluster(11.6, 6.0, 6, 6.0);
  bambooCluster(-11.8, 5.6, 4, 5.4);
  bambooCluster(10.9, 12.6, 3, 4.8);

  /* ---------- eave lanterns on the hall + wind chime ---------- */
  function hallLanternAt(x: any, y: any, z: any) {
    const pivot = new THREE.Group();
    put(pivot, x, y, z);
    const cord = cyl(0.012, 0.012, 0.3, toon(0x3a2818), 6);
    cord.position.y = -0.15; cord.userData.noOutline = true; pivot.add(cord);
    const lamp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), M.lanternRed);
    body.scale.y = 0.82; body.position.y = -0.6; lamp.add(body);
    for (const sy of [-0.36, -0.84]) {
      const cap = cyl(0.11, 0.14, 0.08, M.gold, 10);
      cap.position.y = sy; lamp.add(cap);
    }
    const tas = box(0.04, 0.26, 0.04, toon(0xb8321f));
    tas.position.y = -1.06; lamp.add(tas);
    pivot.add(lamp);
    root.add(pivot);
    lanternPivots.push(pivot);
    bakeOutline(pivot, 0.02);
  }
  hallLanternAt(-9.5, 4.92, -7.95);
  hallLanternAt(9.5, 4.92, -7.95);
  hallLanternAt(-9.5, 4.92, -16.6);
  hallLanternAt(9.5, 4.92, -16.6);
  const chime = new THREE.Group();
  {
    const hook = cyl(0.01, 0.01, 0.16, M.bronze, 6); hook.position.y = -0.08; chime.add(hook);
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 10), M.gold);
    bell.rotation.x = Math.PI; bell.position.y = -0.24; chime.add(bell);
    for (let i = 0; i < 3; i++) {
      const tube = cyl(0.012, 0.012, 0.22, M.gold, 6);
      tube.position.set(Math.cos(i * 2.1) * 0.05, -0.44, Math.sin(i * 2.1) * 0.05);
      chime.add(tube);
    }
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.3), toon(0xf0ead8, { side: THREE.DoubleSide }));
    strip.position.set(0.02, -0.58, 0.03);
    strip.userData.noOutline = true;
    chime.add(strip);
    chime.userData.strip = strip;
    put(chime, 10.35, 5.35, -7.7);
    root.add(chime);
  }

  /* ---------- falling leaves ---------- */
  const fallSystems: any[] = []
  function fallingLeaves(tex: any, count: any, center: any, radius: any) {
    const geo = new THREE.PlaneGeometry(0.34, 0.34);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4 });
    mesh.frustumCulled = false;
    const items: any[] = []
    for (let i = 0; i < count; i++) {
      items.push({
        p: new THREE.Vector3(center.x + rr(-radius, radius), rr(1, center.y + 3), center.z + rr(-radius, radius)),
        vy: rr(0.42, 0.75),
        ph: rng() * 9,
        rs: new THREE.Vector3(rr(-1.6, 1.6), rr(-2, 2), rr(-1.6, 1.6)),
        sc: rr(0.5, 0.95)
      });
    }
    root.add(mesh);
    fallSystems.push({ mesh, items, center, radius });
  }
  fallingLeaves(TEX_GINKGO, 80, ginkgo.center, ginkgo.radius + 1.2);
  fallingLeaves(TEX_MAPLE, 46, maple.center, maple.radius + 1.0);

  /* scattered leaves resting on the ground */
  {
    const geo = new THREE.PlaneGeometry(0.3, 0.3);
    const mat = new THREE.MeshLambertMaterial({ map: TEX_GINKGO, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const N = 170;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: TEX_GINKGO, alphaTest: 0.4 });
    const dummy = new THREE.Object3D();
    const spots: any[] = []
    for (let i = 0; i < 60; i++) spots.push([ginkgo.center.x + rr(-4.5, 4.5), ginkgo.center.z + rr(-4.5, 4.5)]);
    for (let i = 0; i < 30; i++) spots.push([maple.center.x + rr(-3.5, 3.5), maple.center.z + rr(-3.5, 3.5)]);
    for (let i = 0; i < 45; i++) spots.push([rr(8, 20), rr(-14, 14)]);   /* wind drifts east */
    for (let i = 0; i < 20; i++) spots.push([rr(-2, 3), rr(9, 15.5)]);
    for (let i = 0; i < 15; i++) spots.push([rr(-20, -15), rr(-20, 20)]);
    let i2 = 0;
    for (const [sx, sz] of spots) {
      if (i2 >= N) break;
      dummy.position.set(sx, 0.02 + rng() * 0.02, sz);
      dummy.rotation.set(-Math.PI / 2 + rr(-0.2, 0.2), 0, rng() * Math.PI * 2);
      dummy.scale.setScalar(rr(0.7, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i2++, dummy.matrix);
    }
    mesh.count = i2;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------- dust motes ---------- */
  function dustSystem(cx: any, cy: any, cz: any, sx: any, sy: any, sz: any, count: any, size: any, alpha: any) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([cx + rr(-sx, sx), cy + rr(-sy, sy), cz + rr(-sz, sz)], i * 3);
      seed[i] = rng();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uS: { value: size }, uA: { value: alpha }, uBox: { value: new THREE.Vector3(sx, sy, sz) } },
      vertexShader: `uniform float uT,uPx,uS,uBoxY; uniform vec3 uBox; attribute float aSeed; varying float vA;
      void main(){
        float t = uT*0.03 + aSeed*7.0;
        vec3 p = position;
        p.y = mod(p.y - uBox.y + uT*0.06, uBox.y*2.0) - uBox.y + position.y*0.0;
        p.x += sin(t*1.7 + aSeed*13.0)*0.5;
        p.z += cos(t*1.3 + aSeed*17.0)*0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uS * uPx * (30.0 / max(1.0, -mv.z));
        vA = 0.5 + 0.5*sin(t*4.0 + aSeed*31.0);
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `uniform float uA; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vA * uA;
        gl_FragColor = vec4(1.0, 0.85, 0.6, a);
      }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
    anims.push((t: any) => { mat.uniforms.uT.value = t; });
    return pts;
  }
  dustSystem(-2, 3.2, 0, 7, 2.6, 6.5, 70, 0.9, 0.4);
  dustSystem(0, 2.6, -12.4, 5.5, 1.6, 2.0, 44, 0.7, 0.34);

  /* ---------- chimney smoke + incense wisp ---------- */
  function smokeColumn(origin: any, opts: any) {
    const N = opts.count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([origin.x + rr(-opts.spread, opts.spread), origin.y, origin.z + rr(-opts.spread, opts.spread)], i * 3);
      seed[i] = rng();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uT: { value: 0 }, uPx: { value: renderer.getPixelRatio() },
        uH: { value: opts.height }, uS: { value: opts.size }, uA: { value: opts.alpha },
        uWind: { value: new THREE.Vector2(opts.wx, opts.wz) },
        uCol: { value: new THREE.Color(opts.color) }
      },
      vertexShader: `uniform float uT,uPx,uH,uS; uniform vec2 uWind; attribute float aSeed; varying float vA;
      void main(){
        float t = fract(aSeed + uT*0.05);
        vec3 p = position;
        p.y += t*uH;
        p.x += sin(t*7.0 + aSeed*43.0)*0.24*t + uWind.x*t*t*2.4;
        p.z += cos(t*6.0 + aSeed*29.0)*0.2*t + uWind.y*t*t*2.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uS * mix(0.45, 1.9, t) * uPx * (160.0 / max(1.0, -mv.z));
        vA = smoothstep(0.0, 0.14, t) * (1.0 - t);
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `uniform float uA; uniform vec3 uCol; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.13, d) * vA * uA;
        gl_FragColor = vec4(uCol, a);
      }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
    anims.push((t: any) => { mat.uniforms.uT.value = t; });
  }
  smokeColumn(chimneyTop, { count: 42, spread: 0.2, height: 10, size: 30, alpha: 0.15, wx: 0.55, wz: -0.3, color: 0x5b6474 });
  smokeColumn(new THREE.Vector3(0, FY + 1.55, -14.68), { count: 14, spread: 0.02, height: 1.9, size: 7, alpha: 0.24, wx: 0.18, wz: -0.08, color: 0x7c8492 });

  /* ---------- outlines for the big static groups ---------- */
  bakeOutline(baseG, 0.1);
  bakeOutline(wallsG, 0.05);
  bakeOutline(hallG, 0.055);
  bakeOutline(furnG, 0.026);
  bakeOutline(propsG, 0.04);


  /* ---------- 动画装配（原文件 tick 中除相机/后处理外的部分） ---------- */
  const dummyLeaf = new THREE.Object3D()
  let elapsed = 0

  const update = (dt: number): void => {
    elapsed += dt
    const t = elapsed
    /* wind gusts */
    const gust = 0.55 + 0.45 * Math.sin(t * 0.4) * Math.sin(t * 0.13 + 2)
    for (const sw of windSwayGroups) {
      sw.obj.rotation.z = sw.base + Math.sin(t * 0.75 + sw.phase) * sw.amp * (0.5 + gust)
      sw.obj.rotation.x = Math.sin(t * 0.6 + sw.phase * 1.3) * sw.amp * 0.6 * (0.5 + gust)
    }
    for (const bc of bambooCulms) {
      bc.obj.rotation.z = Math.sin(t * 0.85 + bc.phase) * 0.022 * (0.4 + gust)
    }
    for (const lp of lanternPivots) {
      lp.rotation.z = Math.sin(t * 1.25 + lp.position.x * 0.7) * 0.055
      lp.rotation.x = Math.sin(t * 0.9 + lp.position.z * 0.7) * 0.04
    }
    chime.rotation.z = Math.sin(t * 1.7) * 0.12 * (0.4 + gust)
    chime.userData.strip.rotation.x = Math.sin(t * 2.3) * 0.5
    /* falling leaves */
    const wx = 0.55 + 0.25 * Math.sin(t * 0.35)
    for (const sys of fallSystems) {
      sys.items.forEach((it: any, i: number) => {
        it.p.y -= it.vy * dt
        it.p.x += (wx + Math.sin(t * 0.8 + it.ph) * 0.3) * dt
        it.p.z += Math.cos(t * 0.6 + it.ph) * 0.22 * dt
        if (it.p.y < 0.04) {
          it.p.set(
            sys.center.x + rr(-sys.radius, sys.radius),
            sys.center.y + rr(1.5, 3.5),
            sys.center.z + rr(-sys.radius, sys.radius),
          )
        }
        dummyLeaf.position.copy(it.p)
        dummyLeaf.rotation.set(it.ph + t * it.rs.x, t * it.rs.y, t * it.rs.z)
        dummyLeaf.scale.setScalar(it.sc)
        dummyLeaf.updateMatrix()
        sys.mesh.setMatrixAt(i, dummyLeaf.matrix)
      })
      sys.mesh.instanceMatrix.needsUpdate = true
    }
    /* breathing interior light */
    roomLight.intensity = (19 + Math.sin(t * 0.8) * 2.2 + Math.sin(t * 2.3) * 1.1) * LIGHT_GAIN * lampScale()
    /* candle / lantern flicker */
    for (const fl of flickerLights) {
      const k =
        1 + Math.sin(t * fl.sp + fl.ph) * fl.amp + Math.sin(t * fl.sp * 2.7 + fl.ph * 1.7) * fl.amp * 0.5
      fl.l.intensity = fl.raw * LIGHT_GAIN * lampScale() * k
    }
    /* registered scene animations (water, smoke, dust, stars) */
    for (let i = 0; i < anims.length; i++) anims[i](t, dt)
  }

  const render = (): void => composer.render()

  const setSize = (width: number, height: number): void => {
    composer.setSize(width, height)
  }

  // 整体放大后，点光源的照射距离与强度按平方反比补偿，保持原有明暗关系
  const LIGHT_GAIN = COURT_SCALE * COURT_SCALE
  root.traverse((o: any) => {
    if (o.isPointLight && o.distance > 0) {
      o.distance *= COURT_SCALE
      o.intensity *= LIGHT_GAIN
    }
  })
  // 时段切换用的基准亮度也要带上同样的补偿
  for (const entry of lampLights) entry.raw *= LIGHT_GAIN

  const setGateOpen = (progress: number): void => {
    const k = THREE.MathUtils.clamp(progress, 0, 1)
    const angle = k * (Math.PI / 2) * 0.94
    for (const { pivot, dir } of gateLeaves) pivot.rotation.y = -dir * angle
  }

  /** 昼夜切换：天空、雾、灯光、环境反射、Bloom、灯火亮度一次性重配 */
  const setTimeOfDay = (next: TimeOfDay): void => {
    mode = next
    const pal = STAGE[next]

    if (scene.background instanceof THREE.Color) scene.background.setHex(pal.bg)
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(pal.fog)
      scene.fog.density = pal.fogDensity / COURT_SCALE
    }

    const u = skyMat.uniforms
    ;(u.uBody.value as THREE.Vector3).copy(pal.bodyDir)
    ;(u.uTop.value as THREE.Color).copy(pal.sky.top)
    ;(u.uMid.value as THREE.Color).copy(pal.sky.mid)
    ;(u.uHor.value as THREE.Color).copy(pal.sky.hor)
    ;(u.uGlow.value as THREE.Color).copy(pal.sky.glow)
    ;(u.uHalo.value as THREE.Color).copy(pal.sky.halo)
    ;(u.uDisc.value as THREE.Color).copy(pal.sky.disc)
    ;(u.uCurve.value as THREE.Vector3).copy(pal.sky.curve)
    u.uDetail.value = next === 'night' ? 1 : 0

    if (starPoints) starPoints.visible = next === 'night'
    clouds.visible = next === 'day'

    scene.environment = envMaps[next]
    scene.environmentIntensity = pal.envIntensity

    moonLight.color.setHex(pal.key.color)
    moonLight.intensity = pal.key.intensity
    moonLight.position.copy(pal.key.dir).multiplyScalar(96)

    hemi.color.setHex(pal.hemi.sky)
    hemi.groundColor.setHex(pal.hemi.ground)
    hemi.intensity = pal.hemi.intensity

    fill.color.setHex(pal.fill.color)
    fill.intensity = pal.fill.intensity

    for (const entry of lampLights) entry.l.intensity = entry.raw * pal.lampScale
    for (const f of flames) f.sp.visible = next === 'night'
    if (fuMaterial) fuMaterial.emissiveIntensity = next === 'day' ? 0.05 : 0.14

    bloomPass.strength = pal.bloom
    renderer.toneMappingExposure = pal.exposure
  }

  return {
    root,
    update,
    render,
    setSize,
    setGateOpen,
    setTimeOfDay,
    timeOfDay: () => mode,
  }
}
