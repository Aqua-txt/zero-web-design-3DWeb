import * as THREE from 'three'
import { mulberry32 } from './noise.ts'

/* ------------------------------------------------------------------ */
/* Canvas 工具                                                         */
/* ------------------------------------------------------------------ */

function makeCanvas(w: number, h = w): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function toTexture(canvas: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 4
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** 高度图 → 法线图（Sobel 近似） */
function heightToNormal(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = height.width
  const h = height.height
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)

  const lum = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(w - 1, x))
    const cy = Math.max(0, Math.min(h - 1, y))
    return src[(cy * w + cx) * 4]
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength
      let nx = -dx
      let ny = dy
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * w + x) * 4
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255)
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      img.data[i + 3] = 255
    }
  }

  octx.putImageData(img, 0, 0)
  return toTexture(out, false)
}

/* ------------------------------------------------------------------ */
/* 木纹                                                                */
/* ------------------------------------------------------------------ */

let woodTex: THREE.CanvasTexture | null = null

export function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex

  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(20261108)

  const base = ctx.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#4b2e1f')
  base.addColorStop(0.42, '#5c3a28')
  base.addColorStop(0.72, '#4d3022')
  base.addColorStop(1, '#382216')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 280; i++) {
    const px = rnd() * size
    const amp = 2 + rnd() * 9
    const phase = rnd() * Math.PI * 2
    const light = rnd() > 0.62
    ctx.strokeStyle = light
      ? `rgba(166,104,66,${(0.04 + rnd() * 0.13).toFixed(3)})`
      : `rgba(10,6,4,${(0.06 + rnd() * 0.18).toFixed(3)})`
    ctx.lineWidth = 0.5 + rnd() * 2.1
    ctx.beginPath()
    for (let y = -12; y <= size + 12; y += 8) {
      const x = px + Math.sin(y * 0.012 + phase) * amp + Math.sin(y * 0.043 + phase * 2) * amp * 0.25
      if (y === -12) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  for (let k = 0; k < 6; k++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const rx = 6 + rnd() * 18
    const ry = rx * (0.35 + rnd() * 0.4)
    const rot = rnd() * Math.PI
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot)
    for (let ring = 0; ring < 5; ring++) {
      ctx.beginPath()
      ctx.ellipse(0, 0, rx + ring * 3.2, ry + ring * 2.4, 0, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(8,5,4,${0.18 - ring * 0.025})`
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.restore()
  }

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.72)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, size, size)

  woodTex = toTexture(canvas, true)
  return woodTex
}

/* ------------------------------------------------------------------ */
/* 绢纱                                                                */
/* ------------------------------------------------------------------ */

let silkTex: THREE.CanvasTexture | null = null

export function silkTexture(): THREE.CanvasTexture {
  if (silkTex) return silkTex

  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(7021)

  ctx.fillStyle = '#d9c9a9'
  ctx.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y += 3) {
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.03})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(size, y + 0.5)
    ctx.stroke()
  }
  for (let x = 0; x < size; x += 3) {
    ctx.strokeStyle = `rgba(90,70,50,${0.03 + rnd() * 0.04})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, size)
    ctx.stroke()
  }

  for (let i = 0; i < 1200; i++) {
    const a = rnd() * 0.05
    ctx.fillStyle = `rgba(60,40,28,${a.toFixed(3)})`
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1)
  }

  silkTex = toTexture(canvas, true)
  return silkTex
}

let silkGlowTex: THREE.CanvasTexture | null = null

/** 绢面自发光渐变：上暗下亮，像灯从笼底透上来 */
export function silkGlowTexture(): THREE.CanvasTexture {
  if (silkGlowTex) return silkGlowTex
  const w = 256
  const h = 256
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#120a05')
  g.addColorStop(0.45, '#4a2a14')
  g.addColorStop(0.78, '#c58a4e')
  g.addColorStop(1, '#ffe2b0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const side = ctx.createLinearGradient(0, 0, w, 0)
  side.addColorStop(0, 'rgba(0,0,0,0.55)')
  side.addColorStop(0.5, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = side
  ctx.fillRect(0, 0, w, h)

  silkGlowTex = toTexture(canvas, true)
  return silkGlowTex
}

/* ------------------------------------------------------------------ */
/* 冰裂纹法线                                                          */
/* ------------------------------------------------------------------ */

let iceNormal: THREE.CanvasTexture | null = null

export function iceCrackNormal(): THREE.CanvasTexture {
  if (iceNormal) return iceNormal

  const size = 512
  const height = makeCanvas(size)
  const ctx = height.getContext('2d')!
  const rnd = mulberry32(31415)

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const drawCrack = (x: number, y: number, angle: number, segments: number, width: number): void => {
    ctx.beginPath()
    ctx.moveTo(x, y)
    let px = x
    let py = y
    let a = angle
    for (let i = 0; i < segments; i++) {
      a += (rnd() - 0.5) * 0.9
      const len = 8 + rnd() * 26
      px += Math.cos(a) * len
      py += Math.sin(a) * len
      ctx.lineTo(px, py)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.82)'
    ctx.lineWidth = width
    ctx.stroke()
  }

  for (let i = 0; i < 26; i++) {
    const edge = Math.floor(rnd() * 4)
    let x = 0
    let y = 0
    if (edge === 0) {
      x = rnd() * size
      y = -4
    } else if (edge === 1) {
      x = size + 4
      y = rnd() * size
    } else if (edge === 2) {
      x = rnd() * size
      y = size + 4
    } else {
      x = -4
      y = rnd() * size
    }
    const toward = Math.atan2(size / 2 - y, size / 2 - x) + (rnd() - 0.5) * 1.2
    drawCrack(x, y, toward, 6 + Math.floor(rnd() * 10), 1 + rnd() * 1.8)
  }

  ctx.filter = 'blur(1px)'
  ctx.drawImage(height, 0, 0)
  ctx.filter = 'none'

  iceNormal = heightToNormal(height, 0.055)
  return iceNormal
}

/* ------------------------------------------------------------------ */
/* 蜜蜡流纹（自发光贴图）                                              */
/* ------------------------------------------------------------------ */

let amberTex: THREE.CanvasTexture | null = null

export function amberFlowTexture(): THREE.CanvasTexture {
  if (amberTex) return amberTex

  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(9091)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 46; i++) {
    const y0 = rnd() * size
    const amp = 6 + rnd() * 22
    const phase = rnd() * Math.PI * 2
    ctx.beginPath()
    for (let x = 0; x <= size; x += 4) {
      const y = y0 + Math.sin(x * 0.025 + phase) * amp + Math.sin(x * 0.07 + phase * 2) * amp * 0.2
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(255,196,96,${(0.04 + rnd() * 0.1).toFixed(3)})`
    ctx.lineWidth = 1 + rnd() * 3
    ctx.stroke()
  }

  amberTex = toTexture(canvas, true)
  return amberTex
}

/* ------------------------------------------------------------------ */
/* 金箔星点（金属度贴图）                                              */
/* ------------------------------------------------------------------ */

let fleckTex: THREE.CanvasTexture | null = null

export function goldFleckTexture(): THREE.CanvasTexture {
  if (fleckTex) return fleckTex

  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(6060)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 420; i++) {
    const a = 0.25 + rnd() * 0.75
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    const s = rnd() > 0.88 ? 2.4 : 1
    ctx.fillRect(rnd() * size, rnd() * size, s, s)
  }

  fleckTex = toTexture(canvas, false)
  return fleckTex
}

/* ------------------------------------------------------------------ */
/* 棂影光斑（案面加法贴图）                                            */
/* ------------------------------------------------------------------ */

let goboTex: THREE.CanvasTexture | null = null

export function goboTexture(): THREE.CanvasTexture {
  if (goboTex) return goboTex

  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(8888)
  const cx = size / 2
  const cy = size / 2

  ctx.clearRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const outer: Array<[number, number]> = []
  const inner: Array<[number, number]> = []
  const R = 168
  for (let i = 0; i <= 160; i++) {
    const t = (i / 160) * Math.PI * 2
    const r = R * (1 + 0.14 * Math.cos(4 * t))
    outer.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r])
    inner.push([cx + Math.cos(t) * r * 0.9, cy + Math.sin(t) * r * 0.9])
  }

  ctx.shadowColor = 'rgba(255,196,120,0.9)'
  ctx.shadowBlur = 22
  ctx.strokeStyle = 'rgba(255,214,150,0.95)'
  ctx.lineWidth = 5
  ctx.beginPath()
  outer.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.stroke()

  ctx.shadowBlur = 14
  ctx.lineWidth = 2
  ctx.beginPath()
  inner.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,206,142,0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(22, 22, size - 44, size - 44)

  ctx.strokeStyle = 'rgba(255,206,142,0.62)'
  ctx.lineWidth = 2
  const corners: Array<[number, number, number]> = [
    [50, 50, 0.5],
    [size - 50, 50, Math.PI - 0.5],
    [50, size - 50, -0.5],
    [size - 50, size - 50, Math.PI + 0.5],
  ]
  for (const [x, y, base] of corners) {
    for (let k = 0; k < 3; k++) {
      const a = base + (rnd() - 0.5) * 1.4
      const len = 40 + rnd() * 70
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
  }

  const soft = ctx.createRadialGradient(cx, cy, 20, cx, cy, 220)
  soft.addColorStop(0, 'rgba(255,190,110,0.20)')
  soft.addColorStop(0.6, 'rgba(255,170,90,0.06)')
  soft.addColorStop(1, 'rgba(255,150,70,0)')
  ctx.fillStyle = soft
  ctx.fillRect(0, 0, size, size)

  goboTex = toTexture(canvas, true)
  return goboTex
}

/* ------------------------------------------------------------------ */
/* 屏风墨山                                                            */
/* ------------------------------------------------------------------ */

let inkTex: THREE.CanvasTexture | null = null

export function inkScreenTexture(): THREE.CanvasTexture {
  if (inkTex) return inkTex

  const w = 1024
  const h = 512
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(1919)
  ctx.fillStyle = 'rgba(42, 54, 66, 0.88)'
  ctx.fillRect(0, 0, w, h)

  const paper = ctx.createLinearGradient(0, 0, 0, h)
  paper.addColorStop(0, 'rgba(88, 108, 124, 0.34)')
  paper.addColorStop(0.55, 'rgba(52, 68, 82, 0.22)')
  paper.addColorStop(1, 'rgba(28, 38, 48, 0.4)')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)

  const moon = ctx.createRadialGradient(760, 124, 6, 760, 124, 94)
  moon.addColorStop(0, 'rgba(226,238,245,0.55)')
  moon.addColorStop(0.35, 'rgba(190,214,226,0.22)')
  moon.addColorStop(1, 'rgba(150,180,200,0)')
  ctx.fillStyle = moon
  ctx.beginPath()
  ctx.arc(760, 124, 94, 0, Math.PI * 2)
  ctx.fill()

  const layers = [
    { base: 330, amp: 88, color: '26,38,48', alpha: 0.55, blur: 9 },
    { base: 382, amp: 70, color: '20,30,38', alpha: 0.68, blur: 6 },
    { base: 430, amp: 52, color: '14,22,28', alpha: 0.85, blur: 2 },
  ]

  for (const layer of layers) {
    ctx.save()
    ctx.filter = `blur(${layer.blur}px)`
    ctx.fillStyle = `rgba(${layer.color},${layer.alpha})`
    ctx.beginPath()
    ctx.moveTo(-20, h)
    const points: Array<[number, number]> = []
    let x = -20
    while (x < w + 40) {
      const y = layer.base - Math.abs(Math.sin(x * 0.006 + rnd() * 0.4)) * layer.amp - rnd() * 22
      points.push([x, y])
      x += 40 + rnd() * 70
    }
    for (const [px, py] of points) ctx.lineTo(px, py)
    ctx.lineTo(w + 20, h)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  for (let i = 0; i < 5; i++) {
    const y = 300 + i * 38 + rnd() * 12
    const mist = ctx.createLinearGradient(0, y - 20, 0, y + 26)
    mist.addColorStop(0, 'rgba(210,224,230,0)')
    mist.addColorStop(0.5, `rgba(210,224,230,${0.05 + rnd() * 0.04})`)
    mist.addColorStop(1, 'rgba(210,224,230,0)')
    ctx.fillStyle = mist
    ctx.fillRect(0, y - 20, w, 46)
  }

  inkTex = toTexture(canvas, true)
  return inkTex
}

/* ------------------------------------------------------------------ */
/* 光晕 / 浮尘 / 花瓣 Sprite                                            */
/* ------------------------------------------------------------------ */

let glowTex: THREE.CanvasTexture | null = null

export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const size = 128
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,248,224,1)')
  g.addColorStop(0.18, 'rgba(255,226,160,0.85)')
  g.addColorStop(0.48, 'rgba(255,190,110,0.28)')
  g.addColorStop(1, 'rgba(255,170,80,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTex = toTexture(canvas, true)
  return glowTex
}

let dustTex: THREE.CanvasTexture | null = null

export function dustTexture(): THREE.CanvasTexture {
  if (dustTex) return dustTex
  const size = 32
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,240,210,0.95)')
  g.addColorStop(0.4, 'rgba(255,226,170,0.35)')
  g.addColorStop(1, 'rgba(255,210,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  dustTex = toTexture(canvas, true)
  return dustTex
}

let petalTex: THREE.CanvasTexture | null = null

export function petalTexture(): THREE.CanvasTexture {
  if (petalTex) return petalTex
  const size = 64
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.translate(size / 2, size / 2)
  ctx.rotate(-0.35)
  const g = ctx.createLinearGradient(-18, 0, 18, 0)
  g.addColorStop(0, 'rgba(255,190,150,0.95)')
  g.addColorStop(0.55, 'rgba(255,226,186,0.98)')
  g.addColorStop(1, 'rgba(224,150,120,0.85)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  petalTex = toTexture(canvas, true)
  return petalTex
}

let backdropTex: THREE.CanvasTexture | null = null

/** 远景底幕：上冷下暖的一层墨色，避免纯黑空洞 */
export function backdropTexture(): THREE.CanvasTexture {
  if (backdropTex) return backdropTex
  const w = 1024
  const h = 512
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!

  const base = ctx.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#060c12')
  base.addColorStop(0.5, '#04080d')
  base.addColorStop(1, '#030508')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  const cool = ctx.createRadialGradient(w * 0.76, h * 0.28, 10, w * 0.76, h * 0.28, w * 0.34)
  cool.addColorStop(0, 'rgba(96, 140, 172, 0.14)')
  cool.addColorStop(0.45, 'rgba(58, 92, 118, 0.06)')
  cool.addColorStop(1, 'rgba(20, 40, 60, 0)')
  ctx.fillStyle = cool
  ctx.fillRect(0, 0, w, h)

  const warm = ctx.createRadialGradient(w * 0.42, h * 0.86, 10, w * 0.42, h * 0.86, w * 0.4)
  warm.addColorStop(0, 'rgba(86, 55, 30, 0.04)')
  warm.addColorStop(0.5, 'rgba(52, 32, 18, 0.015)')
  warm.addColorStop(1, 'rgba(10, 8, 6, 0)')
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, w, h)

  backdropTex = toTexture(canvas, true)
  return backdropTex
}

let moonTex: THREE.CanvasTexture | null = null

/** 月洞窗里的月轮：冷白到透明的径向光 */
export function moonTexture(): THREE.CanvasTexture {
  if (moonTex) return moonTex
  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(246, 251, 255, 1)')
  g.addColorStop(0.22, 'rgba(226, 241, 252, 0.96)')
  g.addColorStop(0.5, 'rgba(178, 210, 232, 0.48)')
  g.addColorStop(0.78, 'rgba(120, 160, 190, 0.14)')
  g.addColorStop(1, 'rgba(60, 90, 120, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  moonTex = toTexture(canvas, true)
  return moonTex
}

/* ------------------------------------------------------------------ */
/* 秋日庭院：石板、粉墙、树皮、枫叶、天空                                */
/* ------------------------------------------------------------------ */

let stoneTex: THREE.CanvasTexture | null = null

/** 整块石面：石桌、石凳、石灯用，细密斑驳 */
export function stoneTexture(): THREE.CanvasTexture {
  if (stoneTex) return stoneTex
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(6120)

  const base = ctx.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#b2aa9b')
  base.addColorStop(0.45, '#a69d8e')
  base.addColorStop(1, '#948b7d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 70; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 12 + rnd() * 70
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = rnd() > 0.45
    spot.addColorStop(0, dark ? 'rgba(90,82,70,0.12)' : 'rgba(240,232,214,0.12)')
    spot.addColorStop(1, 'rgba(120,110,96,0)')
    ctx.fillStyle = spot
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  for (let i = 0; i < 3500; i++) {
    const v = 60 + rnd() * 150
    ctx.fillStyle = `rgba(${v}, ${v - 6}, ${v - 18}, ${0.03 + rnd() * 0.07})`
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1)
  }

  for (let i = 0; i < 26; i++) {
    let x = rnd() * size
    let y = rnd() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 3; k++) {
      x += (rnd() - 0.5) * 26
      y += 8 + rnd() * 16
      ctx.lineTo(x, y)
    }
    ctx.strokeStyle = 'rgba(80, 72, 60, 0.12)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  stoneTex = toTexture(canvas, true)
  return stoneTex
}

let paverTex: THREE.CanvasTexture | null = null

export function stonePaversTexture(): THREE.CanvasTexture {
  if (paverTex) return paverTex
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(4401)

  ctx.fillStyle = '#655f54'
  ctx.fillRect(0, 0, size, size)

  let y = -12
  while (y < size + 20) {
    const h = 42 + rnd() * 34
    let x = -rnd() * 90
    while (x < size + 20) {
      const w = 56 + rnd() * 92
      const v = 132 + rnd() * 46
      ctx.fillStyle = `rgb(${v}, ${v - 9}, ${v - 23})`
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6)
      ctx.strokeStyle = 'rgba(255,246,226,0.13)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7)
      ctx.strokeStyle = 'rgba(54,48,40,0.5)'
      ctx.lineWidth = 3
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
      x += w
    }
    y += h
  }

  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(${60 + rnd() * 50}, ${70 + rnd() * 60}, ${40 + rnd() * 30}, ${0.03 + rnd() * 0.07})`
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  for (let i = 0; i < 9; i++) {
    const x = rnd() * size
    const yy = rnd() * size
    const r = 18 + rnd() * 50
    const moss = ctx.createRadialGradient(x, yy, 0, x, yy, r)
    moss.addColorStop(0, 'rgba(92, 110, 62, 0.24)')
    moss.addColorStop(1, 'rgba(80, 100, 56, 0)')
    ctx.fillStyle = moss
    ctx.fillRect(x - r, yy - r, r * 2, r * 2)
  }

  paverTex = toTexture(canvas, true)
  return paverTex
}

let plasterTex: THREE.CanvasTexture | null = null

export function plasterTexture(): THREE.CanvasTexture {
  if (plasterTex) return plasterTex
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(7733)

  const base = ctx.createLinearGradient(0, 0, 0, size)
  base.addColorStop(0, '#efe6d3')
  base.addColorStop(0.62, '#e6dbc4')
  base.addColorStop(1, '#cbbda4')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 26; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 24 + rnd() * 90
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r)
    stain.addColorStop(0, `rgba(${120 + rnd() * 30}, ${108 + rnd() * 24}, ${84 + rnd() * 20}, 0.06)`)
    stain.addColorStop(1, 'rgba(120, 108, 84, 0)')
    ctx.fillStyle = stain
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  for (let i = 0; i < 16; i++) {
    let x = rnd() * size
    let y = rnd() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 42
      y += 12 + rnd() * 34
      ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(105, 92, 72, ${0.08 + rnd() * 0.08})`
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  const damp = ctx.createLinearGradient(0, size * 0.72, 0, size)
  damp.addColorStop(0, 'rgba(112, 104, 84, 0)')
  damp.addColorStop(1, 'rgba(92, 84, 66, 0.22)')
  ctx.fillStyle = damp
  ctx.fillRect(0, size * 0.72, size, size * 0.28)

  plasterTex = toTexture(canvas, true)
  return plasterTex
}

let barkTex: THREE.CanvasTexture | null = null

export function barkTexture(): THREE.CanvasTexture {
  if (barkTex) return barkTex
  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(3399)

  ctx.fillStyle = '#4a372a'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size
    const w = 1 + rnd() * 5
    const light = rnd() > 0.55
    ctx.strokeStyle = light
      ? `rgba(126, 100, 72, ${0.06 + rnd() * 0.12})`
      : `rgba(22, 16, 12, ${0.08 + rnd() * 0.2})`
    ctx.lineWidth = w
    ctx.beginPath()
    for (let y = -10; y < size + 10; y += 10) {
      ctx.lineTo(x + Math.sin(y * 0.05 + i) * 4, y)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = 'rgba(18, 12, 9, 0.4)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(rnd() * size, rnd() * size, 4 + rnd() * 10, 9 + rnd() * 16, rnd(), 0, Math.PI * 2)
    ctx.stroke()
  }

  barkTex = toTexture(canvas, true)
  return barkTex
}

let leafSpriteTex: THREE.CanvasTexture | null = null

/** 单叶（白底，靠实例色染成红/橙/黄/绿） */
export function leafSpriteTexture(): THREE.CanvasTexture {
  if (leafSpriteTex) return leafSpriteTex
  const size = 64
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  ctx.beginPath()
  ctx.moveTo(32, 5)
  ctx.bezierCurveTo(54, 16, 58, 41, 32, 60)
  ctx.bezierCurveTo(6, 41, 10, 16, 32, 5)
  ctx.closePath()
  const g = ctx.createLinearGradient(20, 10, 44, 58)
  g.addColorStop(0, '#fff3d8')
  g.addColorStop(1, '#e8cba0')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,250,236,0.75)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.strokeStyle = 'rgba(150, 118, 78, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(32, 9)
  ctx.lineTo(32, 56)
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const y = 20 + i * 10
    ctx.beginPath()
    ctx.moveTo(32, y)
    ctx.lineTo(20 + i * 2, y - 6)
    ctx.moveTo(32, y)
    ctx.lineTo(44 - i * 2, y - 6)
    ctx.stroke()
  }

  leafSpriteTex = toTexture(canvas, true)
  leafSpriteTex.wrapS = THREE.ClampToEdgeWrapping
  leafSpriteTex.wrapT = THREE.ClampToEdgeWrapping
  return leafSpriteTex
}

let leafClusterTex: THREE.CanvasTexture | null = null

/** 树冠叶簇：透明底 + 多枚秋叶 */
export function leafClusterTexture(): THREE.CanvasTexture {
  if (leafClusterTex) return leafClusterTex
  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(8181)
  ctx.clearRect(0, 0, size, size)

  const palette = ['#b8452a', '#cf5c2e', '#df7c33', '#e2a33f', '#c23a28', '#9f3426']
  for (let i = 0; i < 64; i++) {
    const x = 24 + rnd() * (size - 48)
    const y = 24 + rnd() * (size - 48)
    const r = 10 + rnd() * 16
    const rot = rnd() * Math.PI * 2
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(1, 0.55 + rnd() * 0.25)
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.bezierCurveTo(r * 0.85, -r * 0.35, r * 0.7, r * 0.6, 0, r)
    ctx.bezierCurveTo(-r * 0.7, r * 0.6, -r * 0.85, -r * 0.35, 0, -r)
    ctx.closePath()
    ctx.fillStyle = palette[Math.floor(rnd() * palette.length)]
    ctx.globalAlpha = 0.82 + rnd() * 0.18
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()
  }

  ctx.strokeStyle = 'rgba(80, 48, 28, 0.45)'
  ctx.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.moveTo(30 + rnd() * 40, 30 + rnd() * 40)
    ctx.lineTo(120 + rnd() * 100, 100 + rnd() * 110)
    ctx.stroke()
  }

  leafClusterTex = toTexture(canvas, true)
  leafClusterTex.wrapS = THREE.ClampToEdgeWrapping
  leafClusterTex.wrapT = THREE.ClampToEdgeWrapping
  return leafClusterTex
}

let skyTex: THREE.CanvasTexture | null = null

/** 秋日天空：上蓝下暖，靠近地平线有薄云 */
export function skyTexture(): THREE.CanvasTexture {
  if (skyTex) return skyTex
  const w = 1024
  const h = 512
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(5151)

  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#78a9ce')
  sky.addColorStop(0.34, '#9ec6de')
  sky.addColorStop(0.62, '#d7e6ea')
  sky.addColorStop(0.8, '#f4e7ce')
  sky.addColorStop(1, '#f7e3c1')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const sun = ctx.createRadialGradient(w * 0.26, h * 0.28, 4, w * 0.26, h * 0.28, w * 0.34)
  sun.addColorStop(0, 'rgba(255, 247, 219, 0.95)')
  sun.addColorStop(0.1, 'rgba(255, 238, 190, 0.55)')
  sun.addColorStop(0.45, 'rgba(255, 226, 176, 0.12)')
  sun.addColorStop(1, 'rgba(255, 220, 170, 0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.filter = 'blur(18px)'
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w
    const y = h * 0.18 + rnd() * h * 0.34
    const cw = 90 + rnd() * 190
    const ch = 12 + rnd() * 24
    ctx.fillStyle = `rgba(255, 250, 240, ${0.1 + rnd() * 0.16})`
    ctx.beginPath()
    ctx.ellipse(x, y, cw, ch, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  const haze = ctx.createLinearGradient(0, h * 0.62, 0, h)
  haze.addColorStop(0, 'rgba(255, 235, 205, 0)')
  haze.addColorStop(1, 'rgba(255, 226, 186, 0.5)')
  ctx.fillStyle = haze
  ctx.fillRect(0, h * 0.62, w, h * 0.38)

  skyTex = toTexture(canvas, true)
  skyTex.wrapT = THREE.ClampToEdgeWrapping
  return skyTex
}

let blobTex: THREE.CanvasTexture | null = null

/** 柔和接触影：树、桌、器物的落影底 */
export function blobShadowTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex
  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0, 0, 0, 0.62)')
  g.addColorStop(0.35, 'rgba(0, 0, 0, 0.4)')
  g.addColorStop(0.7, 'rgba(0, 0, 0, 0.14)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  blobTex = toTexture(canvas, true)
  return blobTex
}

let dappleTex: THREE.CanvasTexture | null = null

/** 树影斑驳：叠在石桌/地面上的一层柔和暗斑 */
export function dappleTexture(): THREE.CanvasTexture {
  if (dappleTex) return dappleTex
  const size = 512
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(2020)
  ctx.clearRect(0, 0, size, size)
  ctx.filter = 'blur(9px)'
  for (let i = 0; i < 70; i++) {
    const x = 40 + rnd() * (size - 80)
    const y = 40 + rnd() * (size - 80)
    const r = 14 + rnd() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(22, 16, 10, ${0.24 + rnd() * 0.3})`)
    g.addColorStop(0.65, 'rgba(22, 16, 10, 0.12)')
    g.addColorStop(1, 'rgba(22, 16, 10, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.filter = 'none'
  dappleTex = toTexture(canvas, true)
  dappleTex.wrapS = THREE.ClampToEdgeWrapping
  dappleTex.wrapT = THREE.ClampToEdgeWrapping
  return dappleTex
}

let plaqueTex: THREE.CanvasTexture | null = null

/** 墙上木匾：竖排「叠珠」 */
export function plaqueTexture(): THREE.CanvasTexture {
  if (plaqueTex) return plaqueTex
  const w = 256
  const h = 512
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(7788)

  ctx.fillStyle = '#2e1c12'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(${110 + rnd() * 40}, ${72 + rnd() * 24}, ${42 + rnd() * 16}, ${0.05 + rnd() * 0.1})`
    ctx.lineWidth = 0.8 + rnd() * 2
    ctx.beginPath()
    const x = rnd() * w
    for (let y = 0; y < h; y += 12) ctx.lineTo(x + Math.sin(y * 0.03 + i) * 3, y)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(201, 160, 99, 0.75)'
  ctx.lineWidth = 5
  ctx.strokeRect(14, 14, w - 28, h - 28)
  ctx.strokeStyle = 'rgba(201, 160, 99, 0.28)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(24, 24, w - 48, h - 48)

  ctx.fillStyle = '#e6c98e'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 118px KaiTi, STKaiti, "Songti SC", serif'
  ctx.fillText('叠', w / 2, 170)
  ctx.fillText('珠', w / 2, 320)

  ctx.fillStyle = '#b23a2e'
  ctx.fillRect(w / 2 - 18, 408, 36, 36)
  ctx.fillStyle = '#f7e6c4'
  ctx.font = 'bold 22px KaiTi, STKaiti, serif'
  ctx.fillText('印', w / 2, 427)

  plaqueTex = toTexture(canvas, true)
  plaqueTex.wrapS = THREE.ClampToEdgeWrapping
  plaqueTex.wrapT = THREE.ClampToEdgeWrapping
  return plaqueTex
}

/** 生成带重复次数的木纹副本（桌面用） */
export function repeatedWood(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = woodTexture().clone()
  tex.needsUpdate = true
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  return tex
}

/** 供调试或小尺寸场景使用：柔和圆角遮罩 */
export function softCircleTexture(color: string): THREE.CanvasTexture {
  const size = 128
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return toTexture(canvas, true)
}

/** 给程序化贴图留一个统一入口，方便后续替换 */
export function textureSummary(): string {
  const items = [
    ['wood', woodTexture()],
    ['silk', silkTexture()],
    ['ice', iceCrackNormal()],
    ['amber', amberFlowTexture()],
    ['fleck', goldFleckTexture()],
    ['gobo', goboTexture()],
    ['ink', inkScreenTexture()],
  ] as const
  return items.map(([name, tex]) => `${name}:${tex.image.width}x${tex.image.height}`).join(' ')
}
