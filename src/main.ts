import './style.css'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import {
  LEVELS,
  BOX_HALF,
  BOX_HALF_XZ,
  BOX_CENTER_Y,
  WALL_EXTRA,
  WALL_T,
  DROP_LIFT,
  DROP_COOLDOWN,
  BIRTH,
  BEST_KEY,
  LEGACY_BEST_KEY,
  CODEX_KEY,
  MAX_MERGE_SCORE,
  OVERFLOW_Y,
  OVERFLOW_HOLD,
  OVERFLOW_GRACE,
  ROUND_SECONDS,
  ROUND_WARN,
  DANGER_SECONDS,
  TIME_OF_DAY,
  type TimeOfDay,
  cssColor,
  cssGlow,
} from './config.ts'
import { createPearl } from './art/pearls.ts'
import { createScene } from './scene.ts'
import { drawInkScroll } from './art/ink.ts'
import { Bgm, Sfx } from './audio.ts'

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

/** 收局原因：珠满溢出 / 漏刻走空 */
type EndReason = 'overflow' | 'time'

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
/** 本局剩余时辰（秒）：起局后开始走，珠满或走空都收卷 */
let timeLeft = ROUND_SECONDS
let lastTimerLabel = ''
/** 上一次响过催时木鱼的整秒，避免同一秒重复出声 */
let lastWarnSecond = -1

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
  const wallBottom = BOX_CENTER_Y - BOX_HALF
  const wallTop = BOX_CENTER_Y + BOX_HALF + WALL_EXTRA
  const sideH = wallTop - wallBottom
  const sideCy = (wallTop + wallBottom) / 2
  addWall(0, wallBottom - WALL_T / 2, 0, BOX_HALF_XZ + WALL_T * 2, WALL_T / 2, BOX_HALF_XZ + WALL_T * 2)
  const sx = BOX_HALF_XZ + WALL_T / 2
  addWall(-sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF_XZ + WALL_T)
  addWall(sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF_XZ + WALL_T)
  addWall(0, sideCy, -sx, BOX_HALF_XZ + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, sideCy, sx, BOX_HALF_XZ + WALL_T, sideH / 2, WALL_T / 2)
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
    if (!ball.landed && body.position.y < BOX_CENTER_Y + BOX_HALF + 0.1 && clock.elapsedTime - ball.born > 0.12) {
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
  // 任何一枚珠现世（落的或合的）都记进七宝谱
  recordPearl(level)
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
      kit.react(8)
      popText(p, `+${gained}`, '双珠化光')
    } else {
      fx.merge(p3, lvl, LEVELS[lvl - 1].radius, glow)
      sfx.merge(lvl + 1)
      kit.react(lvl + 1)
      popText(p, `+${gained}`, `${LEVELS[lvl].name} · 成`)

      const r = LEVELS[lvl].radius
      const lim = BOX_HALF_XZ - r - 0.03
      spawnBall(
        lvl + 1,
        THREE.MathUtils.clamp(p.x, -lim, lim),
        Math.max(p.y, BOX_CENTER_Y - BOX_HALF + r + 0.02),
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
    x: THREE.MathUtils.lerp(-BOX_HALF_XZ, BOX_HALF_XZ, u),
    z: THREE.MathUtils.lerp(-BOX_HALF_XZ, BOX_HALF_XZ, v),
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
  const lim = BOX_HALF_XZ - r + 0.02
  const x = THREE.MathUtils.clamp(mx, -lim, lim)
  const z = THREE.MathUtils.clamp(mz, -lim, lim)
  spawnBall(currentLevel, x, BOX_CENTER_Y + BOX_HALF + r + DROP_LIFT, z)
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
const elOverKicker = document.getElementById('over-kicker')!
const elOverTitle = document.getElementById('over-title')!
const endArt = document.getElementById('end-art') as HTMLCanvasElement
const elTimer = document.getElementById('timer')!
const elTimerText = document.getElementById('timer-text')!
const elDanger = document.getElementById('danger')!

// 「匣满」卷轴的水墨山水底纹（真正的画幅要等卷轴展开后才量得到，展开时还会重画一次）
drawInkScroll(endArt)

/* ---------------- 漏刻（两分钟一局） ---------------- */

function updateTimerUI(): void {
  const total = Math.max(0, Math.ceil(timeLeft))
  const label = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  if (label === lastTimerLabel) return
  lastTimerLabel = label
  elTimerText.textContent = label
  elTimer.classList.toggle('warn', total <= ROUND_WARN)
}

function resetTimer(): void {
  timeLeft = ROUND_SECONDS
  lastTimerLabel = ''
  lastWarnSecond = -1
  elDanger.classList.remove('on')
  updateTimerUI()
}

function tickTimer(dt: number): void {
  if (!started || gameOver) return
  timeLeft = Math.max(0, timeLeft - dt)
  updateTimerUI()

  // 最后十秒：外围红晕 + 每秒一声木鱼（末三秒更急）
  const second = Math.ceil(timeLeft)
  if (second !== lastWarnSecond) {
    lastWarnSecond = second
    if (second > 0 && second <= DANGER_SECONDS) {
      elDanger.classList.add('on')
      sfx.warn(second)
    }
  }

  if (timeLeft <= 0) endGame('time')
}

function pearlGradient(level: number): string {
  return `radial-gradient(circle at 34% 28%, rgba(255,255,255,.92), ${cssColor(
    level,
  )} 42%, rgba(10,8,8,.75) 100%)`
}

function dotStyle(dot: HTMLElement, level: number): void {
  const r = LEVELS[level - 1].radius
  const size = 14 + r * 15
  dot.style.width = `${size.toFixed(0)}px`
  dot.style.height = `${size.toFixed(0)}px`
  dot.style.background = pearlGradient(level)
  dot.style.boxShadow = `0 0 ${(8 + r * 6).toFixed(0)}px ${cssGlow(level)}66, inset -2px -3px 6px rgba(0,0,0,.4)`
}

function updateQueueUI(): void {
  dotStyle(curDot, currentLevel)
  dotStyle(nextDot, nextLevel)
  curName.textContent = LEVELS[currentLevel - 1].name
  nextName.textContent = LEVELS[nextLevel - 1].name
}

function updateLadder(fresh = 0): void {
  const maxSeen = Math.max(0, ...seen)
  ladder.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => {
    const lv = Number(el.dataset.level)
    const known = codex.has(lv)
    el.classList.toggle('on', known)
    el.classList.toggle('current', lv === maxSeen)
    el.classList.toggle('fresh', lv === fresh)
    el.style.setProperty('--c', cssColor(lv))
    el.title = known ? LEVELS[lv - 1].name : '未识之珠'
    if (lv === fresh) window.setTimeout(() => el.classList.remove('fresh'), 700)
  })
}

/* ================= 七宝谱 ================= */

/** 谱上小注：每号珠一句，图鉴里显示 */
const CODEX_LORE = [
  '南海之贝，白如霜雪',
  '赤玉生海底，千年一枝',
  '老松凝脂，藏光于内',
  '冰裂如秋水，触之生凉',
  '金箔入琉璃，一照成虹',
  '星屑坠琼枝，紫气自生',
  '月华所凝，可照一室',
]

const codex = new Set<number>()
try {
  const raw: unknown = JSON.parse(localStorage.getItem(CODEX_KEY) ?? '[]')
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (Number.isInteger(v) && v >= 1 && v <= LEVELS.length) codex.add(v as number)
    }
  }
} catch {
  /* 存档损坏就当新谱 */
}

const elCodex = document.getElementById('codex')!
const elCodexList = document.getElementById('codex-list')!
const elCodexCount = document.getElementById('codex-count')!
const elToast = document.getElementById('codex-toast')!

const CODEX_MARK = ['砗', '珊', '蜜', '玉', '琉', '紫', '夜']

function renderCodex(): void {
  elCodexCount.textContent = `已识 ${codex.size} / ${LEVELS.length}`
  elCodexList.innerHTML = ''
  LEVELS.forEach((def, i) => {
    const lv = i + 1
    const known = codex.has(lv)
    const li = document.createElement('li')
    li.className = known ? 'known' : 'unknown'

    const dot = document.createElement('span')
    dot.className = 'c-dot'
    dot.style.background = known
      ? pearlGradient(lv)
      : 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.6), rgba(150,132,108,.7) 70%)'

    const main = document.createElement('div')
    main.className = 'c-main'
    const name = document.createElement('span')
    name.className = 'c-name'
    name.textContent = known ? def.name : '未识之珠'
    const lore = document.createElement('span')
    lore.className = 'c-lore'
    lore.textContent = known ? `${CODEX_LORE[i]} · ${def.score} 分` : '合出此珠，谱上落印'
    main.append(name, lore)

    const mark = document.createElement('span')
    mark.className = 'c-mark'
    mark.textContent = known ? CODEX_MARK[i] : '？'

    li.append(dot, main, mark)
    elCodexList.append(li)
  })
}

let toastTimer = 0
function codexToast(title: string, sub: string): void {
  elToast.innerHTML = ''
  const b = document.createElement('b')
  b.textContent = title
  const i = document.createElement('i')
  i.textContent = sub
  elToast.append(b, i)
  elToast.hidden = false
  // 重播入场动画
  elToast.style.animation = 'none'
  void elToast.offsetWidth
  elToast.style.animation = ''
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    elToast.hidden = true
  }, 2400)
}

/** 初次合出某号珠：记入谱中、落印、磬声 */
function recordPearl(level: number): void {
  if (codex.has(level)) return
  codex.add(level)
  try {
    localStorage.setItem(CODEX_KEY, JSON.stringify([...codex]))
  } catch {
    /* 隐私模式下写不了就算了 */
  }
  sfx.codex(level)
  updateLadder(level)
  codexToast(`初见 · ${LEVELS[level - 1].name}`, `七宝谱 记 ${codex.size} / ${LEVELS.length}`)
  if (codex.size === LEVELS.length) {
    sfx.codexComplete()
    flashScreen()
    window.setTimeout(() => codexToast('七宝齐辉', '七宝谱 · 全'), 900)
  }
}

let codexOpen = false

function openCodex(open: boolean): void {
  codexOpen = open
  if (open) renderCodex()
  elCodex.hidden = !open
}

ladder.addEventListener('click', () => {
  sfx.click()
  openCodex(!codexOpen)
})
document.getElementById('codex-close')!.addEventListener('click', () => {
  sfx.click()
  openCodex(false)
})
elCodex.addEventListener('click', (ev) => {
  if (ev.target === elCodex) openCodex(false)
})
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && codexOpen) openCodex(false)
})

let lastUV = { u: 0.5, v: 0.5 }

/** 罗盘内圈（与 CSS 的 7.5% 留白一致）映射到盒子边界 */
const PANEL_PAD = 0.075

function refreshAim(): void {
  if (!aim.visible) return
  const { x, z, r } = aimWorld(lastUV.u, lastUV.v)
  aim.position.set(x, BOX_CENTER_Y, z)
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

/* ================= 昼夜切换 ================= */

const TIME_KEY = 'lingjian-time'
const timeBtn = document.getElementById('time-toggle')!
const timeIcon = document.getElementById('time-icon')!
const timeLabel = timeBtn.querySelector('i')!

let timeOfDay: TimeOfDay =
  localStorage.getItem(TIME_KEY) === 'day' || localStorage.getItem(TIME_KEY) === 'night'
    ? (localStorage.getItem(TIME_KEY) as TimeOfDay)
    : TIME_OF_DAY

function applyTimeUI(): void {
  const day = timeOfDay === 'day'
  timeIcon.textContent = day ? '☀' : '☾'
  timeLabel.textContent = day ? '日' : '夜'
  timeBtn.classList.toggle('is-day', day)
  timeBtn.setAttribute('aria-label', day ? '切换到秋夜' : '切换到白天')
}

if (timeOfDay !== kit.timeOfDay()) kit.setTimeOfDay(timeOfDay)
applyTimeUI()

timeBtn.addEventListener('click', () => {
  timeOfDay = timeOfDay === 'day' ? 'night' : 'day'
  kit.setTimeOfDay(timeOfDay)
  localStorage.setItem(TIME_KEY, timeOfDay)
  sfx.click()
  applyTimeUI()
})

/* 乐声：起局后循环播放，静音偏好随本地存储 */
const BGM_KEY = 'lingjian-bgm-muted'
const bgm = new Bgm(localStorage.getItem(BGM_KEY) === '1')
const bgmBtn = document.getElementById('bgm-toggle')!
const bgmLabel = bgmBtn.querySelector('i')!

function applyBgmUI(): void {
  const muted = bgm.isMuted()
  bgmLabel.textContent = muted ? '默' : '乐'
  bgmBtn.classList.toggle('is-muted', muted)
  bgmBtn.setAttribute('aria-label', muted ? '开启乐声' : '乐声静音')
}

bgmBtn.addEventListener('click', () => {
  bgm.toggle()
  localStorage.setItem(BGM_KEY, bgm.isMuted() ? '1' : '0')
  sfx.click()
  applyBgmUI()
})
applyBgmUI()

document.getElementById('start')!.addEventListener('click', () => {
  if (started) return
  sfx.start()
  bgm.start()
  intro.classList.add('leaving')
  window.setTimeout(() => {
    intro.classList.add('hidden')
  }, 720)
  // 开场镜头：全景 → 开门 → 入院 → 对准石案；镜头落位后才允许落珠
  kit.playIntro(() => {
    started = true
  })
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

function endGame(reason: EndReason = 'overflow'): void {
  if (gameOver) return
  gameOver = true
  elDanger.classList.remove('on')
  panel.classList.add('disabled')
  elFinalScore.textContent = String(score)
  elFinalBest.textContent = `最高 ${best}`
  // 两种收局：珠满溢出 / 漏刻走空
  const timedOut = reason === 'time'
  elOverKicker.textContent = timedOut ? '漏尽香销' : '珠满则溢'
  elOverTitle.textContent = timedOut ? '收卷' : '匣满'

  // 珠堆化光：先记下位置，再把珠子收走，让光点从原处升起
  const spots = balls.map(
    (b) => new THREE.Vector3(b.body.position.x, b.body.position.y, b.body.position.z),
  )
  for (const b of [...balls]) removeBall(b)
  if (spots.length > 0) kit.fx.ascend(spots)

  // 留一点时间看光点升空，再展开卷轴
  window.setTimeout(() => {
    over.hidden = false
    // 卷轴尺寸此时才可测量，按实际画幅重画底纹，避免月亮/印章被拉变形
    drawInkScroll(endArt)
    requestAnimationFrame(() => over.classList.add('show'))
    sfx.gameOver()
  }, 1150)
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
  resetTimer()
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
  const span = 2 * BOX_HALF_XZ
  const toPxX = (wx: number) => pad + ((wx + BOX_HALF_XZ) / span) * inner
  const toPxY = (wz: number) => pad + ((wz + BOX_HALF_XZ) / span) * inner
  const toPxR = (r: number) => (r / BOX_HALF_XZ) * (inner / 2)

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
    const lim = BOX_HALF_XZ - r + 0.08
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
    const floorY = BOX_CENTER_Y - BOX_HALF + r - 0.08
    if (p.y < floorY) {
      p.y = floorY
      if (v.y < 0) v.y = 0
    }
    const ceilY = BOX_CENTER_Y + BOX_HALF + WALL_EXTRA - r + 0.08
    if (p.y > ceilY) {
      p.y = ceilY
      if (v.y > 0) v.y = 0
    }
    if (p.y < BOX_CENTER_Y - BOX_HALF - 2 || Math.abs(p.x) > BOX_HALF_XZ + 2 || Math.abs(p.z) > BOX_HALF_XZ + 2) {
      const lim2 = BOX_HALF_XZ - r - 0.03
      p.x = THREE.MathUtils.clamp(p.x, -lim2, lim2)
      p.z = THREE.MathUtils.clamp(p.z, -lim2, lim2)
      p.y = BOX_CENTER_Y + BOX_HALF + r + 0.4
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
  tickTimer(dt)
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
    endGame,
    get levelStats() {
      return balls.reduce<Record<number, number>>((m, b) => {
        m[b.level] = (m[b.level] ?? 0) + 1
        return m
      }, {})
    },
    get state() {
      return { score, best, started, gameOver, overflowTimer, timeLeft }
    },
    /** 把漏刻拨到指定剩余秒数（默认走空），用于验证收局与警示态 */
    expireTime(left = 0.001) {
      timeLeft = left
    },
  }
}

elBest.textContent = `最高 ${best}`
elScore.textContent = '0'
resetTimer()
initQueue()
updateLadder()

intro.hidden = false
tick()

/* 首帧已上屏：淡出加载幕，避免把半成品界面露给用户 */
const boot = document.getElementById('boot')
if (boot) {
  window.setTimeout(() => {
    boot.classList.add('done')
    window.setTimeout(() => boot.remove(), 700)
  }, 150)
}
