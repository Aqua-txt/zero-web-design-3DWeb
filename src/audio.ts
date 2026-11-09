/**
 * WebAudio 合成音色：木鱼落珠、磬音合成、编钟化光。
 * 零音频资产；首次用户手势后惰性创建 AudioContext。
 */
export class Sfx {
  private ctx: AudioContext | null = null

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private blip(
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(f0, 1), t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private noiseBurst(dur: number, vol: number, delay = 0): void {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const frames = Math.floor(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1600
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.value = vol
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start(t)
    src.stop(t + dur)
  }

  /** 落珠：木鱼 / 棋子落盘 */
  drop(): void {
    this.blip(190, 82, 0.11, 0.14, 'triangle')
    this.noiseBurst(0.045, 0.05)
  }

  /** 合成：磬音，五声音阶随等级升高 */
  merge(level: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66]
    const f = scale[Math.min(level - 1, scale.length - 1)]
    this.blip(f, f * 0.995, 1.1, 0.13, 'sine')
    this.blip(f * 2.01, f * 2.0, 0.8, 0.05, 'sine', 0.01)
    this.blip(f * 2.98, f * 2.96, 0.5, 0.025, 'triangle', 0.02)
    this.noiseBurst(0.06, 0.02)
  }

  /** 双珠化光：编钟 + 铜锣 */
  maxMerge(): void {
    this.merge(7)
    this.blip(98, 96, 2.4, 0.16, 'sine')
    this.blip(196, 194, 1.8, 0.08, 'sine', 0.02)
    this.blip(659.25, 658, 2.0, 0.07, 'triangle', 0.05)
    this.blip(1046.5, 1044, 1.6, 0.05, 'sine', 0.08)
    this.noiseBurst(0.3, 0.05)
  }

  /** 匣满：下行三音 */
  gameOver(): void {
    this.blip(392, 196, 0.7, 0.1, 'triangle')
    this.blip(329.63, 164.81, 0.8, 0.08, 'triangle', 0.18)
    this.blip(261.63, 130.81, 1.1, 0.08, 'sine', 0.36)
  }

  /** 漏刻将尽：一声短促木鱼，最后三秒更急更高 */
  warn(secondsLeft: number): void {
    const urgent = secondsLeft <= 3
    const f = urgent ? 1180 : 940
    this.blip(f, f * 0.7, 0.085, urgent ? 0.1 : 0.062, 'triangle')
    this.noiseBurst(0.03, urgent ? 0.038 : 0.02)
  }

  /** UI：纸木轻响 */
  click(): void {
    this.blip(880, 660, 0.04, 0.035, 'triangle')
  }

  /** 七宝谱：初识一枚珠，一声清磬（等级越高越亮） */
  codex(level: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.51]
    const f = scale[Math.min(level - 1, scale.length - 1)]
    this.blip(f, f * 0.998, 1.4, 0.09, 'sine')
    this.blip(f * 2, f * 1.998, 0.9, 0.035, 'sine', 0.02)
    this.noiseBurst(0.05, 0.014)
  }

  /** 七宝集齐：一串上行音 + 低音托底 */
  codexComplete(): void {
    for (const [i, f] of [523.25, 659.25, 783.99, 1046.5, 1318.51].entries()) {
      this.blip(f, f, 1.2, 0.07, 'sine', i * 0.11)
    }
    this.blip(98, 96, 2.2, 0.1, 'sine')
    this.blip(261.63, 261, 2.0, 0.05, 'triangle', 0.05)
  }

  /** 起局：一声磬 */
  start(): void {
    this.merge(4)
  }
}
