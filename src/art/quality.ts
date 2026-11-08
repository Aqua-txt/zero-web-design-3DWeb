/** 画质分级：材质透光、阴影、Bloom 与粒子数量都从这里取。 */
export type QualityTier = 'high' | 'medium' | 'low'

export interface QualitySettings {
  tier: QualityTier
  dpr: number
  shadows: boolean
  shadowMap: number
  bloom: boolean
  transmission: boolean
  particles: number
}

const STORAGE_KEY = 'lingjian-quality'

export function detectQuality(): QualityTier {
  const forced = localStorage.getItem(STORAGE_KEY)
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8

  if (coarse || cores <= 4 || memory <= 4) return 'medium'
  return 'high'
}

export function qualitySettings(tier: QualityTier): QualitySettings {
  if (tier === 'high') {
    return {
      tier,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      shadows: true,
      shadowMap: 2048,
      bloom: true,
      transmission: true,
      particles: 120,
    }
  }
  if (tier === 'medium') {
    return {
      tier,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      shadows: true,
      shadowMap: 1024,
      bloom: false,
      transmission: false,
      particles: 64,
    }
  }
  return {
    tier,
    dpr: 1,
    shadows: false,
    shadowMap: 512,
    bloom: false,
    transmission: false,
    particles: 24,
  }
}
