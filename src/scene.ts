import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BOX_HALF } from './config.ts'
import { createCourtyard, type Courtyard } from './art/courtyard.ts'
import { FX } from './art/fx.ts'
import { createLantern, type Lantern } from './art/lantern.ts'
import { createLights } from './art/lighting.ts'
import { detectQuality, qualitySettings, type QualitySettings } from './art/quality.ts'

export interface SceneKit {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  quality: QualitySettings
  fx: FX
  /** 落点预览组（定位在落点 x/z，含上表面光环 + 垂直虚线） */
  aim: THREE.Group
  aimRing: THREE.Mesh
  update(dt: number): void
  render(): void
  resize(): void
}

const BASE_CAMERA = new THREE.Vector3(14.5, 11.5, 23.5)

function createAim(): { aim: THREE.Group; aimRing: THREE.Mesh } {
  const aim = new THREE.Group()
  aim.visible = false

  const vermilion = new THREE.MeshBasicMaterial({
    color: 0xb23a2e,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), vermilion)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = BOX_HALF + 0.03
  aim.add(ring)

  const jade = new THREE.MeshBasicMaterial({
    color: 0x3e7a63,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.63, 64), jade)
  inner.rotation.x = -Math.PI / 2
  inner.position.y = BOX_HALF + 0.032
  aim.add(inner)

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, BOX_HALF, 0),
      new THREE.Vector3(0, -BOX_HALF, 0),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xb23a2e,
      dashSize: 0.24,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  )
  line.computeLineDistances()
  aim.add(line)

  return { aim, aimRing: ring }
}

export function createScene(container: HTMLElement): SceneKit {
  const tier = detectQuality()
  const quality = qualitySettings(tier)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(quality.dpr)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.07
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    44,
    window.innerWidth / window.innerHeight,
    0.1,
    220,
  )
  camera.position.copy(BASE_CAMERA)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.rotateSpeed = 0.65
  controls.zoomSpeed = 0.7
  controls.minDistance = 17
  controls.maxDistance = 50
  controls.maxPolarAngle = 1.46
  controls.target.set(0, -1.0, 0)

  const courtyard: Courtyard = createCourtyard(scene, renderer, quality)
  createLights(scene, quality)
  const lantern: Lantern = createLantern(quality)
  scene.add(lantern.group)

  const fx = new FX(scene, quality)
  const { aim, aimRing } = createAim()
  scene.add(aim)

  let layoutKey = ''
  const frameForViewport = (force = false): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    const aspect = w / h
    const key = aspect < 0.9 ? 'portrait' : w < 1500 ? 'medium' : 'large'
    if (!force && key === layoutKey) return
    layoutKey = key
    const scale = key === 'portrait' ? 1.55 : key === 'medium' ? 1.04 : 1
    camera.position.copy(BASE_CAMERA).multiplyScalar(scale)
    controls.target.set(0, key === 'portrait' ? -2.2 : -1.0, 0)
    controls.update()
  }
  frameForViewport(true)

  const resize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    frameForViewport()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', resize)

  let elapsed = 0

  const update = (dt: number): void => {
    elapsed += dt
    controls.update()
    lantern.update(camera, dt)
    courtyard.update(dt)
    fx.update(dt)

    const ringMat = aimRing.material as THREE.MeshBasicMaterial
    ringMat.opacity = 0.78 + Math.sin(elapsed * 3.1) * 0.1
  }

  const render = (): void => {
    renderer.render(scene, camera)
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    quality,
    fx,
    aim,
    aimRing,
    update,
    render,
    resize,
  }
}
