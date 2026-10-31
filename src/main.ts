import './style.css'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import {
  LEVELS,
  BOX_HALF,
  WALL_EXTRA,
  WALL_T,
  DROP_LIFT,
  DROP_COOLDOWN,
  BIRTH,
  BEST_KEY,
  MAX_MERGE_SCORE,
  cssColor,
} from './config.ts'
import { createScene } from './scene.ts'
import { Sfx } from './audio.ts'

/* ================= 游戏状态 ================= */

interface Ball {
  level: number
  body: CANNON.Body
  mesh: THREE.Mesh
  /** 出生时间（用于缩放弹出动画） */
  born: number
  /** 已进入合成队列，防止重复触发 */
  dead: boolean
}

interface Effect {
  mesh: THREE.Mesh
  t: number
  dur: number
  r: number
}

const balls: Ball[] = []
const bodyToBall = new Map<CANNON.Body, Ball>()
const mergeQueue: Array<[Ball, Ball]> = []
const effects: Effect[] = []

let score = 0
let best = Number(localStorage.getItem(BEST_KEY) ?? 0)
let currentLevel = 0 // 在 initQueue 里掷出
let nextLevel = 0
let cooldownUntil = 0

const sfx = new Sfx()

/* ================= 场景 ================= */

const kit = createScene(document.getElementById('stage')!)
const { scene, camera, renderer, controls, aim, aimRing } = kit
const clock = new THREE.Clock()

/* ================= 物理 ================= */

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0), allowSleep: false })
world.broadphase = new CANNON.SAPBroadphase(world)
// 深堆叠下的接触解算更稳定
;(world.solver as CANNON.GSSolver).iterations = 20

const matBall = new CANNON.Material('ball')
const matWall = new CANNON.Material('wall')
world.addContactMaterial(
  new CANNON.ContactMaterial(matBall, matBall, {
    friction: 0.45,
    restitution: 0.08, // 低弹性：球堆稳、不被合成冲击高高弹起
    contactEquationStiffness: 5e6, // 软接触：重叠推出更温和
    contactEquationRelaxation: 4,
  }),
)
world.addContactMaterial(
  new CANNON.ContactMaterial(matBall, matWall, { friction: 0.06, restitution: 0.05 }),
)

/** 静态盒墙：底面全厚，四面侧墙高出盒顶（隐形防飞出），顶部封盖 */
function addWall(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    material: matWall,
    shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
  })
  body.position.set(cx, cy, cz)
  world.addBody(body)
}

{
  // 关键：内壁必须与视觉盒对齐——底墙顶面 = -BOX_HALF（球坐在可见底面上）
  const wallBottom = -BOX_HALF
  const wallTop = BOX_HALF + WALL_EXTRA
  const sideH = wallTop - wallBottom
  const sideCy = (wallTop + wallBottom) / 2
  // 底（顶面正好在 -BOX_HALF）
  addWall(0, -BOX_HALF - WALL_T / 2, 0, BOX_HALF + WALL_T * 2, WALL_T / 2, BOX_HALF + WALL_T * 2)
  // 四面侧墙（内壁 = ±BOX_HALF，向上延伸至隐形高度）
  const sx = BOX_HALF + WALL_T / 2
  addWall(-sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF + WALL_T)
  addWall(sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF + WALL_T)
  addWall(0, sideCy, -sx, BOX_HALF + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, sideCy, sx, BOX_HALF + WALL_T, sideH / 2, WALL_T / 2)
  // 顶盖（球从生成点到盒内的弹跳不会越出）
  addWall(0, wallTop + WALL_T / 2, 0, sx + WALL_T, WALL_T / 2, sx + WALL_T)
}

/* ================= 球体：网格共享缓存 ================= */

const sphereGeos = LEVELS.map((d) => new THREE.SphereGeometry(d.radius, 48, 32))
const ballMats = LEVELS.map((d) => {
  const mat = new THREE.MeshStandardMaterial({
    color: d.color,
    roughness: 0.32,
    metalness: 0.05,
  })
  mat.emissive = new THREE.Color(d.color).multiplyScalar(0.1)
  return mat
})

function spawnBall(level: number, x: number, y: number, z: number): Ball {
  const idx = level - 1
  const def = LEVELS[idx]
  const body = new CANNON.Body({
    mass: Math.pow(def.radius, 3) * 5, // 同密度：质量 ∝ r³
    material: matBall,
    shape: new CANNON.Sphere(def.radius),
    linearDamping: 0.06,
    angularDamping: 0.4,
  })
  body.position.set(x, y, z)
  body.velocity.set(0, -2, 0)

  const mesh = new THREE.Mesh(sphereGeos[idx], ballMats[idx])
  mesh.castShadow = true
  mesh.receiveShadow = true

  const ball: Ball = { level, body, mesh, born: clock.elapsedTime, dead: false }
  body.addEventListener('collide', (ev: { body: CANNON.Body }) => {
    const other = bodyToBall.get(ev.body)
    if (!other || other === ball) return
    if (other.level !== ball.level || ball.dead || other.dead) return
    ball.dead = true
    other.dead = true
    mergeQueue.push([ball, other])
  })

  balls.push(ball)
  bodyToBall.set(body, ball)
  world.addBody(body)
  scene.add(mesh)
  return ball
}

function removeBall(ball: Ball): void {
  world.removeBody(ball.body)
  scene.remove(ball.mesh)
  bodyToBall.delete(ball.body)
  const i = balls.indexOf(ball)
  if (i >= 0) balls.splice(i, 1)
}

/* ================= 合成 ================= */

function processMerges(): void {
  if (mergeQueue.length === 0) return
  for (const [a, b] of mergeQueue) {
    const lvl = a.level
    const p = new CANNON.Vec3(
      (a.body.position.x + b.body.position.x) * 0.5,
      (a.body.position.y + b.body.position.y) * 0.5,
      (a.body.position.z + b.body.position.z) * 0.5,
    )

    const gained = lvl >= 7 ? MAX_MERGE_SCORE : LEVELS[lvl].score
    removeBall(a)
    removeBall(b)
    addScore(gained, p)

    const fxColor = LEVELS[Math.min(lvl, LEVELS.length - 1)].color
    spawnRing(p, fxColor, lvl >= 7 ? 3.4 : LEVELS[lvl].radius * 2.4)

    if (lvl >= 7) {
      sfx.maxMerge()
    } else {
      sfx.merge(lvl + 1)
      const r = LEVELS[lvl].radius // 新球 = lvl+1 号
      // 三个轴向都夹回盒内：贴墙合成时新球更大，若嵌墙会被穿透解算推到墙外
      const lim = BOX_HALF - r - 0.03
      spawnBall(
        lvl + 1,
        THREE.MathUtils.clamp(p.x, -lim, lim),
        Math.max(p.y, -BOX_HALF + r + 0.02),
        THREE.MathUtils.clamp(p.z, -lim, lim),
      )
    }
  }
  mergeQueue.length = 0
}

/* ================= 特效 ================= */

const ringGeo = new THREE.RingGeometry(0.82, 1, 48)

function spawnRing(p: CANNON.Vec3, color: number, r: number): void {
  const mesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(p.x, Math.min(p.y + 0.05, BOX_HALF + 0.3), p.z)
  scene.add(mesh)
  effects.push({ mesh, t: 0, dur: 0.4, r })
}

function popText(worldPos: CANNON.Vec3, text: string): void {
  const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(camera)
  const el = document.createElement('div')
  el.className = 'pop'
  el.textContent = text
  el.style.left = `${((v.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px`
  el.style.top = `${((-v.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 850)
}

function addScore(gained: number, at: CANNON.Vec3): void {
  score += gained
  if (score > best) {
    best = score
    localStorage.setItem(BEST_KEY, String(best))
  }
  elScore.textContent = String(score)
  elBest.textContent = `最高分 ${best}`
  popText(at, `+${gained}`)
}

function updateEffects(dt: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i]
    fx.t += dt
    const k = fx.t / fx.dur
    if (k >= 1) {
      scene.remove(fx.mesh)
      ;(fx.mesh.material as THREE.Material).dispose()
      effects.splice(i, 1)
    } else {
      fx.mesh.scale.setScalar(fx.r * (0.3 + 1.1 * k))
      ;(fx.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k)
    }
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/* ================= 落球与队列 ================= */

function rollLevel(): number {
  return 1 + Math.floor(Math.random() * 3) // 随机 1~3 号
}

/**
 * 面板归一化坐标 (u,v) → 盒顶世界坐标。
 * 全盒线性映射（面板边缘 ↔ 盒壁），使预览球心与鼠标像素级重合；
 * 落球时的贴墙钳制在 dropAt 内处理。
 */
function aimWorld(u: number, v: number): { x: number; z: number; r: number } {
  const r = LEVELS[currentLevel - 1].radius
  return {
    x: THREE.MathUtils.lerp(-BOX_HALF, BOX_HALF, u),
    z: THREE.MathUtils.lerp(-BOX_HALF, BOX_HALF, v),
    r,
  }
}

function dropAt(u: number, v: number): void {
  // 用真实时钟而非渲染时钟：rAF 冻结（标签页后台）时冷却也不会永久卡死
  const now = performance.now() / 1000
  if (now < cooldownUntil) return
  cooldownUntil = now + DROP_COOLDOWN
  panel.classList.add('cooling')
  setTimeout(() => panel.classList.remove('cooling'), DROP_COOLDOWN * 1000)

  const { x: mx, z: mz, r } = aimWorld(u, v)
  // 生成位置钳到贴墙合法位：预览球心可以贴面板边缘（贴墙），
  // 但球生成在盒顶上方时侧墙同样存在，嵌墙会被硬约束横向弹开
  const lim = BOX_HALF - r + 0.02
  const x = THREE.MathUtils.clamp(mx, -lim, lim)
  const z = THREE.MathUtils.clamp(mz, -lim, lim)
  spawnBall(currentLevel, x, BOX_HALF + r + DROP_LIFT, z)
  sfx.drop()

  currentLevel = nextLevel
  nextLevel = rollLevel()
  updateQueueUI()
  refreshAim()
}

/* ================= UI ================= */

const elScore = document.getElementById('score')!
const elBest = document.getElementById('best')!
const panel = document.getElementById('panel')!
const curDot = document.getElementById('cur-dot')!
const curName = document.getElementById('cur-name')!
const nextDot = document.getElementById('next-dot')!
const nextName = document.getElementById('next-name')!

function dotStyle(dot: HTMLElement, level: number): void {
  const r = LEVELS[level - 1].radius
  const size = 14 + r * 13
  dot.style.width = `${size.toFixed(0)}px`
  dot.style.height = `${size.toFixed(0)}px`
  dot.style.background = cssColor(level)
}

function updateQueueUI(): void {
  dotStyle(curDot, currentLevel)
  dotStyle(nextDot, nextLevel)
  curName.textContent = `${LEVELS[currentLevel - 1].name} · ${currentLevel}号`
  nextName.textContent = `${LEVELS[nextLevel - 1].name} · ${nextLevel}号`
}

let lastUV = { u: 0.5, v: 0.5 }

/** 刷新 3D 场景中的落点指示器（面板内的当前球预览由顶视图每帧绘制） */
function refreshAim(): void {
  if (!aim.visible) return
  const { x, z, r } = aimWorld(lastUV.u, lastUV.v)
  aim.position.set(x, 0, z)
  aimRing.scale.setScalar(r)
}

function panelUV(ev: PointerEvent): { u: number; v: number } {
  // 用内容区坐标（clientWidth/clientLeft 不含 1px 边框），与顶视图 canvas 像素级对齐
  const rect = panel.getBoundingClientRect()
  const left = rect.left + panel.clientLeft
  const top = rect.top + panel.clientTop
  const w = panel.clientWidth || rect.width
  const h = panel.clientHeight || rect.height
  return {
    u: THREE.MathUtils.clamp((ev.clientX - left) / w, 0, 1),
    v: THREE.MathUtils.clamp((ev.clientY - top) / h, 0, 1),
  }
}

panel.addEventListener('pointermove', (ev) => {
  lastUV = panelUV(ev)
  refreshAim()
})
panel.addEventListener('pointerenter', (ev) => {
  lastUV = panelUV(ev)
  aim.visible = true
  refreshAim()
})
panel.addEventListener('pointerleave', () => {
  aim.visible = false
})
panel.addEventListener('click', (ev) => {
  const { u, v } = panelUV(ev)
  dropAt(u, v)
})

document.getElementById('reset')!.addEventListener('click', () => {
  for (const fx of effects) {
    scene.remove(fx.mesh)
    ;(fx.mesh.material as THREE.Material).dispose()
  }
  effects.length = 0
  mergeQueue.length = 0
  for (const b of [...balls]) removeBall(b)
  score = 0
  cooldownUntil = 0
  elScore.textContent = '0'
  initQueue()
})

function initQueue(): void {
  currentLevel = rollLevel()
  nextLevel = rollLevel()
  updateQueueUI()
}

/* ================= 顶视图：面板内实时俯视雷达（2D 正交，带 3D 光影） ================= */

const topView = document.getElementById('top-view') as HTMLCanvasElement
const tvCtx = topView.getContext('2d')!

/**
 * 在顶视图中画一颗带 3D 光影的球。
 * 光影方向与场景太阳光 (8,13,7) 的俯视投影一致：高光在球右下、落影在左上。
 */
function drawShadedBall(cx: number, cy: number, rr: number, level: number): void {
  const hex = LEVELS[level - 1].color
  const cr = (hex >> 16) & 255
  const cg = (hex >> 8) & 255
  const cb = hex & 255
  const hi = (v: number) => Math.min(255, Math.round(v * 1.55 + 40))
  const lo = (v: number) => Math.round(v * 0.38)
  const lx = 0.36 // 光源方向偏移（俯视投影，右下）
  const ly = 0.36
  const px = topView.width

  // 落影（光从右下来，影子向左上偏移）
  tvCtx.beginPath()
  tvCtx.arc(cx - rr * 0.16, cy - rr * 0.16, rr * 0.98, 0, Math.PI * 2)
  tvCtx.fillStyle = 'rgba(4, 9, 22, 0.42)'
  tvCtx.fill()

  // 球体：径向渐变（亮 → 基色 → 暗缘）
  const grad = tvCtx.createRadialGradient(cx + rr * lx, cy + rr * ly, rr * 0.08, cx, cy, rr)
  grad.addColorStop(0, `rgb(${hi(cr)},${hi(cg)},${hi(cb)})`)
  grad.addColorStop(0.55, `rgb(${cr},${cg},${cb})`)
  grad.addColorStop(1, `rgb(${lo(cr)},${lo(cg)},${lo(cb)})`)
  tvCtx.beginPath()
  tvCtx.arc(cx, cy, rr, 0, Math.PI * 2)
  tvCtx.fillStyle = grad
  tvCtx.fill()

  // 高光点
  const hl = tvCtx.createRadialGradient(
    cx + rr * lx * 0.82, cy + rr * ly * 0.82, 0,
    cx + rr * lx * 0.82, cy + rr * ly * 0.82, rr * 0.55,
  )
  hl.addColorStop(0, 'rgba(255,255,255,0.6)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  tvCtx.fillStyle = hl
  tvCtx.fill()

  // 轮廓
  tvCtx.lineWidth = Math.max(1, px / 340)
  tvCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  tvCtx.stroke()
}

function drawTopView(): void {
  // 面板为 30vw，随窗口变化，尺寸按需同步（DPR 缩放保证清晰）
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const css = panel.clientWidth
  if (css === 0) return
  const px = Math.round(css * dpr)
  if (topView.width !== px) {
    topView.width = px
    topView.height = px
  }

  // 2D 正交映射：世界 [-BOX_HALF, BOX_HALF] 线性映射到面板内区（无透视）
  const pad = px * 0.045
  const inner = px - pad * 2
  const span = 2 * BOX_HALF
  const toPxX = (wx: number) => pad + ((wx + BOX_HALF) / span) * inner
  const toPxY = (wz: number) => pad + ((wz + BOX_HALF) / span) * inner
  const toPxR = (r: number) => (r / BOX_HALF) * (inner / 2)

  tvCtx.clearRect(0, 0, px, px)

  // 场上球体：大球先画（下层），坐标与真实物理位置一致
  const sorted = [...balls].sort(
    (a, b) => LEVELS[b.level - 1].radius - LEVELS[a.level - 1].radius,
  )
  for (const b of sorted) {
    drawShadedBall(
      toPxX(b.body.position.x),
      toPxY(b.body.position.z),
      toPxR(LEVELS[b.level - 1].radius),
      b.level,
    )
  }

  // 鼠标悬停时：在钳制后的实际落点画当前球（与顶视图已有球、3D 落点指示器完全重合）
  if (aim.visible) {
    drawShadedBall(
      toPxX(aim.position.x),
      toPxY(aim.position.z),
      toPxR(LEVELS[currentLevel - 1].radius),
      currentLevel,
    )
  }
}

/* ================= 主循环 ================= */

/** 单帧物理推进：step + 合成处理 + 安全网巡检 + 限速 + 网格同步 */
function stepPhysics(dt: number): void {
  // 1/120 固定子步：单步位移减半，大幅降低高速撞击的穿透概率
  world.step(1 / 120, dt, 8)
  processMerges()

  const now = clock.elapsedTime
  for (const b of balls) {
    const p = b.body.position
    const r = LEVELS[b.level - 1].radius
    const v = b.body.velocity
    // 硬位置约束（先于一切兜底）：每帧把球钳在「最多浅嵌墙 0.08」内。
    // 原因：球心被堆压挤过墙体内壁后，Box 接触解算会把球推离表面=推向墙外，
    // 造成穿墙。位置钳制不依赖求解器，从物理上杜绝穿墙。
    const lim = BOX_HALF - r + 0.08
    if (p.x < -lim) {
      p.x = -lim
      if (v.x < 0) v.x = 0
    } else if (p.x > lim) {
      p.x = lim
      if (v.x > 0) v.x = 0
    }
    if (p.z < -lim) {
      p.z = -lim
      if (v.z < 0) v.z = 0
    } else if (p.z > lim) {
      p.z = lim
      if (v.z > 0) v.z = 0
    }
    const floorY = -BOX_HALF + r - 0.08
    if (p.y < floorY) {
      p.y = floorY
      if (v.y < 0) v.y = 0
    }
    const ceilY = BOX_HALF + WALL_EXTRA - r + 0.08
    if (p.y > ceilY) {
      p.y = ceilY
      if (v.y > 0) v.y = 0
    }
    // 兜底安全网：极端穿透被挤到盒外的球 → 传回盒顶重新落下，永不丢失
    if (p.y < -BOX_HALF - 2 || Math.abs(p.x) > BOX_HALF + 2 || Math.abs(p.z) > BOX_HALF + 2) {
      const lim = BOX_HALF - r - 0.03
      p.x = THREE.MathUtils.clamp(p.x, -lim, lim)
      p.z = THREE.MathUtils.clamp(p.z, -lim, lim)
      p.y = BOX_HALF + r + 0.4
      b.body.velocity.set(0, -1, 0)
      b.body.angularVelocity.set(0, 0, 0)
    }
    // 限速：防止极端弹射速度造成隧穿
    const speed = v.length()
    if (speed > 22) v.scale(22 / speed, v)

    b.mesh.position.set(p.x, p.y, p.z)
    b.mesh.quaternion.set(
      b.body.quaternion.x,
      b.body.quaternion.y,
      b.body.quaternion.z,
      b.body.quaternion.w,
    )
    const age = now - b.born
    b.mesh.scale.setScalar(age < BIRTH ? Math.max(easeOutBack(age / BIRTH), 0.05) : 1)
  }

  drawTopView()
}

function tick(): void {
  requestAnimationFrame(tick)
  const dt = Math.min(clock.getDelta(), 0.05)
  stepPhysics(dt)
  updateEffects(dt)
  controls.update()
  renderer.render(scene, camera)
}

/* ================= 启动 ================= */

// 诊断钩子：浏览器控制台可实时查看/驱动物理状态（window.__wm）
;(window as unknown as { __wm: object }).__wm = {
  balls,
  world,
  stepPhysics,
  get levelStats() {
    return balls.reduce<Record<number, number>>((m, b) => {
      m[b.level] = (m[b.level] ?? 0) + 1
      return m
    }, {})
  },
}

elBest.textContent = `最高分 ${best}`
initQueue()
tick()
