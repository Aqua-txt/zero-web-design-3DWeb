/** 正方体容器内壁边长（盒中心位于世界原点）；7 号球半径 2.0 = 0.3 × 边长 */
export const BOX_SIZE = 2 / 0.3
export const BOX_HALF = BOX_SIZE / 2

/**
 * 侧向物理墙高出盒顶的部分（隐形，防止球弹出后飞走）。
 * 需容纳最高生成点（3 号球顶部）：BOX_HALF + 2×0.74 + DROP_LIFT + 余量。
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

/** 最高分 localStorage key */
export const BEST_KEY = 'watermelon3d-best'
/** 两枚 7 号球相消的奖励分 */
export const MAX_MERGE_SCORE = 100

export interface LevelDef {
  /** 球体半径（世界单位） */
  radius: number
  /** 材质颜色 */
  color: number
  /** 合成产生本号球时的得分 */
  score: number
  name: string
}

/** 1~7 号球，由小到大；score 表示「两个 (n-1) 号合成出本号球」时得分 */
export const LEVELS: LevelDef[] = [
  { radius: 0.45, color: 0xff4d6d, score: 2, name: '樱桃' },
  { radius: 0.58, color: 0xff9f43, score: 4, name: '橘子' },
  { radius: 0.74, color: 0xffd93d, score: 6, name: '柠檬' },
  { radius: 0.95, color: 0x2ed573, score: 9, name: '青果' },
  { radius: 1.22, color: 0x32a9ff, score: 12, name: '蓝莓' },
  { radius: 1.56, color: 0x9b6dff, score: 16, name: '葡萄' },
  { radius: 2.0, color: 0xff6bb5, score: 20, name: '西瓜' },
]

/** 等级颜色转 CSS 十六进制 */
export function cssColor(level: number): string {
  return `#${LEVELS[level - 1].color.toString(16).padStart(6, '0')}`
}
