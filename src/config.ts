/** 正方体容器内壁边长（盒中心位于世界原点）；7 号珠半径 2.0 = 0.3 × 边长 */
export const BOX_SIZE = 2 / 0.3
export const BOX_HALF = BOX_SIZE / 2

/**
 * 侧向物理墙高出盒顶的部分（隐形，防止球弹出后飞走）。
 * 需容纳最高生成点（3 号珠顶部）：BOX_HALF + 2×0.74 + DROP_LIFT + 余量。
 */
export const WALL_EXTRA = 2.0
/** 物理墙厚度（加厚可显著降低高速碰撞穿透墙体的概率） */
export const WALL_T = 2

/** 球生成时高于盒顶上表面的抬升量 */
export const DROP_LIFT = 0.15
/** 两次落球的最小间隔（秒） */
export const DROP_COOLDOWN = 0.55
/** 新球出生缩放动画时长（秒） */
export const BIRTH = 0.38

/** 最高分 localStorage key（同时兼容旧版键名） */
export const BEST_KEY = 'lingjian-diezhu-best'
export const LEGACY_BEST_KEY = 'watermelon3d-best'

/** 场景时段：'night' 秋夜 / 'day' 白天 */
export type TimeOfDay = 'night' | 'day'
/** 当前时段（切换白天/夜晚只改这一处） */
export const TIME_OF_DAY: TimeOfDay = 'day'
/** 两枚 7 号珠相消的奖励分 */
export const MAX_MERGE_SCORE = 100

/** 匣满判定：珠心高出盒顶此值，并持续 OVERFLOW_HOLD 秒 */
export const OVERFLOW_Y = BOX_HALF + 0.12
export const OVERFLOW_HOLD = 1.6
/** 落珠后多久才参与匣满判定（避免把正在下落的珠子算作溢出） */
export const OVERFLOW_GRACE = 1.2

/** 一局时辰：两分钟香尽即收卷 */
export const ROUND_SECONDS = 120
/** 剩余时间进入此值后，漏刻转为朱红闪烁 */
export const ROUND_WARN = 30
/** 最后十秒：屏幕四周泛红晕，并每秒一声催更的木鱼 */
export const DANGER_SECONDS = 10

export type PearlKind = 'conch' | 'coral' | 'amber' | 'jade' | 'glass' | 'amethyst' | 'night'

export interface LevelDef {
  /** 球体半径（世界单位） */
  radius: number
  /** 材质颜色 */
  color: number
  /** 光晕 / 俯视图辉光颜色 */
  glow: number
  /** 合成产生本号球时的得分 */
  score: number
  name: string
  /** 视觉材质类型 */
  kind: PearlKind
}

/** 1~7 号珠，由小到大；score 表示「两个 (n-1) 号合成出本号球」时得分 */
export const LEVELS: LevelDef[] = [
  { radius: 0.45, color: 0xf2e8d5, glow: 0xfff6e0, score: 2, name: '砗磲珠', kind: 'conch' },
  { radius: 0.58, color: 0xc4402e, glow: 0xff8a6b, score: 4, name: '珊瑚珠', kind: 'coral' },
  { radius: 0.74, color: 0xd89b3e, glow: 0xffc465, score: 6, name: '蜜蜡珠', kind: 'amber' },
  { radius: 0.95, color: 0x3f8a6b, glow: 0x7be0b0, score: 9, name: '青玉珠', kind: 'jade' },
  { radius: 1.22, color: 0x2d6ea6, glow: 0x7fc4ff, score: 12, name: '琉璃珠', kind: 'glass' },
  { radius: 1.56, color: 0x7b4ea3, glow: 0xc9a0ff, score: 16, name: '紫晶珠', kind: 'amethyst' },
  { radius: 2.0, color: 0xf6efc4, glow: 0xffe9a8, score: 20, name: '夜明珠', kind: 'night' },
]

/** 等级颜色转 CSS 十六进制 */
export function cssColor(level: number): string {
  return `#${LEVELS[level - 1].color.toString(16).padStart(6, '0')}`
}

/** 等级辉光颜色转 CSS 十六进制 */
export function cssGlow(level: number): string {
  return `#${LEVELS[level - 1].glow.toString(16).padStart(6, '0')}`
}
