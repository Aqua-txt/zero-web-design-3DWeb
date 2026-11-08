/** 全局色板：3D、Canvas 俯视图、CSS 变量共用同一套颜色。 */
export const C = {
  night: 0x070a0f,
  ink: 0x0d141b,
  haze: 0x16232e,
  paper: 0xefe6d2,
  moon: 0xe9e2d0,
  vermilion: 0xb23a2e,
  rouge: 0x8e2f3c,
  azurite: 0x2f5d7c,
  jade: 0x3e7a63,
  gamboge: 0xd9a441,
  gold: 0xc9a063,
  rosewood: 0x2a1913,
  bronze: 0x8c6a3f,
  silk: 0xd9c9a9,
  jadeSlab: 0x2f6b5a,
} as const

/** CSS 用字符串色值 */
export const CSS = {
  night: '#070a0f',
  paper: '#efe6d2',
  moon: '#e9e2d0',
  vermilion: '#b23a2e',
  gold: '#c9a063',
  rosewood: '#2a1913',
  bronze: '#8c6a3f',
  ink: '#3a332b',
  muted: '#8d7f6a',
} as const
