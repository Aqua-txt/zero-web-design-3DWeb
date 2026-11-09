/**
 * 「桌案 + 棂笼」整套装置的缩放基准（球体尺寸不随它变化）。
 * 1 = 原始尺寸；调大 = 容器更宽敞、更不容易匣满，但珠子还是那么大。
 */
export const RIG_SCALE = 1.15

/** 棂笼内壁边长 = 设计基准 2/0.3 乘以装置缩放 */
export const BOX_SIZE = (2 / 0.3) * RIG_SCALE
export const BOX_HALF = BOX_SIZE / 2

/**
 * 须弥座厚度：lantern.ts 里 foot 的底沿在盒底之下 0.50（0.42 中心 + 0.08 半高），
 * 乘装置缩放后就是桌面到盒底的距离。改了须弥座造型这里要同步。
 */
export const PLINTH_H = 0.5 * RIG_SCALE
/** 桌面高度：石案一组与棂笼共用这个基准 */
export const TABLE_TOP = -3.85
/**
 * 盒心高度：让须弥座底面正好落在桌面上（盒底 = 盒心 - BOX_HALF，
 * 再往下 PLINTH_H 就是桌面）。装置放大后棂笼向上长，桌子不动。
 */
export const BOX_CENTER_Y = TABLE_TOP + PLINTH_H + BOX_HALF

/**
 * 平面再微调（1 = 与高度同比例）。需要让盒子比高略宽/略窄时改这一处。
 */
export const BOX_PLAN = 1
/** 盒内水平半宽（x / z）；竖直仍是 BOX_HALF */
export const BOX_HALF_XZ = BOX_HALF * BOX_PLAN

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
/** 七宝谱（已识宝珠）的 localStorage key */
export const CODEX_KEY = 'lingjian-codex'

/** 场景时段：'night' 秋夜 / 'day' 白天 */
export type TimeOfDay = 'night' | 'day'
/** 当前时段（切换白天/夜晚只改这一处） */
export const TIME_OF_DAY: TimeOfDay = 'day'
/** 两枚 7 号珠相消的奖励分 */
export const MAX_MERGE_SCORE = 100

/** 匣满判定：珠心高出盒顶此值，并持续 OVERFLOW_HOLD 秒 */
export const OVERFLOW_Y = BOX_CENTER_Y + BOX_HALF + 0.12
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
