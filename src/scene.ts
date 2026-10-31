import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BOX_SIZE, BOX_HALF } from './config.ts'

export interface SceneKit {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  /** 落点预览组（定位在落点 x/z，含上表面光环 + 垂直虚线） */
  aim: THREE.Group
  aimRing: THREE.Mesh
}

export function createScene(container: HTMLElement): SceneKit {
  // ---- 渲染器 ----
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // ---- 场景与雾 ----
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0f1e)
  scene.fog = new THREE.Fog(0x0a0f1e, 26, 85)

  // ---- 相机与轨道控制（面板外拖动旋转 / 滚轮缩放）----
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300)
  camera.position.set(7.2, 8.2, 10.2)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 6
  controls.maxDistance = 32
  controls.maxPolarAngle = 1.45 // 不允许钻到盒子下方
  controls.target.set(0, -0.4, 0)

  // ---- 灯光 ----
  scene.add(new THREE.AmbientLight(0x8fa3c8, 0.6))

  const sun = new THREE.DirectionalLight(0xffffff, 2.1)
  sun.position.set(8, 13, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -10
  sun.shadow.camera.right = 10
  sun.shadow.camera.top = 10
  sun.shadow.camera.bottom = -10
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 50
  sun.shadow.bias = -0.0005
  scene.add(sun)

  const back = new THREE.DirectionalLight(0x6ea8ff, 0.55)
  back.position.set(-8, 5, -10)
  scene.add(back)

  // ---- 正方体容器：半透明面 + 线框 + 顶面高亮 ----
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE),
    new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  scene.add(glass)

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE)),
    new THREE.LineBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.85 }),
  )
  scene.add(edges)

  const topY = BOX_HALF
  const topFrame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-BOX_HALF, topY, -BOX_HALF),
      new THREE.Vector3(BOX_HALF, topY, -BOX_HALF),
      new THREE.Vector3(BOX_HALF, topY, BOX_HALF),
      new THREE.Vector3(-BOX_HALF, topY, BOX_HALF),
    ]),
    new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 1 }),
  )
  scene.add(topFrame)

  // ---- 阴影承接面 + 地面网格 ----
  const shadowGround = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ opacity: 0.38 }),
  )
  shadowGround.rotation.x = -Math.PI / 2
  shadowGround.position.y = -BOX_HALF + 0.006
  shadowGround.receiveShadow = true
  scene.add(shadowGround)

  const grid = new THREE.GridHelper(34, 17, 0x2a3a5f, 0x1a2540)
  grid.position.y = -BOX_HALF - 0.04
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.55
  scene.add(grid)

  // ---- 落点预览指示器 ----
  const aim = new THREE.Group()
  aim.visible = false

  const aimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  aimRing.rotation.x = -Math.PI / 2
  aimRing.position.y = BOX_HALF + 0.02
  aim.add(aimRing)

  const aimLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, BOX_HALF, 0),
      new THREE.Vector3(0, -BOX_HALF, 0),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xffd166,
      dashSize: 0.28,
      gapSize: 0.2,
      transparent: true,
      opacity: 0.55,
    }),
  )
  aimLine.computeLineDistances()
  aim.add(aimLine)

  scene.add(aim)

  // ---- 自适应窗口 ----
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, controls, aim, aimRing }
}
