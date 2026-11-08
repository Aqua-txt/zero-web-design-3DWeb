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
  LEGACY_BEST_KEY,
  MAX_MERGE_SCORE,
  OVERFLOW_Y,
  OVERFLOW_HOLD,
  OVERFLOW_GRACE,
  cssColor,
  cssGlow,
} from './config.ts'
import { createPearl } from './art/pearls.ts'
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
  /** 是否已经播过落点涟漪 */
  landed: boolean
}

const balls: Ball[] = []
const bodyToBall = new Map<CANNON.Body, Ball>()
const mergeQueue: Array<[Ball, Ball]> = []
const seen = new Set<number>()

const storedBest = localStorage.getItem(BEST_KEY) ?? localStorage.getItem(LEGACY_BEST_KEY)
let score = 0
let best = storedBest ? Number(storedBest) || 0 : 0
let currentLevel = 0
let nextLevel = 0
let cooldownUntil = 0
let started = false
let gameOver = false
let overflowTimer = 0

const sfx = new Sfx()

/* ================= 场景 ================= */

const kit = createScene(document.getElementById('stage')!)
const { scene, camera, aim, aimRing, fx, quality } = kit
const clock = new THREE.Clock()

/* ================= 物理 ================= */

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0), allowSleep: false })
world.broadphase = new CANNON.SAPBroadphase(world)
;(world.solver as CANNON.GSSolver).iterations = 20

const matBall = new CANNON.Material('ball')
const matWall = new CANNON.Material('wall')
world.addContactMaterial(
  new CANNON.ContactMaterial(matBall, matBall, {
    friction: 0.45,
    restitution: 0.08,
    contactEquationStiffness: 5e6,
    contactEquationRelaxation: 4,
  }),
)
world.addContactMaterial(
  new CANNON.ContactMaterial(matBall, matWall, { friction: 0.06, restitution: 0.05 }),
)

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
  const wallBottom = -BOX_HALF
  const wallTop = BOX_HALF + WALL_EXTRA
  const sideH = wallTop - wallBottom
  const sideCy = (wallTop + wallBottom) / 2
  addWall(0, -BOX_HALF - WALL_T / 2, 0, BOX_HALF + WALL_T * 2, WALL_T / 2, BOX_HALF + WALL_T * 2)
  const sx = BOX_HALF + WALL_T / 2
  addWall(-sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF + WALL_T)
  addWall(sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF + WALL_T)
  addWall(0, sideCy, -sx, BOX_HALF + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, sideCy, sx, BOX_HALF + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, wallTop + WALL_T / 2, 0, sx + WALL_T, WALL_T / 2, sx + WALL_T)
}

/* ================= 球体 ================= */

function spawnBall(level: number, x: number, y: number, z: number): Ball {
  const def = LEVELS[level - 1]
  const body = new CANNON.Body({
    mass: Math.pow(def.radius, 3) * 5,
    material: matBall,
    shape: new CANNON.Sphere(def.radius),
    linearDamping: 0.06,
    angularDamping: 0.4,
  })
  body.position.set(x, y, z)
  body.velocity.set(0, -2, 0)

  const mesh = createPearl(level, quality)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const ball: Ball = {
    level,
    body,
    mesh,
    born: clock.elapsedTime,
    dead: false,
    landed: false,
  }

  body.addEventListener('collide', (ev: { body: CANNON.Body }) => {
    const other = bodyToBall.get(ev.body)
    if (!ball.landed && body.position.y < BOX_HALF + 0.1 && clock.elapsedTime - ball.born > 0.12) {
      ball.landed = true
      fx.impact(
        new THREE.Vector3(body.position.x, body.position.y, body.position.z),
        def.glow,
      )
    }
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
  seen.add(level)
  updateLadder()
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
  if (gameOver || mergeQueue.length === 0) return
  for (const [a, b] of mergeQueue) {
    const lvl = a.level
    const p = new CANNON.Vec3(
      (a.body.position.x + b.body.position.x) * 0.5,
      (a.body.position.y + b.body.position.y) * 0.5,
      (a.body.position.z + b.body.position.z) * 0.5,
    )
    const p3 = new THREE.Vector3(p.x, p.y, p.z)
    const glow = LEVELS[Math.min(lvl, LEVELS.length - 1)].glow

    removeBall(a)
    removeBall(b)

    const gained = lvl >= 7 ? MAX_MERGE_SCORE : LEVELS[lvl].score
    addScore(gained)

    if (lvl >= 7) {
      fx.maxMerge(p3)
      sfx.maxMerge()
      flashScreen()
      shakeStage()
      popText(p, `+${gained}`, '双珠化光')
    } else {
      fx.merge(p3, lvl, LEVELS[lvl - 1].radius, glow)
      sfx.merge(lvl + 1)
      popText(p, `+${gained}`, `${LEVELS[lvl].name} · 成`)

      const r = LEVELS[lvl].radius
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

/* ================= 特效 / 得分 ================= */

function popText(worldPos: CANNON.Vec3, text: string, sub?: string): void {
  const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z).project(camera)
  if (v.z > 1) return
  const el = document.createElement('div')
  el.className = 'pop'
  const main = document.createElement('b')
  main.textContent = text
  el.appendChild(main)
  if (sub) {
    const small = document.createElement('small')
    small.textContent = sub
    el.appendChild(small)
  }
  el.style.left = `${((v.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px`
  el.style.top = `${((-v.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px`
  ;(document.getElementById('pop-layer') ?? document.body).appendChild(el)
  setTimeout(() => el.remove(), 1000)
}

const elScore = document.getElementById('score')!
const elBest = document.getElementById('best')!
function addScore(gained: number): void {
  score += gained
  if (score > best) {
    best = score
    localStorage.setItem(BEST_KEY, String(best))
  }
  elScore.textContent = String(score)
  elBest.textContent = `最高 ${best}`
  elScore.classList.remove('bump')
  void elScore.offsetWidth
  elScore.classList.add('bump')
}

function flashScreen(): void {
  const el = document.getElementById('flash')
  if (!el) return
  el.classList.remove('on')
  void el.offsetWidth
  el.classList.add('on')
  setTimeout(() => el.classList.remove('on'), 520)
}

function shakeStage(): void {
  const stage = document.getElementById('stage')
  if (!stage) return
  stage.classList.remove('shake')
  void stage.offsetWidth
  stage.classList.add('shake')
  setTimeout(() => stage.classList.remove('shake'), 520)
}

/* ================= 落珠与队列 ================= */

function rollLevel(): number {
  return 1 + Math.floor(Math.random() * 3)
}

function aimWorld(u: number, v: number): { x: number; z: number; r: number } {
  const r = LEVELS[currentLevel - 1].radius
  return {
    x: THREE.MathUtils.lerp(-BOX_HALF, BOX_HALF, u),
    z: THREE.MathUtils.lerp(-BOX_HALF, BOX_HALF, v),
    r,
  }
}

function dropAt(u: number, v: number): void {
  if (!started || gameOver) return
  const now = performance.now() / 1000
  if (now < cooldownUntil) return
  cooldownUntil = now + DROP_COOLDOWN
  panel.classList.add('cooling')
  setTimeout(() => panel.classList.remove('cooling'), DROP_COOLDOWN * 1000)

  const { x: mx, z: mz, r } = aimWorld(u, v)
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

const panel = document.getElementById('panel')!
const curDot = document.getElementById('cur-dot')!
const curName = document.getElementById('cur-name')!
const nextDot = document.getElementById('next-dot')!
const nextName = document.getElementById('next-name')!
const ladder = document.getElementById('ladder')!
const intro = document.getElementById('intro')!
const over = document.getElementById('over')!
const elFinalScore = document.getElementById('final-score')!
const elFinalBest = document.getElementById('final-best')!

function dotStyle(dot: HTMLElement, level: number): void {
  const r = LEVELS[level - 1].radius
  const size = 14 + r * 15
  dot.style.width = `${size.toFixed(0)}px`
  dot.style.height = `${size.toFixed(0)}px`
  dot.style.background = `radial-gradient(circle at 34% 28%, rgba(255,255,255,.92), ${cssColor(
    level,
  )} 42%, rgba(10,8,8,.75) 100%)`
  dot.style.boxShadow = `0 0 ${(8 + r * 6).toFixed(0)}px ${cssGlow(level)}66, inset -2px -3px 6px rgba(0,0,0,.4)`
}

function updateQueueUI(): void {
  dotStyle(curDot, currentLevel)
  dotStyle(nextDot, nextLevel)
  curName.textContent = LEVELS[currentLevel - 1].name
  nextName.textContent = LEVELS[nextLevel - 1].name
}

function updateLadder(): void {
  const maxSeen = Math.max(0, ...seen)
  ladder.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => {
    const lv = Number(el.dataset.level)
    el.classList.toggle('on', seen.has(lv))
    el.classList.toggle('current', lv === maxSeen)
    el.style.setProperty('--c', cssColor(lv))
    el.title = LEVELS[lv - 1].name
  })
}

let lastUV = { u: 0.5, v: 0.5 }

/** 罗盘内圈（与 CSS 的 7.5% 留白一致）映射到盒子边界 */
const PANEL_PAD = 0.075

function refreshAim(): void {
  if (!aim.visible) return
  const { x, z, r } = aimWorld(lastUV.u, lastUV.v)
  aim.position.set(x, 0, z)
  aimRing.scale.setScalar(r)
}

function panelUV(ev: PointerEvent): { u: number; v: number } {
  const rect = panel.getBoundingClientRect()
  const left = rect.left + panel.clientLeft
  const top = rect.top + panel.clientTop
  const w = panel.clientWidth || rect.width
  const h = panel.clientHeight || rect.height
  const nx = (ev.clientX - left) / w
  const ny = (ev.clientY - top) / h
  return {
    u: THREE.MathUtils.clamp((nx - PANEL_PAD) / (1 - PANEL_PAD * 2), 0, 1),
    v: THREE.MathUtils.clamp((ny - PANEL_PAD) / (1 - PANEL_PAD * 2), 0, 1),
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
  sfx.click()
  restart()
})

document.getElementById('start')!.addEventListener('click', () => {
  if (started) return
  started = true
  sfx.start()
  intro.classList.add('leaving')
  window.setTimeout(() => {
    intro.classList.add('hidden')
  }, 720)
  initQueue()
  updateQueueUI()
  updateLadder()
})

document.getElementById('again')!.addEventListener('click', () => {
  sfx.click()
  over.classList.remove('show')
  window.setTimeout(() => {
    over.hidden = true
  }, 320)
  restart()
})

/* ================= 匣满 ================= */

function endGame(): void {
  if (gameOver) return
  gameOver = true
  panel.classList.add('disabled')
  elFinalScore.textContent = String(score)
  elFinalBest.textContent = `最高 ${best}`
  over.hidden = false
  requestAnimationFrame(() => over.classList.add('show'))
  sfx.gameOver()
}

function checkOverflow(dt: number): void {
  if (!started || gameOver) return
  let danger = false
  for (const b of balls) {
    if (clock.elapsedTime - b.born < OVERFLOW_GRACE) continue
    if (b.body.position.y > OVERFLOW_Y && b.body.velocity.length() < 2.4) {
      danger = true
      break
    }
  }
  if (danger) overflowTimer += dt
  else overflowTimer = Math.max(0, overflowTimer - dt * 2)
  if (overflowTimer > OVERFLOW_HOLD) endGame()
}

function restart(): void {
  fx.clear()
  mergeQueue.length = 0
  for (const b of [...balls]) removeBall(b)
  score = 0
  cooldownUntil = 0
  overflowTimer = 0
  gameOver = false
  started = true
  seen.clear()
  elScore.textContent = '0'
  elScore.classList.remove('bump')
  panel.classList.remove('disabled')
  over.classList.remove('show')
  over.hidden = true
  intro.classList.add('hidden')
  initQueue()
  updateLadder()
}

function initQueue(): void {
  currentLevel = rollLevel()
  nextLevel = rollLevel()
  updateQueueUI()
  updateLadder()
}

/* ================= 俯视图 ================= */

const topView = document.getElementById('top-view') as HTMLCanvasElement
const tvCtx = topView.getContext('2d')!

function drawShadedBall(cx: number, cy: number, rr: number, level: number, alpha = 1): void {
  const hex = LEVELS[level - 1].color
  const glow = LEVELS[level - 1].glow
  const cr = (hex >> 16) & 255
  const cg = (hex >> 8) & 255
  const cb = hex & 255
  const hi = (v: number) => Math.min(255, Math.round(v * 1.5 + 52))
  const lo = (v: number) => Math.round(v * 0.32)
  const lx = 0.36
  const ly = 0.36
  const px = topView.width

  tvCtx.save()
  tvCtx.globalAlpha = alpha

  // 落影（淡墨）
  tvCtx.beginPath()
  tvCtx.arc(cx - rr * 0.16, cy - rr * 0.16, rr * 0.98, 0, Math.PI * 2)
  tvCtx.fillStyle = 'rgba(18, 24, 28, 0.42)'
  tvCtx.fill()

  // 外发光（夜明珠更强）
  const glowAlpha = level >= 7 ? 0.36 : level >= 5 ? 0.14 : 0.07
  const halo = tvCtx.createRadialGradient(cx, cy, rr * 0.7, cx, cy, rr * 1.65)
  halo.addColorStop(0, `rgba(${(glow >> 16) & 255}, ${(glow >> 8) & 255}, ${glow & 255}, ${glowAlpha})`)
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  tvCtx.beginPath()
  tvCtx.arc(cx, cy, rr * 1.65, 0, Math.PI * 2)
  tvCtx.fillStyle = halo
  tvCtx.fill()

  // 球体
  const grad = tvCtx.createRadialGradient(cx + rr * lx, cy + rr * ly, rr * 0.06, cx, cy, rr)
  grad.addColorStop(0, `rgb(${hi(cr)},${hi(cg)},${hi(cb)})`)
  grad.addColorStop(0.55, `rgb(${cr},${cg},${cb})`)
  grad.addColorStop(1, `rgb(${lo(cr)},${lo(cg)},${lo(cb)})`)
  tvCtx.beginPath()
  tvCtx.arc(cx, cy, rr, 0, Math.PI * 2)
  tvCtx.fillStyle = grad
  tvCtx.fill()

  // 高光
  const hl = tvCtx.createRadialGradient(
    cx + rr * lx * 0.82,
    cy + rr * ly * 0.82,
    0,
    cx + rr * lx * 0.82,
    cy + rr * ly * 0.82,
    rr * 0.5,
  )
  hl.addColorStop(0, 'rgba(255, 252, 240, 0.62)')
  hl.addColorStop(1, 'rgba(255, 255, 255, 0)')
  tvCtx.fillStyle = hl
  tvCtx.fill()

  // 轮廓
  tvCtx.lineWidth = Math.max(1, px / 420)
  tvCtx.strokeStyle = 'rgba(255, 244, 220, 0.34)'
  tvCtx.stroke()

  tvCtx.restore()
}

function drawTopView(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const css = panel.clientWidth
  if (css === 0) return
  const px = Math.round(css * dpr)
  if (topView.width !== px) {
    topView.width = px
    topView.height = px
  }

  const pad = px * PANEL_PAD
  const inner = px - pad * 2
  const span = 2 * BOX_HALF
  const toPxX = (wx: number) => pad + ((wx + BOX_HALF) / span) * inner
  const toPxY = (wz: number) => pad + ((wz + BOX_HALF) / span) * inner
  const toPxR = (r: number) => (r / BOX_HALF) * (inner / 2)

  tvCtx.clearRect(0, 0, px, px)

  // 顶视图按“谁在上面”排：球心低者先画，高者后画（画家算法）。
  // 同一高度层再按半径从小到大画，让更大的球压在更小的球上。
  const sorted = [...balls].sort((a, b) => {
    const dy = a.body.position.y - b.body.position.y
    if (Math.abs(dy) > 1e-4) return dy
    return LEVELS[a.level - 1].radius - LEVELS[b.level - 1].radius
  })
  for (const b of sorted) {
    drawShadedBall(
      toPxX(b.body.position.x),
      toPxY(b.body.position.z),
      toPxR(LEVELS[b.level - 1].radius),
      b.level,
    )
  }

  if (aim.visible) {
    drawShadedBall(
      toPxX(aim.position.x),
      toPxY(aim.position.z),
      toPxR(LEVELS[currentLevel - 1].radius),
      currentLevel,
      0.82,
    )
    tvCtx.save()
    tvCtx.setLineDash([5, 5])
    tvCtx.strokeStyle = 'rgba(178, 58, 46, 0.9)'
    tvCtx.lineWidth = Math.max(1, px / 300)
    tvCtx.beginPath()
    tvCtx.arc(
      toPxX(aim.position.x),
      toPxY(aim.position.z),
      toPxR(LEVELS[currentLevel - 1].radius) + 3,
      0,
      Math.PI * 2,
    )
    tvCtx.stroke()
    tvCtx.restore()
  }
}

/* ================= 主循环 ================= */

function stepPhysics(dt: number): void {
  world.step(1 / 120, dt, 8)
  processMerges()

  const now = clock.elapsedTime
  for (const b of balls) {
    const p = b.body.position
    const r = LEVELS[b.level - 1].radius
    const v = b.body.velocity
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
    if (p.y < -BOX_HALF - 2 || Math.abs(p.x) > BOX_HALF + 2 || Math.abs(p.z) > BOX_HALF + 2) {
      const lim2 = BOX_HALF - r - 0.03
      p.x = THREE.MathUtils.clamp(p.x, -lim2, lim2)
      p.z = THREE.MathUtils.clamp(p.z, -lim2, lim2)
      p.y = BOX_HALF + r + 0.4
      b.body.velocity.set(0, -1, 0)
      b.body.angularVelocity.set(0, 0, 0)
    }
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

  checkOverflow(dt)
  drawTopView()
}

function tick(): void {
  requestAnimationFrame(tick)
  const dt = Math.min(clock.getDelta(), 0.05)
  stepPhysics(dt)
  kit.update(dt)
  kit.render()
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/* ================= 启动 ================= */

function fastForward(seconds: number): void {
  const step = 1 / 60
  const count = Math.min(2400, Math.ceil(seconds / step))
  for (let i = 0; i < count; i++) {
    clock.elapsedTime += step
    stepPhysics(step)
    kit.update(step)
  }
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __wm: object }).__wm = {
    balls,
    world,
    scene,
    kit,
    spawnBall,
    stepPhysics,
    fastForward,
    get levelStats() {
      return balls.reduce<Record<number, number>>((m, b) => {
        m[b.level] = (m[b.level] ?? 0) + 1
        return m
      }, {})
    },
    get state() {
      return { score, best, started, gameOver, overflowTimer }
    },
  }
}

elBest.textContent = `最高 ${best}`
elScore.textContent = '0'
initQueue()
updateLadder()

intro.hidden = false
tick()
