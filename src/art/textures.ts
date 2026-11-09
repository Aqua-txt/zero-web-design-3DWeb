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

/** 高度图 → 法线图（Sobel 近似）；wrap=true 时按平铺取样，边缘不会留接缝 */
function heightToNormal(height: HTMLCanvasElement, strength: number, wrap = false): THREE.CanvasTexture {
  const w = height.width
  const h = height.height
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)
  const wrapIndex = (v: number, n: number): number => ((v % n) + n) % n

  const lum = (x: number, y: number): number => {
    const cx = wrap ? wrapIndex(x, w) : Math.max(0, Math.min(w - 1, x))
    const cy = wrap ? wrapIndex(y, h) : Math.max(0, Math.min(h - 1, y))
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

/* ------------------------------------------------------------------ */
/* 屏风墨山                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 石面浮雕法线：可平铺的花岗岩颗粒 + 錾纹                              */
/* ------------------------------------------------------------------ */

let stoneNormalBase: THREE.CanvasTexture | null = null
const stoneNormalCache = new Map<number, THREE.CanvasTexture>()

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** 周期值噪声：格点按 px / py 回绕，所以整张图天然可平铺 */
function periodicNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = x - xi
  const ty = y - yi
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const x0 = ((xi % px) + px) % px
  const y0 = ((yi % py) + py) % py
  const x1 = (x0 + 1) % px
  const y1 = (y0 + 1) % py
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x1, y0, seed)
  const n01 = hash2(x0, y1, seed)
  const n11 = hash2(x1, y1, seed)
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy
}

const STONE_OCTAVES: ReadonlyArray<readonly [number, number]> = [
  [4, 0.5],
  [8, 0.26],
  [16, 0.14],
  [32, 0.08],
]

function buildStoneNormal(): THREE.CanvasTexture {
  const size = 256
  const canvas = makeCanvas(size)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      for (const [cells, amp] of STONE_OCTAVES) {
        const f = cells / size
        h += periodicNoise(x * f, y * f, cells, cells, cells * 7 + 11) * amp
      }
      // 錾纹：横向拉长的细凿痕，叠在颗粒之上
      const chisel = periodicNoise(x * (6 / size), y * (48 / size), 6, 48, 913) * 0.3
      const v = Math.round(Math.min(1, h * 0.72 + chisel) * 255)
      const i = (y * size + x) * 4
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return heightToNormal(canvas, 0.022, true)
}

/**
 * 石面浮雕法线贴图。repeat 决定纹路密度：小件（石狮）用大值，
 * 大面积台基用小值，避免同一张图在不同尺寸上被拉伸。
 */
export function stoneReliefNormal(repeat = 1): THREE.CanvasTexture {
  const key = Math.round(repeat * 10) / 10
  const hit = stoneNormalCache.get(key)
  if (hit) return hit

  if (!stoneNormalBase) stoneNormalBase = buildStoneNormal()
  const tex = stoneNormalBase.clone()
  tex.repeat.set(key, key)
  tex.needsUpdate = true
  stoneNormalCache.set(key, tex)
  return tex
}

