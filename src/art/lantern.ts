import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BOX_CENTER_Y, BOX_PLAN, BOX_SIZE, RIG_SCALE } from '../config.ts'
import {
  brassMaterial,
  glowSpriteMaterial,
  jadeSlabMaterial,
  silkMaterial,
  woodMaterial,
} from './materials.ts'
import type { QualitySettings } from './quality.ts'
import { glowTexture } from './textures.ts'

/** 棂笼内部尺寸都按「设计基准」（1 倍）书写，整组再乘 RIG_SCALE */
const S = BOX_SIZE / RIG_SCALE
const H = S / 2
const FRAME = H + 0.17
const PANEL = H + 0.1
const LATTICE = H + 0.13

export interface Lantern {
  group: THREE.Group
  update(camera: THREE.Camera, dt: number): void
}

function quatrefoilShape(radius: number, inner = false): THREE.Shape | THREE.Path {
  const shape = inner ? new THREE.Path() : new THREE.Shape()
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const r = radius * (1 + 0.14 * Math.cos(4 * t))
    const x = Math.cos(t) * r
    const y = Math.sin(t) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function barGeometry(
  len: number,
  thick: number,
  depth: number,
  x: number,
  y: number,
  rot = 0,
): THREE.BufferGeometry {
  const bar = new THREE.BoxGeometry(len, thick, depth)
  const m = new THREE.Matrix4().makeRotationZ(rot)
  m.setPosition(x, y, 0)
  bar.applyMatrix4(m)
  return bar
}

/** 每个面的基础棂格：外框 + 井字棂条 + 四角冰裂 */
function faceGrid(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const span = 6.52
  const edge = 3.26
  const t = 0.03
  const d = 0.05

  // 外框
  parts.push(barGeometry(span, 0.085, d, 0, edge))
  parts.push(barGeometry(span, 0.085, d, 0, -edge))
  parts.push(barGeometry(edge * 2, 0.085, d, -edge, 0, Math.PI / 2))
  parts.push(barGeometry(edge * 2, 0.085, d, edge, 0, Math.PI / 2))

  // 井字棂条
  for (const x of [-1.62, 1.62]) parts.push(barGeometry(6.3, t, d, x, 0, Math.PI / 2))
  for (const y of [-1.62, 1.62]) parts.push(barGeometry(6.3, t, d, 0, y))

  // 四角冰裂
  const corners: Array<[number, number, number]> = [
    [-2.72, -2.72, Math.PI / 5],
    [2.72, -2.72, -Math.PI / 5],
    [-2.72, 2.72, -Math.PI / 5],
    [2.72, 2.72, Math.PI / 5],
  ]
  for (const [x, y, rot] of corners) {
    parts.push(barGeometry(0.72, 0.026, d, x, y, rot))
    parts.push(barGeometry(1.05, 0.026, d, x + (x > 0 ? -0.2 : 0.2), y + (y > 0 ? -0.2 : 0.2), rot + 1.05))
  }

  return parts
}

/** 后壁海棠开光：一圈海棠环 + 四根斜撑 + 冰裂 */
function backMedallion(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const outer = quatrefoilShape(2.06) as THREE.Shape
  const hole = quatrefoilShape(2.06 * 0.955, true) as THREE.Path
  outer.holes.push(hole)
  const ring = new THREE.ExtrudeGeometry(outer, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 4,
  })
  ring.translate(0, 0, -0.025)
  parts.push(ring)

  // 四根斜撑：把海棠环系回外框
  for (const [x, y, rot] of [
    [-2.45, -2.45, Math.PI / 4],
    [2.45, -2.45, -Math.PI / 4],
    [-2.45, 2.45, -Math.PI / 4],
    [2.45, 2.45, Math.PI / 4],
  ] as Array<[number, number, number]>) {
    parts.push(barGeometry(1.55, 0.028, 0.05, x, y, rot))
  }

  return parts
}

/** 后壁海棠的描金内圈（比木环更靠近笼内，灯下会亮） */
function brassMedallion(): THREE.BufferGeometry {
  const outer = quatrefoilShape(2.14) as THREE.Shape
  const hole = quatrefoilShape(2.11, true) as THREE.Path
  outer.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: 0.02,
    bevelEnabled: false,
    curveSegments: 4,
  })
  geo.translate(0, 0, -0.01)
  return geo
}

export function createLantern(q: QualitySettings): Lantern {
  const group = new THREE.Group()
  group.name = 'lattice-lantern'
  // 整套装置按 RIG_SCALE 放大（棂条、绢面、须弥座一起），平面再乘 BOX_PLAN；
  // 盒心抬到 BOX_CENTER_Y，须弥座底面正好压在桌面上。
  group.scale.set(RIG_SCALE * BOX_PLAN, RIG_SCALE, RIG_SCALE * BOX_PLAN)
  group.position.y = BOX_CENTER_Y

  const wood = woodMaterial()
  const brass = brassMaterial()

  /* ---------------- 四角立柱 ---------------- */
  const postGeo = new RoundedBoxGeometry(0.16, 7.0, 0.16, 4, 0.022)
  const postPositions: Array<[number, number]> = [
    [FRAME, FRAME],
    [FRAME, -FRAME],
    [-FRAME, FRAME],
    [-FRAME, -FRAME],
  ]
  for (const [x, z] of postPositions) {
    const post = new THREE.Mesh(postGeo, wood)
    post.position.set(x, 0.115, z)
    post.castShadow = true
    post.receiveShadow = true
    group.add(post)
  }

  /* ---------------- 上下横枨 ---------------- */
  const railLong = new THREE.BoxGeometry(FRAME * 2, 0.16, 0.16)
  const railSide = new THREE.BoxGeometry(0.16, 0.16, FRAME * 2)
  for (const y of [H + 0.08, -H + 0.06]) {
    for (const z of [FRAME, -FRAME]) {
      const rail = new THREE.Mesh(railLong, wood)
      rail.position.set(0, y, z)
      rail.castShadow = true
      rail.receiveShadow = true
      group.add(rail)
    }
    for (const x of [FRAME, -FRAME]) {
      const rail = new THREE.Mesh(railSide, wood)
      rail.position.set(x, y, 0)
      rail.castShadow = true
      rail.receiveShadow = true
      group.add(rail)
    }
  }

  /* ---------------- 铜包角 ---------------- */
  const capGeo = new RoundedBoxGeometry(0.24, 0.24, 0.24, 4, 0.035)
  for (const [x, z] of postPositions) {
    const cap = new THREE.Mesh(capGeo, brass)
    cap.position.set(x, H + 0.28, z)
    cap.castShadow = true
    group.add(cap)
  }
  const bandGeo = new RoundedBoxGeometry(0.2, 0.055, 0.2, 4, 0.02)
  for (const [x, z] of postPositions) {
    for (const y of [-H + 1.3, H - 1.15]) {
      const band = new THREE.Mesh(bandGeo, brass)
      band.position.set(x, y, z)
      band.castShadow = true
      group.add(band)
    }
  }

  /* ---------------- 绢面 ---------------- */
  const panels: Array<{ mesh: THREE.Mesh; normal: THREE.Vector3 }> = []
  const panelGeo = new THREE.PlaneGeometry(FRAME * 2 + 0.04, S)
  const faceDefs: Array<{ pos: [number, number, number]; rotY: number; normal: [number, number, number] }> = [
    { pos: [0, 0, PANEL], rotY: 0, normal: [0, 0, 1] },
    { pos: [0, 0, -PANEL], rotY: Math.PI, normal: [0, 0, -1] },
    { pos: [PANEL, 0, 0], rotY: Math.PI / 2, normal: [1, 0, 0] },
    { pos: [-PANEL, 0, 0], rotY: -Math.PI / 2, normal: [-1, 0, 0] },
  ]
  for (const def of faceDefs) {
    const isBack = def.normal[2] === -1
    const mat = silkMaterial(isBack ? 0.95 : 0.3)
    if (isBack) {
      mat.color.setHex(0x8f5a32)
      mat.emissive.setHex(0x2a1206)
      mat.emissiveIntensity = 0.38
    }
    const panel = new THREE.Mesh(panelGeo, mat)
    panel.position.set(...def.pos)
    panel.rotation.y = def.rotY
    panel.renderOrder = 1
    group.add(panel)
    panels.push({ mesh: panel, normal: new THREE.Vector3(...def.normal) })
  }

  /* ---------------- 棂格（四面井字 + 后壁海棠） ---------------- */
  const grids: Array<{ mesh: THREE.Mesh; normal: THREE.Vector3; mat: THREE.MeshPhysicalMaterial }> = []
  for (const def of faceDefs) {
    const geos: THREE.BufferGeometry[] = []
    const matrix = new THREE.Matrix4().makeRotationY(def.rotY)
    matrix.setPosition(def.pos[0], 0, def.pos[2])
    for (const part of faceGrid()) {
      const geo = part.index ? part.toNonIndexed() : part
      if (geo !== part) part.dispose()
      geo.applyMatrix4(matrix)
      geos.push(geo)
    }
    const merged = mergeGeometries(geos, false)
    geos.forEach((g) => g.dispose())
    if (!merged) continue
    const mat = wood.clone()
    mat.transparent = true
    mat.opacity = 1
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    grids.push({ mesh, normal: new THREE.Vector3(...def.normal), mat })
  }

  const medallionGeos: THREE.BufferGeometry[] = []
  for (const part of backMedallion()) {
    const geo = part.index ? part.toNonIndexed() : part
    if (geo !== part) part.dispose()
    medallionGeos.push(geo)
  }
  const medallionMerged = mergeGeometries(medallionGeos, false)
  medallionGeos.forEach((g) => g.dispose())
  const backMat = wood.clone()
  backMat.transparent = true
  backMat.opacity = 1
  if (medallionMerged) {
    const medallion = new THREE.Mesh(medallionMerged, backMat)
    medallion.position.z = -LATTICE
    medallion.castShadow = true
    medallion.receiveShadow = true
    group.add(medallion)
  }

  const brassRing = new THREE.Mesh(
    brassMedallion(),
    new THREE.MeshBasicMaterial({
      color: 0xd8b070,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    }),
  )
  brassRing.position.z = -H - 0.01
  group.add(brassRing)

  /* ---------------- 顶沿 / 底座描金 ---------------- */
  const topTrimY = H + 0.165
  for (const z of [FRAME - 0.01, -FRAME + 0.01]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(FRAME * 2 - 0.3, 0.012, 0.022), brass)
    trim.position.set(0, topTrimY, z)
    group.add(trim)
  }
  for (const x of [FRAME - 0.01, -FRAME + 0.01]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, FRAME * 2 - 0.3), brass)
    trim.position.set(x, topTrimY, 0)
    group.add(trim)
  }

  /* ---------------- 须弥座 ---------------- */
  const base = new THREE.Group()
  const upper = new THREE.Mesh(new RoundedBoxGeometry(7.7, 0.12, 7.7, 4, 0.02), wood)
  upper.position.y = -H - 0.06
  const waist = new THREE.Mesh(new RoundedBoxGeometry(7.0, 0.22, 7.0, 4, 0.02), wood)
  waist.position.y = -H - 0.23
  const foot = new THREE.Mesh(new RoundedBoxGeometry(7.9, 0.16, 7.9, 4, 0.02), wood)
  foot.position.y = -H - 0.42
  for (const part of [upper, waist, foot]) {
    part.castShadow = true
    part.receiveShadow = true
    base.add(part)
  }

  // 束腰铜线
  for (const y of [-H - 0.125, -H - 0.335]) {
    const long = new THREE.Mesh(new THREE.BoxGeometry(7.72, 0.018, 0.04), brass)
    long.position.set(0, y, 3.86)
    base.add(long)
    const long2 = long.clone()
    long2.position.z = -3.86
    base.add(long2)
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 7.72), brass)
    side.position.set(3.86, y, 0)
    base.add(side)
    const side2 = side.clone()
    side2.position.x = -3.86
    base.add(side2)
  }

  group.add(base)

  for (const z of [H - 0.03, -H + 0.03]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(S - 0.12, 0.012, 0.018), brass)
    rim.position.set(0, -H + 0.008, z)
    group.add(rim)
  }
  for (const x of [H - 0.03, -H + 0.03]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, S - 0.12), brass)
    rim.position.set(x, -H + 0.008, 0)
    group.add(rim)
  }

  /* ---------------- 内底青玉 + 铜线 ---------------- */
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.06, S - 0.06), jadeSlabMaterial(q))
  slab.rotation.x = -Math.PI / 2
  slab.position.y = -H + 0.002
  slab.receiveShadow = true
  group.add(slab)

  for (const z of [H - 0.16, -H + 0.16]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(S - 0.2, 0.012, 0.025), brass)
    line.position.set(0, -H + 0.008, z)
    group.add(line)
  }
  for (const x of [H - 0.16, -H + 0.16]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, S - 0.2), brass)
    line.position.set(x, -H + 0.008, 0)
    group.add(line)
  }

  /* ---------------- 内灯 ---------------- */
  const innerLight = new THREE.PointLight(0xffae5c, 6.5, 9, 2)
  innerLight.name = 'inner-light'
  innerLight.position.set(0, -H + 1.5, 0)
  group.add(innerLight)

  const lampGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12)
  const wickGeo = new THREE.SphereGeometry(0.035, 12, 8)
  const wickMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false })
  for (const [x, z] of [
    [H - 0.38, H - 0.38],
    [H - 0.38, -H + 0.38],
    [-H + 0.38, H - 0.38],
    [-H + 0.38, -H + 0.38],
  ]) {
    const lamp = new THREE.Mesh(lampGeo, brass)
    lamp.position.set(x, -H + 0.12, z)
    group.add(lamp)
    const wick = new THREE.Mesh(wickGeo, wickMat)
    wick.position.set(x, -H + 0.2, z)
    group.add(wick)
    const glowMat = glowSpriteMaterial(0xffb45c, 0.2)
    glowMat.map = glowTexture()
    const glow = new THREE.Sprite(glowMat)
    glow.position.set(x, -H + 0.2, z)
    glow.scale.setScalar(0.3)
    group.add(glow)
  }

  const floorGlowMat = glowSpriteMaterial(0xff9e4a, 0.06)
  floorGlowMat.map = glowTexture()
  const floorGlow = new THREE.Sprite(floorGlowMat)
  floorGlow.position.set(0, -H + 0.18, 0)
  floorGlow.scale.setScalar(5.2)
  group.add(floorGlow)

  /* ---------------- 近面淡出 ---------------- */
  const camDir = new THREE.Vector3()
  let elapsed = 0

  const update = (camera: THREE.Camera, dt: number): void => {
    elapsed += dt
    camDir.copy(camera.position)
    if (camDir.lengthSq() > 0.0001) camDir.normalize()
    for (const panel of panels) {
      const dot = panel.normal.dot(camDir)
      const farOpacity = panel.normal.z < -0.5 ? 0.9 : 0.3
      const target = dot > 0.25 ? 0.05 : farOpacity
      const mat = panel.mesh.material as THREE.MeshPhysicalMaterial
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 7)
    }
    for (const grid of grids) {
      const dot = grid.normal.dot(camDir)
      const target = dot > 0.3 ? 0.07 : 1
      grid.mat.opacity += (target - grid.mat.opacity) * Math.min(1, dt * 7)
    }
    const backTarget = camDir.z < -0.22 ? 0.04 : 1
    backMat.opacity += (backTarget - backMat.opacity) * Math.min(1, dt * 6)
    // 灯火轻微呼吸
    innerLight.intensity = 6.5 + Math.sin(elapsed * 1.7) * 0.35 + Math.sin(elapsed * 4.3) * 0.12
  }

  return { group, update }
}
