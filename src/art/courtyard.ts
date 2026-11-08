import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  bambooMaterial,
  barkMaterial,
  celadonMaterial,
  dustPointsMaterial,
  fallingLeafMaterial,
  leafClusterMaterial,
  plasterMaterial,
  roofMaterial,
  stoneMaterial,
  stonePaversMaterial,
  woodMaterial,
} from './materials.ts'
import { mulberry32 } from './noise.ts'
import type { QualitySettings } from './quality.ts'
import {
  blobShadowTexture,
  dappleTexture,
  dustTexture,
  glowTexture,
  leafSpriteTexture,
  plaqueTexture,
  skyTexture,
} from './textures.ts'

const GROUND_Y = -7.2
const TABLE_TOP = -3.85
const TABLE_R = 6.2

const LEAF_COLORS = [0xb8452a, 0xcf5c2e, 0xdf7c33, 0xe2a33f, 0xc23a28, 0x9f3426]

function makeGlow(color: number, opacity: number, map = glowTexture()): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  return sprite
}

/** 天空 + 环境反射 */
function setupSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  scene.background = new THREE.Color(0xbfd8e8)
  scene.fog = new THREE.FogExp2(0xdce6e4, 0.0048)

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(95, 32, 16),
    new THREE.MeshBasicMaterial({
      map: skyTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  )
  sky.name = 'autumn-sky'
  scene.add(sky)

  const sunGlow = makeGlow(0xfff2cf, 0.5)
  sunGlow.position.set(-42, 44, -20)
  sunGlow.scale.setScalar(26)
  scene.add(sunGlow)

  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color(0xbfd8e8)
  const envSky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 8),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide }),
  )
  envScene.add(envSky)
  const envSun = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff1ca, side: THREE.DoubleSide }),
  )
  envSun.position.set(-16, 18, -6)
  envSun.lookAt(0, 0, 0)
  envScene.add(envSun)
  const envGround = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshBasicMaterial({ color: 0x8e7d60, side: THREE.DoubleSide }),
  )
  envGround.rotation.x = -Math.PI / 2
  envGround.position.y = -9
  envScene.add(envGround)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(envScene, 0.03)
  scene.environment = target.texture
  pmrem.dispose()

  envScene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    }
  })
}

function addBlobShadow(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  size: number,
  opacity: number,
): void {
  const mat = new THREE.MeshBasicMaterial({
    map: blobShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  })
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
  blob.rotation.x = -Math.PI / 2
  blob.position.set(x, y, z)
  scene.add(blob)
}

function addDapple(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  size: number,
  opacity: number,
): void {
  const mat = new THREE.MeshBasicMaterial({
    map: dappleTexture(),
    color: 0x2e1f12,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
  plane.rotation.x = -Math.PI / 2
  plane.position.set(x, y, z)
  scene.add(plane)
}

/** 地面石板 + 通往月洞门的石径 */
function buildGround(): THREE.Group {
  const group = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), stonePaversMaterial())
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  group.add(ground)

  const stone = stoneMaterial()
  for (let i = 0; i < 9; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.7), stone)
    slab.position.set(-5 + Math.sin(i * 0.5) * 0.35, GROUND_Y + 0.045, 4 - i * 2.15)
    slab.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.02
    slab.receiveShadow = true
    group.add(slab)
  }

  return group
}

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

/** 粉墙、月洞门、瓦顶与漏窗 */
function buildWall(): THREE.Group {
  const group = new THREE.Group()

  const wallTop = 3.9
  const shape = new THREE.Shape()
  shape.moveTo(-24, GROUND_Y)
  shape.lineTo(24, GROUND_Y)
  shape.lineTo(24, wallTop)
  shape.lineTo(-24, wallTop)
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(-5, -2.35, 2.7, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  const wallGeo = new THREE.ShapeGeometry(shape, 64)
  const wallPos = wallGeo.getAttribute('position')
  const wallUv = wallGeo.getAttribute('uv')
  for (let i = 0; i < wallPos.count; i++) {
    wallUv.setXY(
      i,
      (wallPos.getX(i) + 24) / 48,
      (wallPos.getY(i) - GROUND_Y) / (wallTop - GROUND_Y),
    )
  }
  wallUv.needsUpdate = true

  const wall = new THREE.Mesh(wallGeo, plasterMaterial())
  wall.position.z = -24
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  const stone = stoneMaterial()
  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(2.74, 0.15, 10, 64), stone)
  gateRing.position.set(-5, -2.35, -23.88)
  gateRing.castShadow = true
  group.add(gateRing)

  const base = new THREE.Mesh(new THREE.BoxGeometry(49, 0.8, 0.7), stone)
  base.position.set(0, GROUND_Y + 0.4, -24)
  base.receiveShadow = true
  group.add(base)

  const roofWood = woodMaterial()
  const beam = new THREE.Mesh(new THREE.BoxGeometry(49, 0.45, 2.1), roofWood)
  beam.position.set(0, wallTop + 0.2, -24)
  beam.castShadow = true
  group.add(beam)

  const tileGeo = new THREE.CylinderGeometry(0.17, 0.17, 2.0, 6, 1, false, 0, Math.PI)
  tileGeo.rotateX(Math.PI / 2)
  const tiles = new THREE.InstancedMesh(tileGeo, roofMaterial(), 45)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 45; i++) {
    dummy.position.set(-24 + i * 1.09, wallTop + 0.5, -24.25)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    tiles.setMatrixAt(i, dummy.matrix)
  }
  tiles.castShadow = true
  tiles.receiveShadow = true
  group.add(tiles)

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(49, 0.22, 0.5), roofMaterial())
  ridge.position.set(0, wallTop + 0.74, -24.25)
  group.add(ridge)

  // 漏窗（装饰，不透）
  const frame = new THREE.Group()
  const dark = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.2, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x33402f, roughness: 1 }),
  )
  dark.position.z = 0.01
  frame.add(dark)
  for (const [w, h, x, y] of [
    [3.6, 0.12, 0, 1.66],
    [3.6, 0.12, 0, -1.66],
    [0.12, 3.6, 1.66, 0],
    [0.12, 3.6, -1.66, 0],
    [0.07, 3.2, -0.72, 0],
    [0.07, 3.2, 0.72, 0],
    [3.2, 0.07, 0, -0.72],
    [3.2, 0.07, 0, 0.72],
  ] as Array<[number, number, number, number]>) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), roofWood)
    bar.position.set(x, y, 0.06)
    frame.add(bar)
  }
  frame.position.set(7.8, 0.5, -23.86)
  group.add(frame)

  const sill = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.18, 0.55), stone)
  sill.position.set(7.8, -1.35, -23.68)
  sill.castShadow = true
  group.add(sill)

  // 木匾「叠珠」
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 2.7),
    new THREE.MeshBasicMaterial({ map: plaqueTexture(), toneMapped: false }),
  )
  plaque.position.set(4.9, 2.05, -23.82)
  group.add(plaque)
  for (const [w2, h2, x, y] of [
    [1.55, 0.1, 0, 1.39],
    [1.55, 0.1, 0, -1.39],
    [0.1, 2.86, 0.7, 0],
    [0.1, 2.86, -0.7, 0],
  ] as Array<[number, number, number, number]>) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.08), roofWood)
    bar.position.set(4.9 + x, 2.05 + y, -23.88)
    bar.castShadow = true
    group.add(bar)
  }

  return group
}

/** 枫树：弯曲树干 + 叶簇实例 */
function buildMapleTree(): THREE.Group {
  const group = new THREE.Group()
  group.position.set(-11.5, GROUND_Y, -7.5)
  const bark = barkMaterial()

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 2.1, 0.25),
    new THREE.Vector3(-0.2, 4.1, 0.1),
    new THREE.Vector3(-0.6, 5.4, 0.5),
  ])
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 20, 0.5, 7, false), bark)
  trunk.castShadow = true
  trunk.receiveShadow = true
  group.add(trunk)

  const root = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.55, 8), bark)
  root.position.y = 0.24
  root.castShadow = true
  group.add(root)

  const branchEnds: THREE.Vector3[] = [
    new THREE.Vector3(-2.6, 7.2, 0.8),
    new THREE.Vector3(1.8, 7.8, -0.4),
    new THREE.Vector3(-0.9, 8.7, -2.0),
    new THREE.Vector3(0.9, 6.6, 2.1),
  ]
  for (const end of branchEnds) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.4, 4.2, 0.2),
      new THREE.Vector3(end.x * 0.35, 5.3, end.z * 0.25),
      end,
    ])
    const branch = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.2, 5, false), bark)
    branch.castShadow = true
    group.add(branch)
  }

  const clusterGeo = new THREE.PlaneGeometry(3.9, 3.9)
  const clusters = 20
  const canopy = new THREE.InstancedMesh(clusterGeo, leafClusterMaterial(), clusters * 2)
  const dummy = new THREE.Object3D()
  const rnd = mulberry32(5252)
  let idx = 0
  for (let c = 0; c < clusters; c++) {
    const x = -3.2 + rnd() * 6.4
    const y = 4.8 + rnd() * 4.0
    const z = -2.6 + rnd() * 5.2
    const scale = 0.8 + rnd() * 0.55
    for (let k = 0; k < 2; k++) {
      dummy.position.set(x, y, z)
      dummy.rotation.set((rnd() - 0.5) * 0.7, (rnd() - 0.5) * Math.PI + k * Math.PI * 0.5, (rnd() - 0.5) * 0.5)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      canopy.setMatrixAt(idx, dummy.matrix)
      idx++
    }
  }
  canopy.frustumCulled = false
  canopy.castShadow = true
  canopy.receiveShadow = false
  group.add(canopy)

  return group
}

/** 竹丛：右侧一丛 + 月洞门后一丛 */
function buildBamboo(): THREE.Group {
  const group = new THREE.Group()
  const stalkGeo = new THREE.CylinderGeometry(1, 1, 1, 8)
  const stalkMat = bambooMaterial()
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafSpriteTexture(),
    color: 0x6f8f4a,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.8,
  })
  const leafGeo = new THREE.PlaneGeometry(1.1, 0.22)
  const rnd = mulberry32(7373)

  const clusters: Array<{ x: number; z: number; count: number; maxH: number }> = [
    { x: 11.2, z: -12.5, count: 10, maxH: 8.2 },
    { x: -6.2, z: -27.5, count: 7, maxH: 7.4 },
  ]

  for (const cluster of clusters) {
    const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, cluster.count)
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, cluster.count * 5)
    const dummy = new THREE.Object3D()
    let li = 0
    for (let i = 0; i < cluster.count; i++) {
      const h = cluster.maxH * (0.55 + rnd() * 0.45)
      const x = cluster.x + (rnd() - 0.5) * 2.4
      const z = cluster.z + (rnd() - 0.5) * 2.0
      dummy.position.set(x, GROUND_Y + h / 2, z)
      dummy.rotation.set((rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.1)
      dummy.scale.set(0.075, h, 0.075)
      dummy.updateMatrix()
      stalks.setMatrixAt(i, dummy.matrix)

      for (let k = 0; k < 5; k++) {
        dummy.position.set(
          x + (rnd() - 0.5) * 1.4,
          GROUND_Y + h * (0.62 + rnd() * 0.34),
          z + (rnd() - 0.5) * 1.4,
        )
        dummy.rotation.set((rnd() - 0.5) * 1.2, rnd() * Math.PI, (rnd() - 0.5) * 1.2)
        dummy.scale.setScalar(0.7 + rnd() * 0.6)
        dummy.updateMatrix()
        leaves.setMatrixAt(li++, dummy.matrix)
      }
    }
    stalks.castShadow = true
    stalks.frustumCulled = false
    leaves.castShadow = true
    leaves.frustumCulled = false
    group.add(stalks, leaves)
  }

  return group
}

/** 太湖石与石灯笼 */
function buildGardenStones(): THREE.Group {
  const group = new THREE.Group()
  const stone = stoneMaterial()
  const rnd = mulberry32(2468)

  for (let i = 0; i < 4; i++) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), stone)
    rock.position.set(-9.2 + rnd() * 1.6, GROUND_Y + 1.0 + i * 0.75, -14.4 + rnd() * 1.4)
    rock.scale.set(1.2 + rnd() * 0.5, 1.8 + rnd() * 0.8, 0.8 + rnd() * 0.4)
    rock.rotation.set(rnd() * 0.4, rnd() * Math.PI, rnd() * 0.3)
    rock.castShadow = true
    rock.receiveShadow = true
    group.add(rock)
  }

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
    opacity: 0.82,
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
  group.add(lantern)

  return group
}

/** 墙脚绿植与爬藤 */function buildWallPlants(): THREE.Group {
  const group = new THREE.Group()
  const rnd = mulberry32(3141)
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x587445, roughness: 0.92 })
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x4f6b3d, roughness: 0.9 })
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafSpriteTexture(),
    color: 0x6f8f4a,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.82,
  })

  for (let i = 0; i < 11; i++) {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rnd() * 0.4, 1), shrubMat)
    shrub.position.set(-22 + i * 4.4 + rnd(), GROUND_Y + 0.55, -23.1 + rnd() * 0.4)
    shrub.scale.set(1.2 + rnd() * 0.5, 0.8 + rnd() * 0.4, 1 + rnd() * 0.4)
    shrub.rotation.y = rnd() * Math.PI
    shrub.castShadow = true
    group.add(shrub)
  }

  const leafGeo = new THREE.PlaneGeometry(0.55, 0.2)
  const vineXs = [-17.5, -13.2, 14.6, 18.4]
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, vineXs.length * 14)
  const dummy = new THREE.Object3D()
  let idx = 0
  for (const vx of vineXs) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 6.6, 6), vineMat)
    stem.position.set(vx, GROUND_Y + 3.3, -23.68)
    stem.castShadow = true
    group.add(stem)
    for (let i = 0; i < 14; i++) {
      dummy.position.set(
        vx + (rnd() - 0.5) * 1.2,
        GROUND_Y + 0.6 + i * 0.43,
        -23.62 + rnd() * 0.08,
      )
      dummy.rotation.set((rnd() - 0.5) * 1.4, rnd() * Math.PI, (rnd() - 0.5) * 1.4)
      dummy.scale.setScalar(0.7 + rnd() * 0.6)
      dummy.updateMatrix()
      leaves.setMatrixAt(idx++, dummy.matrix)
    }
  }
  leaves.frustumCulled = false
  group.add(leaves)

  const grassGeo = new THREE.ConeGeometry(0.06, 0.55, 3)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x718a4e, roughness: 0.9 })
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, 90)
  for (let i = 0; i < 90; i++) {
    dummy.position.set(-22 + rnd() * 44, GROUND_Y + 0.25, -22.6 + rnd() * 1.5)
    dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4)
    dummy.scale.set(0.8 + rnd() * 0.8, 0.7 + rnd() * 0.8, 0.8 + rnd() * 0.8)
    dummy.updateMatrix()
    grass.setMatrixAt(i, dummy.matrix)
  }
  grass.frustumCulled = false
  group.add(grass)

  return group
}

/** 石桌上的柿子、茶盏与散落枫叶 */
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

interface LeafState {
  x: number
  y: number
  z: number
  vy: number
  phase: number
  sway: number
  spin: number
  rot: number
  scale: number
  hold: number
}

/** 飘落的枫叶 */
class FallingLeaves {
  mesh: THREE.InstancedMesh
  private states: LeafState[] = []
  private dummy = new THREE.Object3D()
  private rnd = mulberry32(9898)
  private time = 0

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.PlaneGeometry(0.26, 0.38)
    const mat = fallingLeafMaterial()
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    scene.add(this.mesh)

    for (let i = 0; i < count; i++) {
      const state = this.spawn(true)
      this.states.push(state)
      this.mesh.setColorAt(i, new THREE.Color(LEAF_COLORS[Math.floor(this.rnd() * LEAF_COLORS.length)]))
      this.write(i, state)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  private spawn(initial = false): LeafState {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 12; tries++) {
      if (this.rnd() < 0.72) {
        x = -18 + this.rnd() * 14
        z = -17 + this.rnd() * 20
      } else {
        x = -2 + this.rnd() * 19
        z = -10 + this.rnd() * 18
      }
      const insideBox = Math.abs(x) < 4.7 && Math.abs(z) < 4.7
      if (!insideBox) break
    }
    return {
      x,
      y: initial ? 4.5 + this.rnd() * 7 : 8 + this.rnd() * 4,
      z,
      vy: 0.4 + this.rnd() * 0.5,
      phase: this.rnd() * Math.PI * 2,
      sway: 0.35 + this.rnd() * 0.7,
      spin: (this.rnd() - 0.5) * 1.5,
      rot: this.rnd() * Math.PI * 2,
      scale: 0.8 + this.rnd() * 0.7,
      hold: 0,
    }
  }

  private write(i: number, s: LeafState): void {
    this.dummy.position.set(s.x, s.y, s.z)
    this.dummy.rotation.set(s.rot * 0.7, s.rot, s.rot * 0.4)
    this.dummy.scale.setScalar(s.scale)
    this.dummy.updateMatrix()
    this.mesh.setMatrixAt(i, this.dummy.matrix)
  }

  update(dt: number): void {
    this.time += dt
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]
      if (s.hold > 0) {
        s.hold -= dt
        if (s.hold <= 0) {
          this.states[i] = this.spawn()
          this.mesh.setColorAt(
            i,
            new THREE.Color(LEAF_COLORS[Math.floor(this.rnd() * LEAF_COLORS.length)]),
          )
          if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
          this.write(i, this.states[i])
        }
        continue
      }

      s.y -= s.vy * dt
      s.x += Math.sin(this.time * 0.9 + s.phase) * s.sway * dt
      s.z += Math.cos(this.time * 0.7 + s.phase) * s.sway * 0.7 * dt
      s.rot += s.spin * dt

      // 不让飘叶穿进棂笼
      if (Math.abs(s.x) < 3.6 && Math.abs(s.z) < 3.6 && s.y < 4.2) {
        this.states[i] = this.spawn()
        this.mesh.setColorAt(
          i,
          new THREE.Color(LEAF_COLORS[Math.floor(this.rnd() * LEAF_COLORS.length)]),
        )
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
        this.write(i, this.states[i])
        continue
      }

      const overTable = s.x * s.x + s.z * s.z < (TABLE_R - 0.25) * (TABLE_R - 0.25)
      const ground = overTable ? TABLE_TOP + 0.03 : GROUND_Y + 0.03
      if (s.y <= ground) {
        s.y = ground
        s.hold = 1.2 + this.rnd() * 1.8
      }
      this.write(i, s)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

/** 地面与桌面的静叶 */
function buildLitter(scene: THREE.Scene): void {
  const count = 46
  const geo = new THREE.PlaneGeometry(0.26, 0.38)
  const mesh = new THREE.InstancedMesh(geo, fallingLeafMaterial(), count)
  mesh.frustumCulled = false
  const dummy = new THREE.Object3D()
  const rnd = mulberry32(4242)
  for (let i = 0; i < count; i++) {
    let x = 0
    let z = 0
    let y = GROUND_Y + 0.02
    if (i < 14) {
      const a = rnd() * Math.PI * 2
      const r = 4.4 + rnd() * 1.6
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      y = TABLE_TOP + 0.02
    } else {
      x = -20 + rnd() * 40
      z = -18 + rnd() * 28
      if (Math.abs(x) < 4.5 && Math.abs(z) < 4.5) {
        x += 8
      }
    }
    dummy.position.set(x, y, z)
    dummy.rotation.set(-Math.PI / 2, 0, rnd() * Math.PI * 2)
    dummy.scale.setScalar(0.7 + rnd() * 0.7)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, new THREE.Color(LEAF_COLORS[Math.floor(rnd() * LEAF_COLORS.length)]))
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.receiveShadow = true
  scene.add(mesh)
}

/** 空气中的花粉/微尘 */
function buildPollen(scene: THREE.Scene, count: number): { points: THREE.Points; update: (dt: number) => void } {
  const positions = new Float32Array(count * 3)
  const base = new Float32Array(count * 3)
  const rnd = mulberry32(6161)
  for (let i = 0; i < count; i++) {
    base[i * 3] = -16 + rnd() * 32
    base[i * 3 + 1] = GROUND_Y + 1 + rnd() * 11
    base[i * 3 + 2] = -16 + rnd() * 28
  }
  positions.set(base)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = dustPointsMaterial()
  mat.map = dustTexture()
  mat.size = 0.06
  mat.opacity = 0.34
  mat.color.setHex(0xfff0c8)
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)
  let time = 0
  return {
    points,
    update: (dt) => {
      time += dt
      const attr = geo.getAttribute('position') as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      for (let i = 0; i < count; i++) {
        arr[i * 3] = base[i * 3] + Math.sin(time * 0.18 + i) * 0.8
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.12 + i * 0.7) * 0.5
        arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.15 + i * 0.5) * 0.6
      }
      attr.needsUpdate = true
    },
  }
}

export interface Courtyard {
  group: THREE.Group
  update(dt: number): void
}

export function createCourtyard(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  q: QualitySettings,
): Courtyard {
  setupSky(scene, renderer)

  const group = new THREE.Group()
  group.name = 'autumn-courtyard'
  group.add(buildGround())
  group.add(buildStoneTable())
  group.add(buildWall())
  group.add(buildMapleTree())
  group.add(buildBamboo())
  group.add(buildGardenStones())
  group.add(buildTableProps())
  group.add(buildWallPlants())
  scene.add(group)

  addBlobShadow(scene, 1.5, GROUND_Y + 0.012, -1.5, 20, 0.3)
  addBlobShadow(scene, 1.6, TABLE_TOP + 0.008, -1.4, 10.5, 0.3)
  addBlobShadow(scene, -11.5, GROUND_Y + 0.014, -7.5, 9, 0.24)
  addBlobShadow(scene, -7.8, GROUND_Y + 0.014, 2.6, 3.6, 0.28)
  addBlobShadow(scene, 7.8, GROUND_Y + 0.014, 2.6, 3.6, 0.28)
  addBlobShadow(scene, 8.9, GROUND_Y + 0.014, -5.6, 3.2, 0.2)

  addDapple(scene, -1.4, TABLE_TOP + 0.012, 0.9, 10.5, 0.2)
  addDapple(scene, -5.0, GROUND_Y + 0.016, -2.0, 24, 0.13)
  addDapple(scene, 8.5, GROUND_Y + 0.016, 2.0, 12, 0.1)

  const mossMat = new THREE.MeshBasicMaterial({
    map: dappleTexture(),
    color: 0x5c7444,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false,
  })
  for (const [x, z, s] of [
    [-14, -18, 11],
    [-4, -20, 9],
    [10, -19, 8],
    [16, -14, 7],
    [-15, 6, 6],
  ] as Array<[number, number, number]>) {
    const moss = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mossMat)
    moss.rotation.x = -Math.PI / 2
    moss.position.set(x, GROUND_Y + 0.018, z)
    scene.add(moss)
  }

  // 墙外远树：从瓦顶后探出，增加层次
  const farTrees = new THREE.Group()
  const farMat = leafClusterMaterial()
  for (const [x, y, z, s] of [
    [-20, 3.9, -31, 6],
    [-12, 4.2, -32, 7],
    [12, 3.8, -31, 6],
    [21, 4.3, -30, 7],
    [3, 3.6, -33, 5],
  ] as Array<[number, number, number, number]>) {
    const far = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.8), farMat)
    far.position.set(x, y, z)
    far.rotation.y = x > 0 ? -0.2 : 0.2
    farTrees.add(far)
  }
  scene.add(farTrees)

  buildLitter(scene)
  const leaves = new FallingLeaves(scene, q.tier === 'low' ? 20 : q.tier === 'medium' ? 30 : 38)
  const pollen = buildPollen(scene, q.tier === 'low' ? 30 : q.tier === 'medium' ? 50 : 80)

  return {
    group,
    update: (dt) => {
      leaves.update(dt)
      pollen.update(dt)
    },
  }
}
