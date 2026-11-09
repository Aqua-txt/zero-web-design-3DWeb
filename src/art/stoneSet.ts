import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { celadonMaterial, stoneMaterial } from './materials.ts'
import { mulberry32 } from './noise.ts'
import { TIME_OF_DAY, type TimeOfDay } from '../config.ts'

/** 庭院地坪高度：石桌、石凳、石灯笼的共同基准（夜庭院也按此下移对齐） */
export const GROUND_Y = -7.2
/** 石桌面高度：棂笼与须弥座坐落于此 */
export const TABLE_TOP = -3.85
const TABLE_R = 6.2

/** 石桌、须弥座与石凳 */
function buildStoneTable(): THREE.Group {
  const group = new THREE.Group()
  const stone = stoneMaterial()

  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.34, 64), stone)
  top.position.y = TABLE_TOP - 0.17
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  const edge = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.04, 0.085, 8, 64), stone)
  edge.rotation.x = Math.PI / 2
  edge.position.y = TABLE_TOP - 0.03
  edge.castShadow = true
  group.add(edge)

  const apron = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 5.8, 0.55, 64), stone)
  apron.position.y = TABLE_TOP - 0.34 - 0.275
  apron.castShadow = true
  apron.receiveShadow = true
  group.add(apron)

  const apronRim = new THREE.Mesh(new THREE.TorusGeometry(5.83, 0.055, 6, 64), stone)
  apronRim.rotation.x = Math.PI / 2
  apronRim.position.y = TABLE_TOP - 0.89
  group.add(apronRim)

  const grooveMat = new THREE.MeshBasicMaterial({
    color: 0x6a6255,
    transparent: true,
    opacity: 0.42,
    toneMapped: false,
  })
  for (const r of [4.45, 4.95, 5.45]) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 4, 88), grooveMat)
    groove.rotation.x = Math.PI / 2
    groove.position.y = TABLE_TOP + 0.006
    group.add(groove)
  }

  const legGeo = new RoundedBoxGeometry(0.72, 2.5, 0.72, 3, 0.06)
  const footGeo = new RoundedBoxGeometry(0.98, 0.2, 0.98, 3, 0.04)
  const capGeo = new RoundedBoxGeometry(0.86, 0.18, 0.86, 3, 0.04)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(a) * 5.95
    const z = Math.sin(a) * 5.95
    const leg = new THREE.Mesh(legGeo, stone)
    leg.position.set(x, GROUND_Y + 1.25, z)
    const foot = new THREE.Mesh(footGeo, stone)
    foot.position.set(x, GROUND_Y + 0.1, z)
    const cap = new THREE.Mesh(capGeo, stone)
    cap.position.set(x, TABLE_TOP - 0.89, z)
    for (const part of [leg, foot, cap]) {
      part.castShadow = true
      part.receiveShadow = true
      group.add(part)
    }
  }

  for (const [x, z] of [
    [-7.8, 2.6],
    [7.8, 2.6],
  ]) {
    const stool = new THREE.Group()
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.2, 0.32, 32), stone)
    seat.position.y = GROUND_Y + 1.48
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.25, 32), stone)
    body.position.y = GROUND_Y + 0.75
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.08, 6, 32), stone)
    band.rotation.x = Math.PI / 2
    band.position.y = GROUND_Y + 1.1
    for (const part of [seat, body, band]) {
      part.castShadow = true
      part.receiveShadow = true
      stool.add(part)
    }
    stool.position.set(x, 0, z)
    group.add(stool)
  }

  return group
}

/** 石灯笼：底座、灯柱、灯箱与四片透光窗 */
function buildStoneLantern(): { group: THREE.Group; paneMat: THREE.MeshBasicMaterial } {
  const stone = stoneMaterial()
  const lantern = new THREE.Group()
  lantern.position.set(8.9, GROUND_Y, -5.6)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 12), stone)
  base.position.y = 0.15
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.6, 10), stone)
  shaft.position.y = 1.1
  const lightBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 1.1), stone)
  lightBox.position.y = 2.32
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.55, 4), stone)
  roof.position.y = 3.05
  roof.rotation.y = Math.PI / 4
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), stone)
  finial.position.y = 3.4
  for (const part of [base, shaft, lightBox, roof, finial]) {
    part.castShadow = true
    part.receiveShadow = true
    lantern.add(part)
  }

  const paneMat = new THREE.MeshBasicMaterial({
    color: 0xffdca0,
    transparent: true,
    // 白天灯窗不发光，只是暖色石纸
    opacity: TIME_OF_DAY === 'day' ? 0.28 : 0.82,
    toneMapped: false,
  })
  for (const [x, z, rot] of [
    [0, 0.56, 0],
    [0, -0.56, Math.PI],
    [0.56, 0, Math.PI / 2],
    [-0.56, 0, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.52), paneMat)
    pane.position.set(x, 2.32, z)
    pane.rotation.y = rot
    lantern.add(pane)
  }

  return { group: lantern, paneMat }
}

/** 石桌上的柿子、茶盏 */
function buildTableProps(): THREE.Group {
  const group = new THREE.Group()
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.98, 0.09, 32), celadonMaterial())
  plate.position.set(-4.95, TABLE_TOP + 0.05, 1.9)
  plate.castShadow = true
  plate.receiveShadow = true
  group.add(plate)

  const persimmonMat = new THREE.MeshPhysicalMaterial({
    color: 0xe06a2a,
    roughness: 0.32,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  })
  const calyxMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3f, roughness: 0.7 })
  const rnd = mulberry32(1111)
  for (const [x, z] of [
    [-5.25, 1.75],
    [-4.75, 2.05],
    [-5.0, 1.55],
  ]) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), persimmonMat)
    fruit.position.set(x, TABLE_TOP + 0.4, z)
    fruit.castShadow = true
    group.add(fruit)
    const calyx = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 5), calyxMat)
    calyx.position.set(x, TABLE_TOP + 0.72, z)
    calyx.rotation.y = rnd() * Math.PI
    group.add(calyx)
  }

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.28, 20), celadonMaterial())
  cup.position.set(4.65, TABLE_TOP + 0.17, 2.75)
  cup.castShadow = true
  group.add(cup)
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 24), celadonMaterial())
  saucer.position.set(4.65, TABLE_TOP + 0.03, 2.75)
  group.add(saucer)

  return group
}

/** 保留的庭院陈设：石桌（含石凳）、石灯笼与桌上摆件 */
export interface StoneSet {
  group: THREE.Group
  /** 昼夜切换：夜里灯窗透光，白天只是暖色石纸 */
  setTimeOfDay(next: TimeOfDay): void
}

export function createStoneSet(): StoneSet {
  const group = new THREE.Group()
  group.name = 'stone-set'
  group.add(buildStoneTable())
  const lantern = buildStoneLantern()
  group.add(lantern.group)
  group.add(buildTableProps())
  return {
    group,
    setTimeOfDay: (next) => {
      lantern.paneMat.opacity = next === 'day' ? 0.28 : 0.82
      lantern.paneMat.needsUpdate = true
    },
  }
}
