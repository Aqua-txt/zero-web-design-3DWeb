import * as THREE from 'three'
import type { QualitySettings } from './quality.ts'

export interface Lights {
  sun: THREE.DirectionalLight
}

/** 秋日下午：暖阳 + 天光 + 冷色反光 */
export function createLights(scene: THREE.Scene, q: QualitySettings): Lights {
  const hemi = new THREE.HemisphereLight(0xd6e8f5, 0x8a6a4a, 0.55)
  hemi.name = 'sky-light'
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xffe0b0, 4.2)
  sun.name = 'autumn-sun'
  sun.position.set(-24, 26, -10)
  sun.target.position.set(0, -1.5, 0)
  sun.castShadow = q.shadows
  if (q.shadows) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap)
    sun.shadow.camera.left = -30
    sun.shadow.camera.right = 30
    sun.shadow.camera.top = 30
    sun.shadow.camera.bottom = -30
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 90
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.035
    sun.shadow.radius = 3
  }
  scene.add(sun)
  scene.add(sun.target)

  const fill = new THREE.DirectionalLight(0xbcd6e6, 0.28)
  fill.name = 'sky-fill'
  fill.position.set(14, 9, 8)
  scene.add(fill)

  const frontFill = new THREE.DirectionalLight(0xffd7ad, 0.55)
  frontFill.name = 'court-fill'
  frontFill.position.set(18, 8, 16)
  scene.add(frontFill)

  const bounce = new THREE.DirectionalLight(0xffcf9a, 0.18)
  bounce.name = 'stone-bounce'
  bounce.position.set(8, -2, 12)
  scene.add(bounce)

  return { sun }
}
