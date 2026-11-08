import * as THREE from 'three'
import { glowSpriteMaterial } from './materials.ts'
import type { QualitySettings } from './quality.ts'
import { glowTexture, petalTexture } from './textures.ts'

interface EffectItem {
  obj: THREE.Object3D
  t: number
  dur: number
  tick: (k: number) => void
  cleanup: () => void
}

const ringGeo = new THREE.RingGeometry(0.82, 1, 64)
const torusGeo = new THREE.TorusGeometry(1, 0.022, 8, 72)

function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - k, 3)
}

export class FX {
  private scene: THREE.Scene
  private q: QualitySettings
  private items: EffectItem[] = []

  constructor(scene: THREE.Scene, q: QualitySettings) {
    this.scene = scene
    this.q = q
  }

  private add(item: EffectItem): void {
    this.scene.add(item.obj)
    this.items.push(item)
  }

  /** 落珠触底 / 首次碰撞：一圈墨色涟漪 + 少量金粉 */
  impact(pos: THREE.Vector3, color: number): void {
    this.ring(pos, color, 1.1, 0.42, 0.7)
    this.sparks(pos, color, 4, 1.6)
  }

  /** 合成：玉环 + 珠色金粉 + 柔光 */
  merge(pos: THREE.Vector3, level: number, radius: number, color: number): void {
    const gold = 0xd9b071
    this.flash(pos, color, radius * 2.6, 0.38)
    this.ring(pos, color, radius * 2.4, 0.5, 0.8)
    this.torus(pos, gold, radius * 2.05, 0.66, 0.72)
    this.sparks(pos, color, 12 + level * 4, 3 + level * 0.3)

    if (level >= 4) {
      this.petals(pos, 5 + level, radius * 1.35, 0.8)
    }
  }

  /** 双珠化光：白闪 + 双环 + 金莲 + 大面积金粉 */
  maxMerge(pos: THREE.Vector3): void {
    this.flash(pos, 0xfff3d0, 3.2, 0.46)
    this.ring(pos, 0xffe9a8, 4.4, 0.78, 0.86)
    this.ring(pos, 0xc9a063, 3.05, 0.58, 0.8)
    this.torus(pos, 0x3e7a63, 3.6, 0.9, 0.72)
    this.sparks(pos, 0xffe9a8, 44, 5.6)
    this.petals(pos, 30, 3.2, 1.1)
    this.petals(pos, 14, 4.8, 1.3)
  }

  private flash(pos: THREE.Vector3, color: number, size: number, dur: number): void {
    const mat = glowSpriteMaterial(color, 0.82)
    mat.map = glowTexture()
    const sprite = new THREE.Sprite(mat)
    sprite.position.copy(pos)
    sprite.scale.setScalar(0.2)
    sprite.renderOrder = 5
    this.add({
      obj: sprite,
      t: 0,
      dur,
      tick: (k) => {
        const e = easeOutCubic(k)
        sprite.scale.setScalar(0.2 + (size - 0.2) * e)
        mat.opacity = 0.82 * Math.pow(1 - k, 1.6)
      },
      cleanup: () => mat.dispose(),
    })
  }

  private ring(pos: THREE.Vector3, color: number, radius: number, dur: number, opacity: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(ringGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.copy(pos)
    mesh.position.y += 0.015
    mesh.renderOrder = 4
    this.add({
      obj: mesh,
      t: 0,
      dur,
      tick: (k) => {
        const e = easeOutCubic(k)
        mesh.scale.setScalar(0.25 + radius * e)
        mat.opacity = opacity * (1 - k)
      },
      cleanup: () => mat.dispose(),
    })
  }

  private torus(
    pos: THREE.Vector3,
    color: number,
    radius: number,
    dur: number,
    opacity: number,
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(torusGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.copy(pos)
    mesh.position.y += 0.03
    mesh.renderOrder = 4
    this.add({
      obj: mesh,
      t: 0,
      dur,
      tick: (k) => {
        const e = easeOutCubic(k)
        mesh.scale.setScalar(0.3 + radius * e)
        mat.opacity = opacity * (1 - k)
      },
      cleanup: () => mat.dispose(),
    })
  }

  private sparks(pos: THREE.Vector3, color: number, count: number, speed: number): void {
    const n = Math.max(4, Math.min(count, Math.floor(this.q.particles * 0.6)))
    const positions = new Float32Array(n * 3)
    const velocities: number[] = []
    const rnd = Math.random
    for (let i = 0; i < n; i++) {
      const theta = rnd() * Math.PI * 2
      const phi = rnd() * Math.PI * 0.7
      const v = speed * (0.4 + rnd() * 0.9)
      velocities.push(
        Math.cos(theta) * Math.sin(phi) * v,
        Math.cos(phi) * v + 1.2,
        Math.sin(theta) * Math.sin(phi) * v,
      )
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.095,
      map: glowTexture(),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    })
    const points = new THREE.Points(geo, mat)
    points.position.copy(pos)
    points.renderOrder = 4
    const dur = 0.85
    this.add({
      obj: points,
      t: 0,
      dur,
      tick: (k) => {
        const t = k * dur
        const arr = geo.getAttribute('position') as THREE.BufferAttribute
        const data = arr.array as Float32Array
        for (let i = 0; i < n; i++) {
          data[i * 3] = velocities[i * 3] * t
          data[i * 3 + 1] = velocities[i * 3 + 1] * t - 4.6 * t * t
          data[i * 3 + 2] = velocities[i * 3 + 2] * t
        }
        arr.needsUpdate = true
        mat.opacity = 1 - k
      },
      cleanup: () => {
        geo.dispose()
        mat.dispose()
      },
    })
  }

  private petals(pos: THREE.Vector3, count: number, radius: number, dur: number): void {
    const n = Math.max(6, Math.min(count, this.q.particles))
    const positions = new Float32Array(n * 3)
    const seeds: Array<{ angle: number; r: number; rise: number; spin: number }> = []
    const rnd = Math.random
    for (let i = 0; i < n; i++) {
      const angle = rnd() * Math.PI * 2
      const r = radius * (0.15 + rnd() * 0.9)
      seeds.push({ angle, r, rise: 1.2 + rnd() * 3.4, spin: rnd() * 6.28 })
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.38,
      map: petalTexture(),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    })
    const points = new THREE.Points(geo, mat)
    points.position.copy(pos)
    points.renderOrder = 4
    this.add({
      obj: points,
      t: 0,
      dur,
      tick: (k) => {
        const t = k * dur
        const arr = geo.getAttribute('position') as THREE.BufferAttribute
        const data = arr.array as Float32Array
        for (let i = 0; i < n; i++) {
          const s = seeds[i]
          const rr = s.r * (0.4 + t * 1.4)
          data[i * 3] = Math.cos(s.angle + t * s.spin) * rr
          data[i * 3 + 1] = s.rise * t - 1.4 * t * t
          data[i * 3 + 2] = Math.sin(s.angle + t * s.spin) * rr
        }
        arr.needsUpdate = true
        mat.opacity = 0.95 * (1 - k)
      },
      cleanup: () => {
        geo.dispose()
        mat.dispose()
      },
    })
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      item.t += dt
      const k = Math.min(1, item.t / item.dur)
      item.tick(k)
      if (k >= 1) {
        this.scene.remove(item.obj)
        item.cleanup()
        this.items.splice(i, 1)
      }
    }
  }

  /** 重开时立刻清空所有特效 */
  clear(): void {
    for (const item of this.items) {
      this.scene.remove(item.obj)
      item.cleanup()
    }
    this.items.length = 0
  }
}
