import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BOX_HALF } from './config.ts'
import { FX } from './art/fx.ts'
import { createCreatures } from './art/creatures.ts'
import { createLantern, type Lantern } from './art/lantern.ts'
import { createNightCourt, type NightCourt } from './art/nightCourt.ts'
import { createStoneSet } from './art/stoneSet.ts'
import { detectQuality, qualitySettings, type QualitySettings } from './art/quality.ts'
import { TIME_OF_DAY, type TimeOfDay } from './config.ts'

export interface SceneKit {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  quality: QualitySettings
  fx: FX
  /** 落点预览组（定位在落点 x/z，含上表面光环 + 垂直虚线） */
  aim: THREE.Group
  aimRing: THREE.Mesh
  update(dt: number): void
  render(): void
  resize(): void
  /** 开场镜头：全景 → 开门 → 入院 → 对准石案；结束后回调并交还操作权 */
  playIntro(onDone?: () => void): void
  /** 切换白天 / 秋夜 */
  setTimeOfDay(next: TimeOfDay): void
  timeOfDay(): TimeOfDay
}

/** 开场结束后的机位：石案居中，建筑留在画面里 */
const BASE_CAMERA = new THREE.Vector3(23, 16.5, 14)
const BASE_TARGET = new THREE.Vector3(0, -2.6, -3)

/**
 * 开场镜头关键帧（世界坐标；庭院按 COURT_SCALE=2 放大后的实际尺寸）。
 * 大门在 z=32，迎门影壁在 z≈25.2，月洞门隔墙在 z=16，主庭院与石案在 z<16。
 */
const INTRO_SHOTS = {
  panorama: { pos: new THREE.Vector3(34, 23, 86), target: new THREE.Vector3(0, 9, 6) },
  beforeGate: { pos: new THREE.Vector3(2, -0.6, 52), target: new THREE.Vector3(0, -3.2, 32) },
}

/** 入院路线：门洞 → 绕过迎门影壁 → 穿月洞门 → 院内抬升 → 对准石案 */
const INTRO_PATH: Array<[number, number, number]> = [
  [2, -0.6, 52],
  [0.8, -2.8, 33],
  [8.0, -2.8, 28.5],
  [7.0, -3.0, 20.5],
  [0.8, -3.0, 17.4],
  [0.7, -3.0, 16.0],
  [0.6, -3.0, 14.2],
  [5.0, 1.5, 10.5],
]
const INTRO_LOOK: Array<[number, number, number]> = [
  [0, -3.2, 33],
  [4.0, -3.0, 26],
  [6.0, -3.0, 20],
  [0.5, -3.0, 14],
  [0.5, -2.9, 10],
  [2.0, -2.5, 4],
  [0.5, -2.6, -1],
  [0, -2.6, -3],
]

/** 分段时长：推近全景 → 开门 → 沿路线入院并入位 */
const INTRO_PHASE = { approach: 2.4, gate: 1.0, enter: 3.8 }

function smoothstep(k: number): number {
  const t = THREE.MathUtils.clamp(k, 0, 1)
  return t * t * (3 - 2 * t)
}

function createAim(): { aim: THREE.Group; aimRing: THREE.Mesh } {
  const aim = new THREE.Group()
  aim.visible = false

  const vermilion = new THREE.MeshBasicMaterial({
    color: 0xb23a2e,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), vermilion)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = BOX_HALF + 0.03
  aim.add(ring)

  const jade = new THREE.MeshBasicMaterial({
    color: 0x3e7a63,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.63, 64), jade)
  inner.rotation.x = -Math.PI / 2
  inner.position.y = BOX_HALF + 0.032
  aim.add(inner)

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, BOX_HALF, 0),
      new THREE.Vector3(0, -BOX_HALF, 0),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xb23a2e,
      dashSize: 0.24,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  )
  line.computeLineDistances()
  aim.add(line)

  return { aim, aimRing: ring }
}

export function createScene(container: HTMLElement): SceneKit {
  const tier = detectQuality()
  const quality = qualitySettings(tier)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(quality.dpr)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = TIME_OF_DAY === 'day' ? 0.92 : 1.12
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()

  // 庭院放大后天空穹顶也变远，视锥要留足距离
  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 3000)
  camera.position.copy(INTRO_SHOTS.panorama.pos)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.rotateSpeed = 0.65
  controls.zoomSpeed = 0.7
  controls.minDistance = 14
  controls.maxDistance = 70
  controls.maxPolarAngle = 1.44
  controls.target.copy(INTRO_SHOTS.panorama.target)
  // 开场动画结束前不接管相机
  controls.enabled = false

  // 环境换成「庭院秋夜」：夜空、月、星、院墙、大门、正房、厢房、石径、树、夜灯、落叶
  const night: NightCourt = createNightCourt(scene, renderer, camera, quality)

  // 保留的旧陈设：石桌（含石凳）、石灯笼与桌上摆件
  const stoneSet = createStoneSet()
  scene.add(stoneSet.group)

  // 石案这一组在夜里会被压暗，补一盏柔和的顶部光；白天有太阳，不需要
  const setFill = new THREE.SpotLight(0xc9dbff, TIME_OF_DAY === 'day' ? 0 : 42, 30, 0.75, 0.9, 2)
  setFill.position.set(3, 12, 8)
  setFill.target.position.set(0, -4.5, 0)
  scene.add(setFill)
  scene.add(setFill.target)

  // 棂笼
  const lantern: Lantern = createLantern(quality)
  scene.add(lantern.group)

  // 庭院生灵：石凳上的猫、桌边的小鸟、夜里的萤火
  const creatures = createCreatures(quality, TIME_OF_DAY)
  scene.add(creatures.group)

  const fx = new FX(scene, quality)
  const { aim, aimRing } = createAim()
  scene.add(aim)

  const layoutKey = (): 'portrait' | 'medium' | 'large' => {
    const aspect = window.innerWidth / window.innerHeight
    if (aspect < 0.9) return 'portrait'
    return window.innerWidth < 1500 ? 'medium' : 'large'
  }

  /** 结束机位随视口调整：竖屏拉远并压低目标点 */
  const settlePose = (): { pos: THREE.Vector3; target: THREE.Vector3 } => {
    const key = layoutKey()
    const scale = key === 'portrait' ? 1.5 : key === 'medium' ? 1.04 : 1
    return {
      pos: BASE_CAMERA.clone().multiplyScalar(scale),
      target: BASE_TARGET.clone().setY(key === 'portrait' ? -3.2 : BASE_TARGET.y),
    }
  }

  let intro: { t: number; onDone?: () => void } | null = null

  const resize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    night.setSize(w, h)
    if (!intro) {
      const pose = settlePose()
      camera.position.copy(pose.pos)
      controls.target.copy(pose.target)
      controls.update()
    }
  }
  window.addEventListener('resize', resize)
  night.setSize(window.innerWidth, window.innerHeight)

  const applyShot = (
    a: { pos: THREE.Vector3; target: THREE.Vector3 },
    b: { pos: THREE.Vector3; target: THREE.Vector3 },
    k: number,
  ): void => {
    const e = smoothstep(k)
    camera.position.lerpVectors(a.pos, b.pos, e)
    controls.target.lerpVectors(a.target, b.target, e)
    camera.lookAt(controls.target)
  }

  /** 入院段的曲线：位置与视线分别用 Catmull-Rom 串起来，避免撞上影壁 */
  let pathCurve: THREE.CatmullRomCurve3 | null = null
  let lookCurve: THREE.CatmullRomCurve3 | null = null

  const buildIntroCurves = (): void => {
    const end = settlePose()
    const pts = INTRO_PATH.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    pts.push(end.pos)
    const looks = INTRO_LOOK.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    looks.push(end.target)
    pathCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35)
    lookCurve = new THREE.CatmullRomCurve3(looks, false, 'catmullrom', 0.35)
  }

  const playIntro = (onDone?: () => void): void => {
    intro = { t: 0, onDone }
    controls.enabled = false
    night.setGateOpen(0)
    buildIntroCurves()
    camera.position.copy(INTRO_SHOTS.panorama.pos)
    controls.target.copy(INTRO_SHOTS.panorama.target)
    camera.lookAt(controls.target)
  }

  const updateIntro = (dt: number): void => {
    if (!intro) return
    intro.t += dt
    const t = intro.t
    const { approach, gate, enter } = INTRO_PHASE

    if (t < approach) {
      applyShot(INTRO_SHOTS.panorama, INTRO_SHOTS.beforeGate, t / approach)
      night.setGateOpen(0)
      return
    }

    if (t < approach + gate) {
      night.setGateOpen((t - approach) / gate)
      camera.position.copy(INTRO_SHOTS.beforeGate.pos)
      controls.target.copy(INTRO_SHOTS.beforeGate.target)
      camera.lookAt(controls.target)
      return
    }

    night.setGateOpen(1)
    const k = Math.min((t - approach - gate) / enter, 1)
    const e = smoothstep(k)
    if (pathCurve && lookCurve) {
      pathCurve.getPoint(e, camera.position)
      lookCurve.getPoint(e, controls.target)
      camera.lookAt(controls.target)
    }

    if (k >= 1) {
      const end = settlePose()
      camera.position.copy(end.pos)
      controls.target.copy(end.target)
      camera.lookAt(controls.target)
      controls.enabled = true
      controls.update()
      const done = intro.onDone
      intro = null
      pathCurve = null
      lookCurve = null
      done?.()
    }
  }

  let elapsed = 0

  const update = (dt: number): void => {
    elapsed += dt
    if (intro) {
      updateIntro(dt)
    } else {
      controls.update()
    }
    lantern.update(camera, dt)
    night.update(dt)
    creatures.update(dt)
    fx.update(dt)

    const ringMat = aimRing.material as THREE.MeshBasicMaterial
    ringMat.opacity = 0.78 + Math.sin(elapsed * 3.1) * 0.1
  }

  const render = (): void => {
    night.render()
  }

  const setTimeOfDay = (next: TimeOfDay): void => {
    night.setTimeOfDay(next)
    stoneSet.setTimeOfDay(next)
    creatures.setTimeOfDay(next)
    // 白天有太阳，石案不需要补光
    setFill.intensity = next === 'day' ? 0 : 42
  }

  // 让初始状态与配置一致（同时把曝光校准到该时段的取值）
  setTimeOfDay(TIME_OF_DAY)

  return {
    scene,
    camera,
    renderer,
    controls,
    quality,
    fx,
    aim,
    aimRing,
    update,
    render,
    resize,
    playIntro,
    setTimeOfDay,
    timeOfDay: () => night.timeOfDay(),
  }
}
