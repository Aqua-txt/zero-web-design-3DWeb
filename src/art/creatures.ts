import * as THREE from 'three'
import type { TimeOfDay } from '../config.ts'
import { mulberry32 } from './noise.ts'
import type { QualitySettings } from './quality.ts'
import { GROUND_Y, STONE_PLAN, TABLE_TOP } from './stoneSet.ts'
import { COURT_SCALE } from './nightCourt.ts'

/** 石凳座面高度（与 stoneSet 的建法一致：座面顶 = 地面 + 1.48 + 0.16） */
const STOOL_TOP = GROUND_Y + 1.64

interface Bird {
  group: THREE.Group
  phase: number
}

/** 一只蹲坐的猫：团身 + 头 + 耳 + 尾，靠关节组做呼吸/甩尾/眨眼 */
function buildCat(): { group: THREE.Group; update(t: number): void; setNight(on: boolean): void } {
  const group = new THREE.Group()

  const fur = new THREE.MeshStandardMaterial({ color: 0xb58f60, roughness: 0.92 })
  const furDark = new THREE.MeshStandardMaterial({ color: 0x6d5136, roughness: 0.95 })
  const cream = new THREE.MeshStandardMaterial({ color: 0xefe2c9, roughness: 0.9 })
  const nose = new THREE.MeshStandardMaterial({ color: 0xb9706d, roughness: 0.8 })

  // 身体（蹲坐：后身低、前胸高）
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), fur)
  body.scale.set(1.05, 1.1, 1.25)
  body.position.set(0, 0.4, -0.05)
  body.castShadow = true
  group.add(body)

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 14), cream)
  chest.scale.set(0.9, 1.15, 0.9)
  chest.position.set(0, 0.56, 0.24)
  chest.castShadow = true
  group.add(chest)

  // 背上的三道虎斑
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), furDark)
    stripe.scale.set(1.02, 0.12, 0.34)
    stripe.position.set(0, 0.66 - i * 0.12, -0.16 - i * 0.06)
    group.add(stripe)
  }

  // 尾巴：一段段小球串成，挂在一个可旋转的枢轴上
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.22, -0.34)
  const tailSegs: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.085 - i * 0.008, 10, 8), i % 2 ? furDark : fur)
    seg.position.set(0, i * 0.075 - i * i * 0.006, -i * 0.085)
    seg.castShadow = true
    tailSegs.push(seg)
    tailPivot.add(seg)
  }
  group.add(tailPivot)

  // 头（可上下轻点 + 偶尔转头）
  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.78, 0.22)
  group.add(headPivot)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 20, 16), fur)
  head.scale.set(1.05, 0.95, 0.95)
  head.castShadow = true
  headPivot.add(head)

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), cream)
  muzzle.scale.set(1.25, 0.8, 0.9)
  muzzle.position.set(0, -0.05, 0.19)
  headPivot.add(muzzle)

  const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), nose)
  noseMesh.position.set(0, -0.02, 0.28)
  headPivot.add(noseMesh)

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), furDark)
    ear.position.set(s * 0.14, 0.22, 0.0)
    ear.rotation.z = s * 0.24
    headPivot.add(ear)

    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), nose)
    innerEar.position.set(s * 0.14, 0.215, 0.045)
    innerEar.rotation.z = s * 0.24
    headPivot.add(innerEar)

    const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.26, 4), furDark)
    whisker.rotation.z = Math.PI / 2
    whisker.rotation.y = s * 0.35
    whisker.position.set(s * 0.14, -0.05, 0.22)
    headPivot.add(whisker)
  }

  // 眼睛：夜里带一点琥珀自发光
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x3c2a1a,
    roughness: 0.35,
    emissive: 0x000000,
    emissiveIntensity: 0,
  })
  const eyes: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), eyeMat)
    eye.position.set(s * 0.095, 0.03, 0.205)
    eye.scale.set(1, 1.15, 0.7)
    eyes.push(eye)
    headPivot.add(eye)
  }

  // 前爪
  for (const s of [-1, 1]) {
    const paw = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 10), fur)
    paw.rotation.x = Math.PI / 2
    paw.position.set(s * 0.19, 0.1, 0.36)
    paw.castShadow = true
    group.add(paw)
  }

  const update = (t: number): void => {
    // 呼吸
    const breath = 1 + Math.sin(t * 1.6) * 0.018
    body.scale.set(1.05 * breath, 1.1 / breath, 1.25)
    // 甩尾
    tailPivot.rotation.y = Math.sin(t * 1.15) * 0.32 + Math.sin(t * 2.3) * 0.08
    for (let i = 0; i < tailSegs.length; i++) {
      tailSegs[i].position.x = Math.sin(t * 1.15 - i * 0.5) * 0.02 * i
    }
    // 抬头张望 + 轻轻点头
    headPivot.rotation.y = Math.sin(t * 0.42) * 0.22
    headPivot.rotation.x = Math.sin(t * 1.6) * 0.03
    // 眨眼：每 4.6 秒一次
    const blink = (t % 4.6) > 4.42 ? 0.12 : 1
    for (const eye of eyes) eye.scale.y = 1.15 * blink
  }

  const setNight = (on: boolean): void => {
    eyeMat.emissive.setHex(on ? 0xffb45c : 0x000000)
    eyeMat.emissiveIntensity = on ? 0.75 : 0
  }

  return { group, update, setNight }
}

/** 一只落在桌上的小鸟（麻雀色的低模） */
function buildBird(seed: number): Bird {
  const g = new THREE.Group()
  const feather = new THREE.MeshStandardMaterial({ color: 0x8a7358, roughness: 0.85 })
  const light = new THREE.MeshStandardMaterial({ color: 0xd9cbb2, roughness: 0.85 })
  const beak = new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.7 })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), feather)
  body.scale.set(1, 0.95, 1.35)
  body.castShadow = true
  g.add(body)

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), light)
  belly.scale.set(1, 0.8, 1.1)
  belly.position.set(0, -0.04, 0.06)
  g.add(belly)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), feather)
  head.position.set(0, 0.14, 0.16)
  head.castShadow = true
  g.add(head)

  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.1, 6), beak)
  bill.rotation.x = Math.PI / 2
  bill.position.set(0, 0.13, 0.28)
  g.add(bill)

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 4), feather)
  tail.rotation.x = -Math.PI / 2 - 0.35
  tail.position.set(0, 0.02, -0.24)
  g.add(tail)

  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), light)
    wing.scale.set(0.45, 0.7, 1.15)
    wing.position.set(s * 0.12, 0.02, -0.02)
    g.add(wing)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5), beak)
    leg.position.set(s * 0.06, -0.16, 0.02)
    g.add(leg)
  }

  g.rotation.y = seed
  return { group: g, phase: seed * 3 }
}

/** 夜里在草木间飘的萤火 */
function buildFireflies(count: number): {
  points: THREE.Points
  update(t: number): void
  setVisible(on: boolean): void
} {
  const rnd = mulberry32(90210)
  const base = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const size = new Float32Array(count)
  const spots: Array<[number, number]> = []
  for (let i = 0; i < count; i++) {
    // 沿院子两侧的草木带分布，避开中央石案（本地坐标 × 庭院缩放，跟着院子一起变大）
    const side = i % 2 === 0 ? -1 : 1
    const x = side * (4.5 + rnd() * 7.5) * COURT_SCALE
    const z = (-11 + rnd() * 20) * COURT_SCALE
    spots.push([x, z])
    base.set([x, GROUND_Y + 1.2 + rnd() * 3.6, z], i * 3)
    seed[i] = rnd()
    size[i] = 1.1 + rnd() * 1.4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uT: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: `
      uniform float uT, uPx;
      attribute float aSeed;
      attribute float aSize;
      varying float vA;
      void main(){
        vec3 p = position;
        float ph = aSeed * 6.283;
        p.x += sin(uT * (0.32 + aSeed * 0.4) + ph) * 1.1;
        p.y += sin(uT * (0.55 + aSeed * 0.5) + ph * 1.7) * 0.55;
        p.z += cos(uT * (0.27 + aSeed * 0.45) + ph * 0.8) * 1.1;
        vA = 0.35 + 0.65 * pow(max(0.0, sin(uT * (0.7 + aSeed) + ph * 2.1)), 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPx * (60.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.45), a);
      }
    `,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.visible = false

  return {
    points,
    update: (t: number) => {
      mat.uniforms.uT.value = t
    },
    setVisible: (on: boolean) => {
      points.visible = on
    },
  }
}

export interface Creatures {
  group: THREE.Group
  update(dt: number): void
  setTimeOfDay(next: TimeOfDay): void
}

/**
 * 庭院里的「活气」：石凳上蹲着的猫、落在石桌边的小鸟，以及夜里飘的萤火。
 * 纯装饰，不参与物理。
 */
export function createCreatures(q: QualitySettings, initial: TimeOfDay): Creatures {
  const group = new THREE.Group()
  group.name = 'creatures'

  const cat = buildCat()
  // 蹲在左侧石凳上（stoneSet 的石凳位置是 (-7.8, 2.6)，整体按 STONE_PLAN 收束），面朝石案
  const stoolX = -7.8 * STONE_PLAN
  const stoolZ = 2.6 * STONE_PLAN
  cat.group.position.set(stoolX, STOOL_TOP, stoolZ)
  cat.group.scale.setScalar(1.3)
  cat.group.rotation.y = Math.atan2(-stoolX, -stoolZ)
  group.add(cat.group)

  const birdSpots: Array<[number, number, number]> = [
    [5.1 * STONE_PLAN, TABLE_TOP, -1.1 * STONE_PLAN],
    [4.4 * STONE_PLAN, TABLE_TOP, 1.9 * STONE_PLAN],
  ]
  const birds: Bird[] = birdSpots.map(([x, y, z], i) => {
    const bird = buildBird(i === 0 ? 0.6 : -1.4)
    bird.group.position.set(x, y, z)
    bird.group.rotation.y = Math.atan2(-x, -z) + (i === 0 ? 0.2 : -0.2)
    group.add(bird.group)
    return bird
  })

  const fireflies = buildFireflies(q.tier === 'low' ? 10 : q.tier === 'medium' ? 16 : 24)
  group.add(fireflies.points)

  let elapsed = 0
  const update = (dt: number): void => {
    elapsed += dt
    cat.update(elapsed)
    // 鸟：偶尔歪头
    birds.forEach((b, i) => {
      b.group.rotation.z = Math.sin(elapsed * 1.7 + b.phase) * 0.05
      b.group.position.y = birdSpots[i][1] + Math.abs(Math.sin(elapsed * 0.9 + b.phase)) * 0.012
    })
    fireflies.update(elapsed)
  }

  const setTimeOfDay = (next: TimeOfDay): void => {
    const night = next === 'night'
    fireflies.setVisible(night)
    cat.setNight(night)
  }
  setTimeOfDay(initial)

  return { group, update, setTimeOfDay }
}
