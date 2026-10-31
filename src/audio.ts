/**
 * 极简 WebAudio 合成音效：不依赖任何音频资产文件。
 * 首次用户手势后惰性创建 AudioContext（浏览器自动播放策略要求）。
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

  /** 单个滑音短音 */
  private blip(f0: number, f1: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(f0, 1), t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.03)
  }

  /** 落球：低频闷响 */
  drop(): void {
    this.blip(230, 80, 0.13, 0.16, 'triangle')
  }

  /** 合成：等级越高音调越高，双音叠加更"弹" */
  merge(level: number): void {
    const f = 240 + level * 60
    this.blip(f, f * 2.3, 0.16, 0.2, 'sine')
    this.blip(f * 1.5, f * 3.1, 0.12, 0.08, 'triangle')
  }

  /** 两枚 7 号西瓜相消：上扬琶音 */
  maxMerge(): void {
    this.merge(7)
    this.blip(520, 1560, 0.34, 0.13, 'square')
  }
}
