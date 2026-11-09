import * as THREE from 'three'
import { C } from './palette.ts'
import { LEVELS } from '../config.ts'
import type { PearlKind } from '../config.ts'
import type { QualitySettings } from './quality.ts'
import {
  amberFlowTexture,
  goldFleckTexture,
  iceCrackNormal,
  silkGlowTexture,
  silkTexture,
  stoneTexture,
  woodTexture,
} from './textures.ts'

/* ------------------------------------------------------------------ */
/* 木作 / 铜活 / 绢纱                                                   */
/* ------------------------------------------------------------------ */

let woodMat: THREE.MeshPhysicalMaterial | null = null
let brassMat: THREE.MeshPhysicalMaterial | null = null
let jadeSlabMat: THREE.MeshPhysicalMaterial | null = null

export function woodMaterial(): THREE.MeshPhysicalMaterial {
  if (!woodMat) {
    woodMat = new THREE.MeshPhysicalMaterial({
      map: woodTexture(),
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.65,
      emissive: new THREE.Color(0x1b0d07),
      emissiveIntensity: 0.25,
    })
    woodMat.name = 'rosewood'
  }
  return woodMat
}


export function brassMaterial(): THREE.MeshPhysicalMaterial {
  if (!brassMat) {
    brassMat = new THREE.MeshPhysicalMaterial({
      color: C.bronze,
      metalness: 1,
      roughness: 0.38,
      clearcoat: 0.2,
      clearcoatRoughness: 0.4,
      envMapIntensity: 1.35,
      emissive: new THREE.Color(0x2a1708),
      emissiveIntensity: 0.16,
    })
    brassMat.name = 'patina-brass'
  }
  return brassMat
}

export function jadeSlabMaterial(q: QualitySettings): THREE.MeshPhysicalMaterial {
  if (!jadeSlabMat) {
    jadeSlabMat = new THREE.MeshPhysicalMaterial({
      color: C.jadeSlab,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
      transmission: q.transmission ? 0.18 : 0,
      thickness: 0.4,
      ior: 1.5,
      attenuationColor: new THREE.Color(0x183a30),
      attenuationDistance: 2.4,
      envMapIntensity: 0.6,
    })
    jadeSlabMat.name = 'jade-slab'
  }
  return jadeSlabMat
}

/** 每个面单独一份材质，方便近面淡出 */
export function silkMaterial(opacity = 0.24): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map: silkTexture(),
    color: 0xe8d9b8,
    transparent: true,
    opacity,
    roughness: 0.58,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: 0xffb877,
    emissiveMap: silkGlowTexture(),
    emissiveIntensity: 0.55,
    envMapIntensity: 0.35,
  })
  mat.name = 'silk-gauze'
  return mat
}

/* ------------------------------------------------------------------ */
/* 秋日庭院                                                            */
/* ------------------------------------------------------------------ */

let stoneMat: THREE.MeshStandardMaterial | null = null


export function stoneMaterial(): THREE.MeshStandardMaterial {
  if (!stoneMat) {
    const tex = stoneTexture().clone()
    tex.needsUpdate = true
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2.2, 2.2)
    stoneMat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0x8f8678,
      roughness: 0.6,
      metalness: 0,
      envMapIntensity: 0.4,
    })
    stoneMat.name = 'courtyard-stone'
  }
  return stoneMat
}


export function celadonMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x8fae9e,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.8,
  })
}

/* ------------------------------------------------------------------ */
/* 七宝珠                                                              */
/* ------------------------------------------------------------------ */

const pearlCache = new Map<PearlKind, THREE.MeshPhysicalMaterial>()

export function pearlMaterial(kind: PearlKind, q: QualitySettings): THREE.MeshPhysicalMaterial {
  const cached = pearlCache.get(kind)
  if (cached) return cached

  const def = LEVELS.find((l) => l.kind === kind)!
  const base = {
    color: def.color,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 1,
  }
  let mat: THREE.MeshPhysicalMaterial

  switch (kind) {
    case 'conch':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        iridescence: 0.3,
        iridescenceIOR: 1.25,
        iridescenceThicknessMinimum: 200,
        iridescenceThicknessMaximum: 620,
      })
      break
    case 'coral':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.58,
        clearcoat: 0.2,
        clearcoatRoughness: 0.5,
        sheen: 0.35,
        sheenColor: new THREE.Color(0xff9a80),
        sheenRoughness: 0.6,
        emissive: new THREE.Color(0x3a0a06),
        emissiveIntensity: 0.25,
      })
      break
    case 'amber':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.24,
        clearcoat: 0.85,
        clearcoatRoughness: 0.15,
        transmission: q.transmission ? 0.32 : 0,
        thickness: 0.6,
        ior: 1.45,
        attenuationColor: new THREE.Color(0x7a3d0c),
        attenuationDistance: 1.2,
        emissive: new THREE.Color(0xff9a3c),
        emissiveMap: amberFlowTexture(),
        emissiveIntensity: 0.4,
      })
      break
    case 'jade':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.3,
        clearcoat: 0.5,
        clearcoatRoughness: 0.3,
        transmission: q.transmission ? 0.25 : 0,
        thickness: 0.5,
        ior: 1.5,
        attenuationColor: new THREE.Color(0x1f5a44),
        attenuationDistance: 1.6,
        normalMap: iceCrackNormal(),
        normalScale: new THREE.Vector2(0.32, 0.32),
      })
      break
    case 'glass':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.07,
        metalness: 0.85,
        metalnessMap: goldFleckTexture(),
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transmission: q.transmission ? 0.5 : 0,
        thickness: 0.9,
        ior: 1.5,
        attenuationColor: new THREE.Color(0x123a5c),
        attenuationDistance: 1.8,
        envMapIntensity: 1.25,
      })
      break
    case 'amethyst':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.14,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        transmission: q.transmission ? 0.36 : 0,
        thickness: 0.7,
        ior: 1.55,
        attenuationColor: new THREE.Color(0x3a1f5c),
        attenuationDistance: 1.4,
        iridescence: 0.12,
        envMapIntensity: 1.2,
      })
      break
    case 'night':
      mat = new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        emissive: new THREE.Color(def.glow),
        emissiveIntensity: 0.8,
        iridescence: 0.18,
        envMapIntensity: 0.85,
      })
      break
  }

  mat.name = `pearl-${kind}`
  pearlCache.set(kind, mat)
  return mat
}


export function glowSpriteMaterial(color: number, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
}
