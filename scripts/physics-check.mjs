/**
 * 物理正确性离线测试（node scripts/physics-check.mjs）
 * 墙体配置、合成 clamp、安全网逻辑与 src/main.ts / config.ts 保持一致。
 */
import * as CANNON from 'cannon-es'

const RIG_SCALE = 1.15 // 与 config.ts 的 RIG_SCALE 一致 + 装置整体放大倍数
const BOX_SIZE = (2 / 0.3) * RIG_SCALE
const BOX_HALF = BOX_SIZE / 2
const PLINTH_H = 0.5 * RIG_SCALE
const TABLE_TOP = -3.85
const BOX_CENTER_Y = TABLE_TOP + PLINTH_H + BOX_HALF
const BOX_PLAN = 1 // 平面缩放，与 config.ts 一致
const BOX_HALF_XZ = BOX_HALF * BOX_PLAN
const WALL_T = 2
const WALL_EXTRA = 2.0
const DROP_LIFT = 0.15
const RADII = [0.45, 0.58, 0.74, 0.95, 1.22, 1.56, 2.0]

function buildWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0), allowSleep: false })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.solver.iterations = 20
  const matBall = new CANNON.Material('ball')
  const matWall = new CANNON.Material('wall')
  world.addContactMaterial(
    new CANNON.ContactMaterial(matBall, matBall, {
      friction: 0.45,
      restitution: 0.08,
      contactEquationStiffness: 5e6,
      contactEquationRelaxation: 4,
    }),
  )
  world.addContactMaterial(
    new CANNON.ContactMaterial(matBall, matWall, { friction: 0.06, restitution: 0.05 }),
  )
  const addWall = (cx, cy, cz, hx, hy, hz) => {
    const b = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: matWall,
      shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
    })
    b.position.set(cx, cy, cz)
    world.addBody(b)
  }
  // ===== 与 src/main.ts 完全一致的墙体 =====
  const wallBottom = BOX_CENTER_Y - BOX_HALF
  const wallTop = BOX_CENTER_Y + BOX_HALF + WALL_EXTRA
  const sideH = wallTop - wallBottom
  const sideCy = (wallTop + wallBottom) / 2
  addWall(0, wallBottom - WALL_T / 2, 0, BOX_HALF_XZ + WALL_T * 2, WALL_T / 2, BOX_HALF_XZ + WALL_T * 2)
  const sx = BOX_HALF_XZ + WALL_T / 2
  addWall(-sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF_XZ + WALL_T)
  addWall(sx, sideCy, 0, WALL_T / 2, sideH / 2, BOX_HALF_XZ + WALL_T)
  addWall(0, sideCy, -sx, BOX_HALF_XZ + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, sideCy, sx, BOX_HALF_XZ + WALL_T, sideH / 2, WALL_T / 2)
  addWall(0, wallTop + WALL_T / 2, 0, sx + WALL_T, WALL_T / 2, sx + WALL_T)
  const makeBall = (level, x, y, z) => {
    const r = RADII[level - 1]
    const body = new CANNON.Body({
      mass: r ** 3 * 5,
      material: matBall,
      shape: new CANNON.Sphere(r),
      linearDamping: 0.06,
      angularDamping: 0.4,
    })
    body.position.set(x, y, z)
    world.addBody(body)
    return body
  }
  return { world, makeBall }
}

const settle = (world, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 120) world.step(1 / 120)
}
/** 与游戏主循环一致：每步物理后做硬位置约束 + 安全网巡检 + 限速 */
const settleGuarded = (world, seconds, bodies) => {
  let rescued = 0
  for (let t = 0; t < seconds; t += 1 / 120) {
    world.step(1 / 120)
    for (const e of bodies) {
      const b = e.b
      const p = b.position
      const v = b.velocity
      const r = RADII[e.lvl - 1]
      // 硬位置约束（与 src/main.ts stepPhysics 一致）
      const lim = BOX_HALF_XZ - r + 0.08
      if (p.x < -lim) { p.x = -lim; if (v.x < 0) v.x = 0 }
      else if (p.x > lim) { p.x = lim; if (v.x > 0) v.x = 0 }
      if (p.z < -lim) { p.z = -lim; if (v.z < 0) v.z = 0 }
      else if (p.z > lim) { p.z = lim; if (v.z > 0) v.z = 0 }
      const floorY = BOX_CENTER_Y - BOX_HALF + r - 0.08
      if (p.y < floorY) { p.y = floorY; if (v.y < 0) v.y = 0 }
      const ceilY = BOX_CENTER_Y + BOX_HALF + WALL_EXTRA - r + 0.08
      if (p.y > ceilY) { p.y = ceilY; if (v.y > 0) v.y = 0 }
      // 兜底安全网
      if (
        p.y < BOX_CENTER_Y - BOX_HALF - 2 ||
        Math.abs(p.x) > BOX_HALF_XZ + 2 ||
        Math.abs(p.z) > BOX_HALF_XZ + 2
      ) {
        rescued++
        const lim2 = BOX_HALF_XZ - r - 0.03
        p.x = clamp(p.x, -lim2, lim2)
        p.z = clamp(p.z, -lim2, lim2)
        p.y = BOX_CENTER_Y + BOX_HALF + r + 0.4
        v.set(0, -1, 0)
      }
      const sp = v.length()
      if (sp > 22) v.scale(22 / sp, v)
    }
  }
  return rescued
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const results = []
const check = (name, pass, detail) => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`)
}

// T1 静止支撑：球心应停在 -BOX_HALF + r（坐在可见底面上，而非其下）
{
  const { world, makeBall } = buildWorld()
  const b = makeBall(1, 0, 0, 0)
  b.velocity.set(0, -2, 0)
  settle(world, 3)
  const expect = BOX_CENTER_Y - BOX_HALF + RADII[0]
  check(
    'T1 底面支撑: 球最低点与可见盒底对齐',
    Math.abs(b.position.y - expect) < 0.06,
    `y=${b.position.y.toFixed(3)} 期望≈${expect.toFixed(2)}`,
  )
}

// T2 最高生成点落下冲击不穿底、不撞顶盖
{
  const { world, makeBall } = buildWorld()
  const b = makeBall(3, 0, BOX_CENTER_Y + BOX_HALF + RADII[2] + DROP_LIFT, 0)
  b.velocity.set(0, -2, 0)
  settle(world, 4)
  const minY = b.position.y - RADII[2]
  check(
    'T2 生成高度落下: 不穿透底面',
    minY > BOX_CENTER_Y - BOX_HALF - 0.05,
    `球最低点=${minY.toFixed(3)} 盒底=${(BOX_CENTER_Y - BOX_HALF).toFixed(2)}`,
  )
}

// T2b 顶盖位置校验：3 号球生成点（最高球顶）必须低于顶盖底面
{
  const topOfHighest = BOX_CENTER_Y + BOX_HALF + 2 * RADII[2] + DROP_LIFT
  const lidBottom = BOX_CENTER_Y + BOX_HALF + WALL_EXTRA
  check(
    'T2b 顶盖校验: 最高生成球顶低于顶盖',
    topOfHighest < lidBottom - 0.2,
    `球顶=${topOfHighest.toFixed(2)} 顶盖底面=${lidBottom.toFixed(2)}`,
  )
}

// T3 贴墙合成（带 clamp）：新球留在盒内
{
  const { world, makeBall } = buildWorld()
  const wallX = -BOX_HALF_XZ + RADII[0] + 0.01
  makeBall(1, wallX, BOX_CENTER_Y - BOX_HALF + RADII[0], 0)
  makeBall(1, wallX, BOX_CENTER_Y - BOX_HALF + RADII[0] * 3 + 0.02, 0)
  settle(world, 2)
  const r2 = RADII[1]
  const lim = BOX_HALF_XZ - r2 - 0.03
  const midX = (wallX + wallX) / 2
  const b = makeBall(2, clamp(midX, -lim, lim), BOX_CENTER_Y - BOX_HALF + r2 + 0.02, 0)
  settle(world, 3)
  const inside = Math.abs(b.position.x) < BOX_HALF_XZ + 0.05 && b.position.y > BOX_CENTER_Y - BOX_HALF - 0.1
  check('T3 贴墙合成 clamp: 新球留在盒内', inside, `x=${b.position.x.toFixed(3)} y=${b.position.y.toFixed(3)}`)
}

// T4 安全网：越界球拉回盒顶后正常留盒
{
  const { world, makeBall } = buildWorld()
  const b = makeBall(2, 10, 0, 0)
  settle(world, 0.5)
  const r = RADII[1]
  const lim = BOX_HALF_XZ - r - 0.03
  b.position.x = clamp(b.position.x, -lim, lim)
  b.position.z = clamp(b.position.z, -lim, lim)
  b.position.y = BOX_CENTER_Y + BOX_HALF + r + 0.4
  b.velocity.set(0, -1, 0)
  b.angularVelocity.set(0, 0, 0)
  settle(world, 4)
  const ok = Math.abs(b.position.x) < BOX_HALF_XZ && b.position.y > BOX_CENTER_Y - BOX_HALF
  check('T4 安全网回收: 拉回后留盒', ok, `x=${b.position.x.toFixed(3)} y=${b.position.y.toFixed(3)}`)
}

// T6 合成弹起高度：紧邻两球合成的新球，弹起峰值不得明显高于盒顶
{
  const { world, makeBall } = buildWorld()
  const r1 = RADII[0]
  // 两个 1 号球并排紧靠在盒底
  makeBall(1, -r1, BOX_CENTER_Y - BOX_HALF + r1, 0)
  makeBall(1, r1, BOX_CENTER_Y - BOX_HALF + r1, 0)
  settle(world, 1.5)
  // 合成：移除两球，新球（重叠约 0.13）生成于中点
  const r2 = RADII[1]
  const lim = BOX_HALF - r2 - 0.03
  const b = makeBall(2, clamp(0, -lim, lim), BOX_CENTER_Y - BOX_HALF + r2 + 0.02, 0)
  let peak = b.position.y
  for (let t = 0; t < 1.2; t += 1 / 120) {
    world.step(1 / 120)
    peak = Math.max(peak, b.position.y)
  }
  const overshoot = peak - (BOX_CENTER_Y + BOX_HALF)
  check(
    'T6 合成弹起: 峰值不显著凸出盒顶',
    overshoot < 0.8,
    `弹起峰值 y=${peak.toFixed(2)} 盒顶=${(BOX_CENTER_Y + BOX_HALF).toFixed(2)} 凸出=${overshoot.toFixed(2)}`,
  )
}

// T7 持续侧压穿墙测试：极端堆压下（每球持续受 30g 侧向力），球也不得穿出墙体
{
  const { world, makeBall } = buildWorld()
  const bodies = []
  for (let i = 0; i < 25; i++) {
    const lvl = 1 + Math.floor(Math.random() * 3)
    const r = RADII[lvl - 1]
    const lim = BOX_HALF - r - 0.03
    const b = makeBall(
      lvl,
      (Math.random() * 2 - 1) * lim,
      BOX_CENTER_Y - BOX_HALF + r + Math.random() * 1.5,
      (Math.random() * 2 - 1) * lim,
    )
    bodies.push({ b, lvl })
  }
  settle(world, 1)
  // 施加持续向左的极端挤压力（相当于 30 倍重力）
  let worst = 0
  for (let t = 0; t < 3; t += 1 / 120) {
    for (const { b } of bodies) b.applyForce(new CANNON.Vec3(-b.mass * 360, 0, 0))
    world.step(1 / 120)
    for (const e of bodies) {
      const b = e.b
      const p = b.position
      const v = b.velocity
      const r = RADII[e.lvl - 1]
      const lim = BOX_HALF_XZ - r + 0.08
      if (p.x < -lim) { p.x = -lim; if (v.x < 0) v.x = 0 }
      else if (p.x > lim) { p.x = lim; if (v.x > 0) v.x = 0 }
      if (p.z < -lim) { p.z = -lim; if (v.z < 0) v.z = 0 }
      else if (p.z > lim) { p.z = lim; if (v.z > 0) v.z = 0 }
      const floorY = BOX_CENTER_Y - BOX_HALF + r - 0.08
      if (p.y < floorY) { p.y = floorY; if (v.y < 0) v.y = 0 }
      const sp = v.length()
      if (sp > 22) v.scale(22 / sp, v)
      worst = Math.max(worst, r - p.x - BOX_HALF) // 球左沿越过内壁的深度，>0.15 视为穿出
    }
  }
  check(
    'T7 持续侧压30g: 球不穿墙（最深嵌入≤0.15）',
    worst <= 0.15,
    `最大嵌入深度=${worst.toFixed(3)}`,
  )
}

// T5 压测：60 球随机落 + 合成 + 安全网，全程零越界
{
  const { world, makeBall } = buildWorld()
  const bodies = []
  let rescued = 0
  for (let i = 0; i < 60; i++) {
    const lvl = 1 + Math.floor(Math.random() * 3)
    const r = RADII[lvl - 1]
    const lim = BOX_HALF - r - 0.03
    const b = makeBall(
      lvl,
      (Math.random() * 2 - 1) * lim,
      BOX_CENTER_Y + BOX_HALF + r + DROP_LIFT,
      (Math.random() * 2 - 1) * lim,
    )
    b.velocity.set(0, -2, 0)
    bodies.push({ b, lvl })
    rescued += settleGuarded(world, 0.3, bodies)
    // 相邻同号合成（复刻 main.ts 的三轴 clamp）
    outer: for (let a = 0; a < bodies.length; a++) {
      for (let c = a + 1; c < bodies.length; c++) {
        const A = bodies[a]
        const C = bodies[c]
        if (A.lvl !== C.lvl || A.lvl >= 7) continue
        if (A.b.position.distanceTo(C.b.position) < RADII[A.lvl - 1] * 2 + 0.05) {
          const nl = A.lvl + 1
          const nr = RADII[nl - 1]
          const nlim = BOX_HALF_XZ - nr - 0.03
          const mx = (A.b.position.x + C.b.position.x) / 2
          const my = (A.b.position.y + C.b.position.y) / 2
          const mz = (A.b.position.z + C.b.position.z) / 2
          world.removeBody(A.b)
          world.removeBody(C.b)
          bodies.splice(c, 1)
          bodies.splice(a, 1)
          bodies.push({
            b: makeBall(nl, clamp(mx, -nlim, nlim), Math.max(my, BOX_CENTER_Y - BOX_HALF + nr + 0.02), clamp(mz, -nlim, nlim)),
            lvl: nl,
          })
          break outer
        }
      }
    }
  }
  rescued += settleGuarded(world, 3, bodies)
  // 最终静止后不得有任何球在边界外
  let escapes = 0
  for (const { b } of bodies) {
    if (
      b.position.y < BOX_CENTER_Y - BOX_HALF - 2 ||
      Math.abs(b.position.x) > BOX_HALF_XZ + 2 ||
      Math.abs(b.position.z) > BOX_HALF_XZ + 2
    )
      escapes++
  }
  const maxLevel = Math.max(...bodies.map((x) => x.lvl))
  check(
    'T5 压测60球+合成+安全网: 最终零越界',
    escapes === 0,
    `存活=${bodies.length} 最大合成=${maxLevel}号 安全网拦截=${rescued} 最终越界=${escapes}`,
  )
}

const failed = results.filter((r) => !r).length
console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`)
process.exit(failed === 0 ? 0 : 1)
