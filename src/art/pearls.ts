import * as THREE from 'three'
import { LEVELS } from '../config.ts'
import { glowSpriteMaterial, pearlMaterial } from './materials.ts'
import type { QualitySettings } from './quality.ts'
import { glowTexture } from './textures.ts'

const geometries = new Map<number, THREE.SphereGeometry>()

/** 每一级共享一份球几何，避免重复分配 */
export function pearlGeometry(level: number): THREE.SphereGeometry {
  const cached = geometries.get(level)
  if (cached) return cached
  const geo = new THREE.SphereGeometry(LEVELS[level - 1].radius, 48, 32)
  geometries.set(level, geo)
  return geo
}

/** 建一颗七宝珠：主球 + 7 号的自发光光晕 */
export function createPearl(level: number, q: QualitySettings): THREE.Mesh {
  const def = LEVELS[level - 1]
  const mesh = new THREE.Mesh(pearlGeometry(level), pearlMaterial(def.kind, q))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = `pearl-${level}`

  if (def.kind === 'night') {
    const haloMat = glowSpriteMaterial(def.glow, q.tier === 'low' ? 0.32 : 0.5)
    haloMat.map = glowTexture()
    const halo = new THREE.Sprite(haloMat)
    halo.scale.setScalar(def.radius * 5.4)
    halo.renderOrder = 3
    mesh.add(halo)
  }

  return mesh
}

