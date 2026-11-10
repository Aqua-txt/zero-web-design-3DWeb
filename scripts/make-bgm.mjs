/**
 * 离线编曲：国风轻快 BGM《棂间叠珠》。
 * Karplus-Strong 拨弦（古筝质感）+ 木鱼/磬音（配方同 src/audio.ts）+ 低音铺底，
 * 五声音阶（C 宫），48 小节 @100BPM ≈ 115 秒，尾部余音折回开头实现无缝循环。
 * 零依赖，输出 WAV 后由 ffmpeg 转 mp3。
 * 用法：node scripts/make-bgm.mjs
 */
import { writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SR = 44100
const BPM = 100
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 48
const LOOP = Math.round(BARS * BAR * SR)
const TAIL = 5 * SR

/** 固定随机种子，保证每次渲染结果一致 */
let seed = 0x2c9f1b
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}

const N = {
  C2: 65.41, G2: 98.0, A2: 110.0,
  C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
}

/* ---------------- 合成引擎 ---------------- */

/** Karplus-Strong 拨弦：噪声激励 + 延迟线低通反馈 */
function pluck(freq, dur, vel, damp, bright) {
  const detune = 1 + (rand() - 0.5) * 0.003
  const f = freq * detune
  const len = Math.ceil(dur * SR)
  const D = Math.max(2, Math.round(SR / f))
  const dl = new Float32Array(D)
  let lp = 0
  for (let i = 0; i < D; i++) {
    const w = rand() * 2 - 1
    lp = 0.72 * lp + 0.28 * w
    dl[i] = bright * w + (1 - bright) * lp
  }
  const out = new Float32Array(len)
  let idx = 0
  for (let n = 0; n < len; n++) {
    const cur = dl[idx]
    const nxt = dl[(idx + 1) % D]
    out[n] = cur
    dl[idx] = damp * 0.5 * (cur + nxt)
    idx = (idx + 1) % D
  }
  // 收尾淡出 + 3ms 起音防咔哒
  const fade = Math.floor(len * 0.3)
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade
  const a = Math.min(132, len)
  for (let i = 0; i < a; i++) out[i] *= i / a
  for (let i = 0; i < len; i++) out[i] *= vel
  return out
}

/** 三角波滑音 + 包络（木鱼等打击体），配方源自 src/audio.ts Sfx.blip */
function blip(f0, f1, dur, vol) {
  const len = Math.ceil(dur * SR)
  const out = new Float32Array(len)
  let phase = 0
  for (let i = 0; i < len; i++) {
    const t = i / len
    const f = f0 * Math.pow(f1 / f0, t)
    phase += (2 * Math.PI * f) / SR
    const tri = Math.asin(Math.sin(phase)) * (2 / Math.PI)
    const env = Math.min(1, i / 353) * Math.pow(1 - t, 2.2)
    out[i] = tri * env * vol
  }
  return out
}

/** 带通噪声爆（木鱼敲击感），配方源自 src/audio.ts Sfx.noiseBurst */
function noiseBurst(dur, vol, band) {
  const len = Math.ceil(dur * SR)
  const w = new Float32Array(len)
  for (let i = 0; i < len; i++) w[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 2)
  // RBJ 带通（峰值增益）
  const f = band / (SR / 2)
  const Q = 1.2
  const omega = (2 * Math.PI * Math.min(0.99, f))
  const cs = Math.cos(omega)
  const alpha = Math.sin(omega) / (2 * Q)
  const b0 = alpha
  const b2 = -alpha
  const a0 = 1 + alpha
  const a1 = -2 * cs
  const a2 = 1 - alpha
  const out = new Float32Array(len)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < len; i++) {
    const x0 = w[i]
    const y0 = (b0 / a0) * x0 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    out[i] = y0 * vol
  }
  return out
}

/** 磬音：非谐波分音叠加，配方源自 src/audio.ts Sfx.merge */
function chime(freq, dur, vol) {
  const len = Math.ceil(dur * SR)
  const out = new Float32Array(len)
  const parts = [
    [1.0, 0.55, 1.0], [2.01, 0.22, 0.72], [2.98, 0.11, 0.45], [4.16, 0.05, 0.3],
  ]
  for (const [ratio, amp, decay] of parts) {
    const ph = rand() * 2 * Math.PI
    for (let i = 0; i < len; i++) {
      const t = i / SR
      out[i] += Math.sin(2 * Math.PI * freq * ratio * t + ph) * amp * Math.exp(-t / (decay * dur * 0.4))
    }
  }
  for (let i = 0; i < len; i++) out[i] *= vol
  return out
}

/** 木鱼：低音体 + 高频敲击 */
function muyu(vol, high = false) {
  const a = high ? blip(940, 660, 0.085, vol) : blip(190, 82, 0.11, vol)
  const b = noiseBurst(high ? 0.03 : 0.045, vol * 0.45, 1600)
  const len = Math.max(a.length, b.length)
  const out = new Float32Array(len)
  for (let i = 0; i < a.length; i++) out[i] += a[i]
  for (let i = 0; i < b.length; i++) out[i] += b[i]
  return out
}

/* ---------------- 编曲数据 ---------------- */

const bar = (notes) => notes // [[音名, 时值(拍)], ...]，'R' 为休止

const M = {
  // A 段主题（4 小节一句）
  p1: [
    bar([['E4', 0.5], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['E4', 1], ['G4', 1]]),
    bar([['D4', 0.5], ['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['D4', 1], ['R', 1]]),
    bar([['E4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 0.5], ['D5', 1], ['C5', 1]]),
    bar([['A4', 1], ['G4', 0.5], ['E4', 0.5], ['G4', 1], ['R', 1]]),
  ],
  p2: [
    bar([['G4', 0.5], ['E4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 1], ['D4', 1]]),
    bar([['E4', 0.5], ['G4', 0.5], ['E4', 0.5], ['D4', 0.5], ['C4', 1], ['A3', 1]]),
    bar([['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 1]]),
    bar([['E4', 1.5], ['D4', 0.5], ['C4', 1], ['R', 1]]),
  ],
  p3: [
    bar([['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 0.5], ['G4', 1], ['A4', 1]]),
    bar([['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 1], ['A4', 1]]),
    bar([['G4', 0.5], ['A4', 0.5], ['C5', 0.5], ['A4', 0.5], ['G4', 1], ['E4', 1]]),
    bar([['D4', 1], ['E4', 1], ['G4', 1], ['R', 1]]),
  ],
  // B 段：十六分上行花指 + 应答
  b1: bar([['C5', 0.25], ['D5', 0.25], ['E5', 0.25], ['G5', 0.25], ['A5', 0.5], ['G5', 0.5], ['E5', 1], ['D5', 1]]),
  b2: bar([['C5', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 1], ['R', 1]]),
  b3: bar([['A4', 0.25], ['C5', 0.25], ['D5', 0.25], ['E5', 0.25], ['G5', 0.5], ['E5', 0.5], ['D5', 1], ['C5', 1]]),
  b4: bar([['D5', 0.5], ['C5', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 1], ['R', 1]]),
  b5: bar([['A5', 0.25], ['G5', 0.25], ['E5', 0.25], ['D5', 0.25], ['C5', 0.5], ['D5', 0.5], ['E5', 1], ['G5', 1]]),
  b6: bar([['A5', 1], ['G5', 0.5], ['E5', 0.5], ['D5', 1], ['C5', 1]]),
  b7: bar([['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 1], ['G5', 1]]),
  b8: bar([['A5', 1.5], ['G5', 0.5], ['E5', 1], ['D5', 1]]),
}

/** 48 小节旋律表：null 为纯伴奏小节 */
const MELODY = [
  // 引子 0-3
  bar([['E4', 1], ['G4', 1], ['R', 2]]),
  bar([['A4', 1], ['G4', 1], ['R', 2]]),
  bar([['E4', 0.5], ['D4', 0.5], ['C4', 1], ['R', 2]]),
  null,
  // A 段 4-15
  ...M.p1, ...M.p2, ...M.p3,
  // B 段 16-27
  M.b1, M.b2, M.b3, M.b4, M.b5, M.b6, M.b7, M.b8,
  M.b1, M.b2, M.b3,
  bar([['G4', 0.5], ['E4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 1], ['R', 1]]),
  // A' 段 28-39
  ...M.p1,
  bar([['A4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['D5', 1], ['C5', 1]]),
  bar([['D5', 0.5], ['C5', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 1], ['C5', 1]]),
  bar([['G4', 0.5], ['E4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 1], ['E4', 1]]),
  bar([['D4', 1], ['C4', 1], ['D4', 1], ['R', 1]]),
  bar([['E4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 1]]),
  bar([['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 1], ['G4', 1]]),
  bar([['A3', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['G4', 1], ['E4', 1]]),
  bar([['C4', 2], ['R', 2]]),
  // 尾声 40-47：主题回声渐隐
  bar([['G4', 1], ['E4', 1], ['R', 2]]),
  bar([['A4', 1], ['G4', 1], ['R', 2]]),
  bar([['E4', 1], ['D4', 1], ['R', 2]]),
  bar([['C4', 2], ['R', 2]]),
  null, null,
  bar([['E4', 0.5], ['G4', 0.5], ['A4', 0.5], ['C5', 0.5], ['R', 2]]),
  null,
]

/** 每小节低音根音（null = 休止） */
const BASS = [
  'C2', null, 'G2', null,
  'C2', 'C2', 'G2', 'G2', 'A2', 'A2', 'C2', 'C2', 'C2', 'C2', 'G2', 'G2',
  'C2', 'C2', 'G2', 'G2', 'A2', 'A2', 'C2', 'C2', 'C2', 'C2', 'G2', 'G2',
  'C2', 'C2', 'G2', 'G2', 'A2', 'A2', 'G2', 'C2', 'C2', 'C2', 'C2', 'C2',
  'C2', 'A2', 'G2', 'C2', null, null, null, 'C2',
]

/** 琶音和弦音（按根音） */
const ARP = {
  C: ['C3', 'G3', 'C4', 'E4'],
  G: ['G3', 'C4', 'D4', 'G4'],
  A: ['A3', 'C4', 'E4', 'A4'],
}
const rootOf = { C2: 'C', G2: 'G', A2: 'A' }

/* ---------------- 事件混音 ---------------- */

const dryL = new Float64Array(LOOP + TAIL)
const dryR = new Float64Array(LOOP + TAIL)
/** pan ∈ [-1,1]；混响在总线上统一做（revSend 暂未按声部区分） */
function addEvent(tSec, buf, pan) {
  const start = Math.round(tSec * SR)
  const gl = Math.SQRT1_2 * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = Math.SQRT1_2 * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < buf.length; i++) {
    const j = start + i
    if (j >= dryL.length) break
    dryL[j] += buf[i] * gl
    dryR[j] += buf[i] * gr
  }
}

const inSec = (b, beat = 0, extra = 0) => b * BAR + beat * BEAT + extra

// —— 旋律 ——
MELODY.forEach((notes, b) => {
  if (!notes) return
  const intro = b < 4
  const outro = b >= 40
  const baseVel = intro ? 0.3 : outro ? 0.34 : 0.5
  let beat = 0
  for (const [name, dur] of notes) {
    if (name !== 'R') {
      const accent = beat % 4 === 0 ? 1.12 : 1
      const run = dur <= 0.25 ? 0.94 : 1
      const octUp = name.endsWith('5') ? 1.03 : 1
      addEvent(inSec(b, beat), pluck(N[name], 2.2, baseVel * accent * run * octUp, 0.9968, 0.34), 0.12)
    }
    beat += dur
  }
})

// —— 低音 ——
BASS.forEach((name, b) => {
  if (!name) return
  const vel = b >= 40 && b < 47 ? 0.3 : 0.34
  addEvent(inSec(b), pluck(N[name], 2.6, vel, 0.9973, 0.12), 0)
  // 换和弦小节第 3 拍补一个五度，增加行进感
  if (b >= 4 && b < 40 && b % 2 === 1) {
    const fifth = name === 'C2' ? 'G2' : name === 'A2' ? 'E3' : 'D3'
    addEvent(inSec(b, 2), pluck(N[fifth], 2.0, vel * 0.55, 0.997, 0.12), 0)
  }
})

// —— 琶音伴奏 ——
BASS.forEach((name, b) => {
  const inArp =
    (b >= 1 && b <= 3 && b % 2 === 1) ||
    (b >= 4 && b <= 39) ||
    (b >= 40 && b <= 43)
  if (!name || !inArp) return
  const tones = ARP[rootOf[name]]
  const vel = b < 4 ? 0.11 : b >= 40 ? 0.12 : 0.15
  tones.forEach((t, i) => {
    addEvent(inSec(b, 0, i * 0.07), pluck(N[t], 1.6, vel, 0.9955, 0.4), -0.22)
  })
  // 奇数小节第 3 拍一个短琶音，营造轻快步进
  if (b >= 4 && b < 40 && b % 2 === 1) {
    tones.slice(1).forEach((t, i) => {
      addEvent(inSec(b, 2, i * 0.06), pluck(N[t], 1.2, vel * 0.8, 0.9955, 0.4), -0.22)
    })
  }
})

// —— 木鱼律动 ——
for (let b = 0; b < BARS; b++) {
  if (b < 2) continue
  if (b <= 3) {
    addEvent(inSec(b), muyu(0.06), -0.05)
    continue
  }
  if (b >= 44) continue
  if (b >= 40) {
    addEvent(inSec(b), muyu(0.07), -0.05)
    continue
  }
  const inB = b >= 16 && b <= 27
  const inAprime = b >= 28
  addEvent(inSec(b, 0), muyu(inB ? 0.1 : 0.085), -0.05)
  addEvent(inSec(b, 2), muyu(inB ? 0.1 : 0.085), -0.05)
  if (inB || inAprime) {
    addEvent(inSec(b, 1), muyu(0.05, true), -0.05)
    addEvent(inSec(b, 3), muyu(0.05, true), -0.05)
    if (inB && b % 2 === 0) addEvent(inSec(b, 3.5), muyu(0.04, true), -0.05)
  } else if (b >= 8) {
    addEvent(inSec(b, 2.5), muyu(0.045, true), -0.05)
  }
}

// —— 磬音点缀（小节 0/16/28/47，尾部余音折回引子）——
for (const [b, note, vol] of [[0, 'C5', 0.1], [16, 'G5', 0.09], [28, 'C5', 0.09], [47, 'C5', 0.11]]) {
  addEvent(inSec(b), chime(N[note], 5.5, vol), 0.25)
}

// —— 扫弦（段落转折 16/28 小节）——
for (const b of [16, 28]) {
  ;['C4', 'D4', 'E4', 'G4', 'A4', 'C5'].forEach((t, i) => {
    addEvent(inSec(b, 0, i * 0.035), pluck(N[t], 1.2, 0.19, 0.996, 0.36), 0.18)
  })
}

/* ---------------- 混响（Schroeder）+ 折回无缝循环 ---------------- */

function comb(input, D, g) {
  const out = new Float64Array(input.length)
  const dl = new Float64Array(D)
  let idx = 0
  for (let n = 0; n < input.length; n++) {
    const y = input[n] + g * dl[idx]
    dl[idx] = y
    out[n] = y
    idx = (idx + 1) % D
  }
  return out
}

function allpass(input, D, g) {
  const out = new Float64Array(input.length)
  const dx = new Float64Array(D)
  const dy = new Float64Array(D)
  let idx = 0
  for (let n = 0; n < input.length; n++) {
    const y = -g * input[n] + dx[idx] + g * dy[idx]
    dx[idx] = input[n]
    dy[idx] = y
    out[n] = y
    idx = (idx + 1) % D
  }
  return out
}

function reverb(input, spread) {
  const combs = [1116 + spread, 1187, 1277 + spread, 1356]
  let wet = new Float64Array(input.length)
  for (const d of combs) {
    const c = comb(input, d, 0.84)
    for (let i = 0; i < wet.length; i++) wet[i] += c[i]
  }
  for (let i = 0; i < wet.length; i++) wet[i] *= 0.25
  wet = allpass(wet, 556 + spread, 0.5)
  wet = allpass(wet, 441, 0.5)
  return wet
}

console.log('渲染混响…')
const sendL = new Float64Array(LOOP + TAIL)
const sendR = new Float64Array(LOOP + TAIL)
for (let i = 0; i < sendL.length; i++) {
  sendL[i] = dryL[i] * 0.42
  sendR[i] = dryR[i] * 0.42
}
const wetL = reverb(sendL, 0)
const wetR = reverb(sendR, 23)
for (let i = 0; i < dryL.length; i++) {
  dryL[i] += wetL[i] * 0.55
  dryR[i] += wetR[i] * 0.55
}

// 折回：尾部余音叠加到循环开头
console.log('折回循环…')
const outL = new Float64Array(LOOP)
const outR = new Float64Array(LOOP)
for (let i = 0; i < dryL.length; i++) {
  outL[i % LOOP] += dryL[i]
  outR[i % LOOP] += dryR[i]
}

// 直流阻断 + 峰值归一化
for (const ch of [outL, outR]) {
  let px = 0, py = 0
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i]
    ch[i] = x - px + 0.995 * py
    px = x
    py = ch[i]
  }
}
let peak = 0
for (const ch of [outL, outR]) for (const v of ch) peak = Math.max(peak, Math.abs(v))
const norm = 0.82 / peak
for (const ch of [outL, outR]) for (let i = 0; i < ch.length; i++) ch[i] *= norm

// RMS 报告
let sumSq = 0
for (let i = 0; i < LOOP; i++) sumSq += (outL[i] + outR[i]) * (outL[i] + outR[i]) / 4
const rms = Math.sqrt(sumSq / LOOP)
console.log(`峰值 ${(20 * Math.log10(peak * norm)).toFixed(1)} dBFS，RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS`)

/* ---------------- 写 WAV → ffmpeg 转 mp3 ---------------- */

const wavPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bgm-tmp.wav')
const mp3Path = path.resolve(fileURLToPath(import.meta.url), '../../public/bgm.mp3')

const data = Buffer.alloc(LOOP * 4)
for (let i = 0; i < LOOP; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outL[i] * 32767))), i * 4)
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outR[i] * 32767))), i * 4 + 2)
}
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(2, 22) // 立体声
header.writeUInt32LE(SR, 24)
header.writeUInt32LE(SR * 4, 28)
header.writeUInt16LE(4, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)
writeFileSync(wavPath, Buffer.concat([header, data]))

console.log('ffmpeg 转 mp3…')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath,
  '-codec:a', 'libmp3lame', '-qscale:a', '3', mp3Path], { stdio: 'inherit' })
unlinkSync(wavPath)

console.log(`完成：${mp3Path}（${(LOOP / SR).toFixed(1)} 秒循环）`)
