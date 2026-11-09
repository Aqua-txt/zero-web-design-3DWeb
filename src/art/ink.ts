/**
 * 「匣满」卷轴的水墨山水底纹。
 * 主画面用 src/assets/ink-scroll.png（远山、飞鸟、红日、小舟），按卷轴实际画幅「宽度铺满、垂直居中」绘制；
 * 图片还没解码完时先用 Canvas 现画的淡墨山脊兜底，解码完成后自动重画。
 */
import inkScrollUrl from '../assets/ink-scroll.png'

const painting = new Image()
let paintingReady = false
const pending = new Set<HTMLCanvasElement>()

painting.addEventListener('load', () => {
  paintingReady = true
  for (const canvas of pending) drawInkScroll(canvas)
  pending.clear()
})
painting.src = inkScrollUrl

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Ridge {
  baseY: number
  amp: number
  alpha: number
  color: string
  seed: number
}

const RIDGES: Ridge[] = [
  { baseY: 0.46, amp: 0.13, alpha: 0.15, color: '#3b4a52', seed: 11 },
  { baseY: 0.56, amp: 0.1, alpha: 0.23, color: '#2f3b42', seed: 29 },
  { baseY: 0.66, amp: 0.075, alpha: 0.33, color: '#22292e', seed: 47 },
]

export function drawInkScroll(canvas: HTMLCanvasElement): void {
  const w = Math.max(160, Math.round(canvas.clientWidth || 420))
  const h = Math.max(140, Math.round(canvas.clientHeight || 300))
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (paintingReady) {
    drawPainting(ctx, w, h)
    return
  }
  pending.add(canvas)
  drawFallback(ctx, w, h)
}

/** 主底纹：宣纸底 + 水墨山水（按宽度铺满、垂直居中，两侧不留白也不裁掉小船与红日） */
function drawPainting(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const paper = ctx.createLinearGradient(0, 0, 0, h)
  paper.addColorStop(0, '#f4eddd')
  paper.addColorStop(1, '#e9dec7')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)

  const scale = w / painting.naturalWidth
  const drawH = painting.naturalHeight * scale
  ctx.globalAlpha = 0.96
  ctx.drawImage(painting, 0, (h - drawH) / 2, w, drawH)
  ctx.globalAlpha = 1

  // 中间压一层宣纸雾：正中提亮最重，边缘留白最轻，正文压在水墨上也读得清
  const halo = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    0,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.66,
  )
  halo.addColorStop(0, 'rgba(248,242,229,0.62)')
  halo.addColorStop(0.5, 'rgba(248,242,229,0.36)')
  halo.addColorStop(1, 'rgba(248,242,229,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)

  const veil = ctx.createLinearGradient(0, 0, 0, h)
  veil.addColorStop(0, 'rgba(246,239,225,0.45)')
  veil.addColorStop(0.35, 'rgba(246,239,225,0.1)')
  veil.addColorStop(0.65, 'rgba(246,239,225,0.1)')
  veil.addColorStop(1, 'rgba(246,239,225,0.45)')
  ctx.fillStyle = veil
  ctx.fillRect(0, 0, w, h)
}

/** 兜底底纹：纯 Canvas 现画的淡墨山脊 + 淡月 + 树影 + 朱印 */
function drawFallback(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 笔触粗细、月与印按短边缩放，任何画幅比例下都不变形
  const s = Math.min(w, h) / 420

  // 宣纸底
  const paper = ctx.createLinearGradient(0, 0, 0, h)
  paper.addColorStop(0, '#f3ecda')
  paper.addColorStop(0.55, '#efe5d1')
  paper.addColorStop(1, '#e7dcc4')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)

  // 淡淡的纸纤维
  const rnd = mulberry32(20261109)
  ctx.globalAlpha = 0.05
  ctx.strokeStyle = '#8a7452'
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w
    const y = rnd() * h
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rnd() - 0.5) * 26 * s, y + (rnd() - 0.5) * 6 * s)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 一轮淡月
  const moonX = w * 0.845
  const moonY = h * 0.2
  const moonR = 44 * s
  const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.3, moonX, moonY, moonR * 2.6)
  halo.addColorStop(0, 'rgba(255,246,214,0.55)')
  halo.addColorStop(1, 'rgba(255,246,214,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(moonX, moonY, moonR * 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(252,246,226,0.9)'
  ctx.beginPath()
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,104,80,0.25)'
  ctx.lineWidth = 1.4 * s
  ctx.stroke()

  // 层叠远山
  for (const ridge of RIDGES) {
    const r2 = mulberry32(ridge.seed)
    const baseY = h * ridge.baseY
    const pts: Array<[number, number]> = []
    const steps = 7
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w
      const peak = baseY - Math.sin((i / steps) * Math.PI * 1.15 + 0.4) * h * ridge.amp * (0.55 + r2() * 0.8)
      pts.push([x, peak])
    }

    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1]
      const [cx, cy] = pts[i]
      ctx.quadraticCurveTo((px + cx) / 2, (py + cy) / 2 - h * 0.02, cx, cy)
    }
    ctx.lineTo(w, h)
    ctx.closePath()

    const wash = ctx.createLinearGradient(0, baseY - h * ridge.amp, 0, h * 0.92)
    wash.addColorStop(0, `${ridge.color}${Math.round(ridge.alpha * 255).toString(16).padStart(2, '0')}`)
    wash.addColorStop(1, 'rgba(240,232,216,0)')
    ctx.fillStyle = wash
    ctx.fill()

    // 山脊线
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1]
      const [cx, cy] = pts[i]
      ctx.quadraticCurveTo((px + cx) / 2, (py + cy) / 2 - h * 0.02, cx, cy)
    }
    ctx.strokeStyle = `${ridge.color}${Math.round(Math.min(0.5, ridge.alpha * 2.2) * 255)
      .toString(16)
      .padStart(2, '0')}`
    ctx.lineWidth = 1.6 * s
    ctx.stroke()
  }

  // 云气：几条横向留白
  for (let i = 0; i < 4; i++) {
    const y = h * (0.5 + i * 0.09)
    const mist = ctx.createLinearGradient(0, y - 22 * s, 0, y + 22 * s)
    mist.addColorStop(0, 'rgba(243,236,218,0)')
    mist.addColorStop(0.5, 'rgba(246,240,226,0.72)')
    mist.addColorStop(1, 'rgba(243,236,218,0)')
    ctx.fillStyle = mist
    ctx.fillRect(0, y - 22 * s, w, 44 * s)
  }

  // 近处水岸与树影
  ctx.fillStyle = 'rgba(40,48,52,0.14)'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.86)
  ctx.bezierCurveTo(w * 0.3, h * 0.8, w * 0.62, h * 0.9, w, h * 0.83)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  const treeX = w * 0.16
  ctx.strokeStyle = 'rgba(38,34,28,0.55)'
  ctx.lineWidth = 3.2 * s
  ctx.beginPath()
  ctx.moveTo(treeX, h * 0.86)
  ctx.quadraticCurveTo(treeX - 16 * s, h * 0.76, treeX + 6 * s, h * 0.68)
  ctx.stroke()
  ctx.lineWidth = 2 * s
  for (const [dx, up, len] of [
    [-26, 0.71, 22],
    [22, 0.7, 20],
    [-12, 0.66, 18],
    [16, 0.64, 16],
  ] as Array<[number, number, number]>) {
    const ux = dx * s
    ctx.beginPath()
    ctx.moveTo(treeX + ux * 0.15, h * up - 8 * s)
    ctx.quadraticCurveTo(treeX + ux * 0.6, h * up - 18 * s, treeX + ux, h * up - len * s)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(38,34,28,0.5)'
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2
    const rr = (18 + rnd() * 34) * s
    ctx.beginPath()
    ctx.ellipse(
      treeX + Math.cos(a) * rr,
      h * 0.66 + Math.sin(a) * rr * 0.5,
      (7 + rnd() * 7) * s,
      (3 + rnd() * 3) * s,
      a,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  // 朱印（落在可见区域内，避免被卷轴上下留白吃掉）
  const seal = 46 * s
  const sealX = w - seal - 34 * s
  const sealY = h * 0.8
  ctx.fillStyle = 'rgba(150,44,34,0.82)'
  ctx.fillRect(sealX, sealY, seal, seal)
  ctx.fillStyle = 'rgba(247,232,205,0.92)'
  ctx.font = `${Math.round(26 * s)}px "STKaiti","KaiTi","Microsoft YaHei",serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('叠', sealX + seal / 2, sealY + seal / 2)
}
