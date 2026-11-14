import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUB_CORE_ANCHOR, ROOM_CAMERAS } from '../data/homeState.ts';
import type {
  CameraPose,
  HomeEntity,
  ProjectedPin,
  RoomId,
  SignalArcEvent,
  TimeOfDay,
} from '../types/home.ts';
import { createArchitecturalTextures } from './proceduralTextures.ts';

export interface ResidenceSceneCallbacks {
  onModelLoaded?: () => void;
  onPinsProjected?: (pins: ProjectedPin[]) => void;
}

interface ActiveArc {
  id: string;
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  orb: THREE.Mesh;
  ring: THREE.Mesh;
  born: number;
  duration: number;
}

function buildTwilightEnvironment(renderer: THREE.WebGLRenderer, timeOfDay: TimeOfDay): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const skyGeo = new THREE.SphereGeometry(40, 24, 16);
  const pos = skyGeo.attributes.position;
  const colors: number[] = [];

  const topColor =
    timeOfDay === 'day'
      ? new THREE.Color('#6ba6e8')
      : timeOfDay === 'night'
        ? new THREE.Color('#070b14')
        : new THREE.Color('#13203b');
  const horizonColor =
    timeOfDay === 'day'
      ? new THREE.Color('#dce9f7')
      : timeOfDay === 'night'
        ? new THREE.Color('#10192b')
        : new THREE.Color('#3c5275');
  const sunsetGlow =
    timeOfDay === 'day'
      ? new THREE.Color('#fff4df')
      : timeOfDay === 'night'
        ? new THREE.Color('#1a2744')
        : new THREE.Color('#e39c58');
  const groundColor = new THREE.Color('#0b0e14');

  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const h = THREE.MathUtils.clamp(vy / 40, -1, 1);
    if (h >= 0) {
      tmp.copy(horizonColor).lerp(topColor, Math.pow(h, 0.62));
      const westWarmth = Math.max(0, -vx / 40) * (1 - Math.min(1, h * 1.8));
      tmp.lerp(sunsetGlow, westWarmth * 0.65);
    } else {
      tmp.copy(horizonColor).lerp(groundColor, Math.min(1, -h * 2.5));
    }
    colors.push(tmp.r, tmp.g, tmp.b);
    void vz;
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Soft bounce cards for crisp architectural glass & bronze highlights
  const warmCard = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 8),
    new THREE.MeshBasicMaterial({
      color: timeOfDay === 'day' ? '#ffffff' : '#ffcf91',
      side: THREE.DoubleSide,
    }),
  );
  warmCard.position.set(-22, 10, 14);
  warmCard.lookAt(0, 2, 0);
  envScene.add(warmCard);

  const rt = pmrem.fromScene(envScene, 0.035);
  skyGeo.dispose();
  skyMat.dispose();
  warmCard.geometry.dispose();
  (warmCard.material as THREE.Material).dispose();
  pmrem.dispose();
  return rt.texture;
}

export class ResidenceSceneController {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private textures = createArchitecturalTextures();
  private envCache: Partial<Record<TimeOfDay, THREE.Texture>> = {};
  private isSoftwareWebGL = false;

  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;

  // 4 optimized architectural zone lights (high warmth, low fragment-shader loop overhead)
  private roomLights = {
    livingZone: new THREE.PointLight('#ffc982', 0, 13.5, 1.45),
    kitchenHallZone: new THREE.PointLight('#ffd296', 0, 13.0, 1.45),
    bedroomZone: new THREE.PointLight('#ffca85', 0, 12.5, 1.45),
    courtyardZone: new THREE.PointLight('#ffc275', 0, 11.5, 1.55),
  };

  private targetLightIntensities: Record<keyof ResidenceSceneController['roomLights'], number> = {
    livingZone: 4.4,
    kitchenHallZone: 3.8,
    bedroomZone: 3.5,
    courtyardZone: 2.2,
  };

  private bedroomLightColorTarget = new THREE.Color('#ffca85');
  private livingLampTargetOpacity = 0.85;
  private nightStripTargetOpacity = 0;
  private lastEmittedPins: ProjectedPin[] = [];
  private forcePinSync = true;

  // Dynamic architectural assemblies
  private waterMesh!: THREE.Mesh;
  private livingCurtainLeft!: THREE.Mesh;
  private livingCurtainRight!: THREE.Mesh;
  private bedroomCurtainLeft!: THREE.Mesh;
  private bedroomCurtainRight!: THREE.Mesh;
  private garageSlats: THREE.Mesh[] = [];
  private lockRingMesh!: THREE.Mesh;
  private lockHaloSprite!: THREE.Sprite;
  private hubHaloSprite!: THREE.Sprite;
  private livingLampSprite!: THREE.Sprite;
  private nightCoveStrip!: THREE.Mesh;
  private hvacParticles!: THREE.Points;

  private livingCurtainTarget = 1; // 1 = open, 0 = closed
  private livingCurtainCurrent = 1;
  private bedroomCurtainTarget = 1;
  private bedroomCurtainCurrent = 1;
  private garageOpenTarget = 0; // 0 = closed, 1 = open
  private garageOpenCurrent = 0;
  private lockVisualMode: 'unlocked' | 'locked' | 'waiting_approval' = 'unlocked';
  private hvacActive = true;

  // Camera choreography
  private desiredCamPos = new THREE.Vector3(...ROOM_CAMERAS.overview.position);
  private desiredCamTarget = new THREE.Vector3(...ROOM_CAMERAS.overview.target);
  private currentCamPos = new THREE.Vector3(...ROOM_CAMERAS.overview.position);
  private currentCamTarget = new THREE.Vector3(...ROOM_CAMERAS.overview.target);
  private desiredOffsetRatioX = 0;
  private currentOffsetRatioX = 0;
  private roamEnabled = false;
  private userDragging = false;

  // Signal arcs & projected pins
  private activeArcs: ActiveArc[] = [];
  private entitiesSnapshot: HomeEntity[] = [];
  private activeRoom: RoomId = 'overview';
  private timeOfDay: TimeOfDay = 'dusk';

  private rafId = 0;
  private disposed = false;
  private isVisible = true;
  private width = 1;
  private height = 1;
  private frameCounter = 0;
  private clock = new THREE.Clock();
  private callbacks: ResidenceSceneCallbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: ResidenceSceneCallbacks = {}) {
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const isMobile = window.innerWidth < 768;
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareWebGL = /swiftshader|llvmpipe|software/i.test(unmaskedRenderer);
    this.isSoftwareWebGL = isSoftwareWebGL;

    this.renderer.setPixelRatio(
      isSoftwareWebGL ? 1 : Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2),
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = !isSoftwareWebGL;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090d16');
    this.scene.fog = new THREE.FogExp2('#090d16', 0.016);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.2, 120);
    this.camera.position.copy(this.currentCamPos);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 28;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = Math.PI * 0.08;
    this.controls.enabled = false;
    this.controls.target.copy(this.currentCamTarget);

    this.controls.addEventListener('start', () => {
      this.userDragging = true;
    });
    this.controls.addEventListener('end', () => {
      this.userDragging = false;
      this.desiredCamPos.copy(this.camera.position);
      this.desiredCamTarget.copy(this.controls.target);
    });

    // Exterior architectural lighting
    this.hemiLight = new THREE.HemisphereLight('#7aa6e8', '#1b1815', 0.62);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight('#ffd7a8', 1.35);
    this.dirLight.position.set(-16, 19, 14);
    this.dirLight.castShadow = !isSoftwareWebGL;
    if (!isSoftwareWebGL) {
      this.dirLight.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
      this.dirLight.shadow.camera.near = 2;
      this.dirLight.shadow.camera.far = 52;
      const d = 16;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight('#479ef5', 0.55);
    this.rimLight.position.set(15, 11, -12);
    this.scene.add(this.rimLight);

    this.setupGroundPlane();
    this.setupInteriorLights();
    this.setupDynamicAssemblies();
    this.applyTimeOfDay('dusk');
    this.loadArchitecturalGlb();

    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    this.animate();
  }

  private setupGroundPlane(): void {
    // Subtle infinite architectural dusk horizon plane
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(68, 48),
      new THREE.MeshStandardMaterial({
        color: '#0b0f18',
        roughness: 0.94,
        metalness: 0.05,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.51;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Subtle architectural site grid rings around residence
    const ringGeo = new THREE.RingGeometry(15.5, 15.56, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#479ef5',
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0.5, -0.48, 0.5);
    this.scene.add(ring);
  }

  private setupInteriorLights(): void {
    const L = this.roomLights;
    L.livingZone.position.set(-5.15, 2.52, -0.85);
    L.kitchenHallZone.position.set(3.85, 2.28, -0.35);
    L.bedroomZone.position.set(-3.4, 4.55, -2.05);
    L.courtyardZone.position.set(2.1, 1.25, 5.25);

    for (const light of Object.values(L)) {
      this.scene.add(light);
    }
  }

  private setupDynamicAssemblies(): void {
    // 1. Reflecting Courtyard Water Pool ("泽")
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: '#102338',
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      bumpMap: this.textures.waterNormal,
      bumpScale: 0.025,
      envMapIntensity: 2.1,
      transparent: true,
      opacity: 0.92,
    });
    this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 3.72), waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(-3.5, -0.02, 5.4);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // 2. Motorized Pleated Linen Curtains (Living Room & Master Suite)
    const curtainMat = new THREE.MeshStandardMaterial({
      color: '#dfd8cc',
      roughness: 0.88,
      metalness: 0.0,
      bumpMap: this.textures.linenBump,
      bumpScale: 0.015,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });

    const buildCurtainPanel = (width: number, height: number, anchorLeft: boolean) => {
      const geo = new THREE.PlaneGeometry(width, height, 18, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        // Shift origin to outer edge so scale.x smoothly opens/closes from the wall!
        const shiftedX = anchorLeft ? x + width / 2 : x - width / 2;
        const pleat = Math.sin((i % 19) * 1.45) * 0.045;
        pos.setX(i, shiftedX);
        pos.setZ(i, pleat);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, curtainMat);
      return mesh;
    };

    // Living curtains: X span -8.35 .. -1.35 (total 7.0m -> two 3.5m halves), Y: 1.58 (height 3.0m), Z: 3.08
    this.livingCurtainLeft = buildCurtainPanel(3.48, 2.98, true);
    this.livingCurtainLeft.position.set(-8.34, 1.58, 3.08);
    this.livingCurtainRight = buildCurtainPanel(3.48, 2.98, false);
    this.livingCurtainRight.position.set(-1.36, 1.58, 3.08);
    this.scene.add(this.livingCurtainLeft, this.livingCurtainRight);

    // Bedroom curtains: X span -7.55 .. +2.72 (total 10.27m -> two 5.12m halves), Y: 4.86 (height 2.86m), Z: 2.72
    this.bedroomCurtainLeft = buildCurtainPanel(5.12, 2.84, true);
    this.bedroomCurtainLeft.position.set(-7.55, 4.86, 2.72);
    this.bedroomCurtainRight = buildCurtainPanel(5.12, 2.84, false);
    this.bedroomCurtainRight.position.set(2.72, 4.86, 2.72);
    this.scene.add(this.bedroomCurtainLeft, this.bedroomCurtainRight);

    // 3. Motorized Slatted Cedar Garage Gate (X = 9.5, Y = 0.08..2.54, Z = 2.36)
    const slatMat = new THREE.MeshStandardMaterial({
      color: '#7c5335',
      map: this.textures.walnutColor,
      roughnessMap: this.textures.walnutRoughness,
      roughness: 0.56,
      metalness: 0.08,
    });
    for (let i = 0; i < 6; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(3.16, 0.39, 0.08), slatMat);
      slat.position.set(9.5, 0.24 + i * 0.41, 2.36);
      slat.castShadow = true;
      slat.receiveShadow = true;
      this.garageSlats.push(slat);
      this.scene.add(slat);
    }

    // 4. Smart Front Door Lock Security Halo & Beacon (lock.front_door)
    const lockRingMat = new THREE.MeshBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    this.lockRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.155, 28), lockRingMat);
    this.lockRingMesh.position.set(1.18, 1.24, 3.31);
    this.scene.add(this.lockRingMesh);

    this.lockHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glowSprite,
        color: '#60a5fa',
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.lockHaloSprite.position.set(1.18, 1.24, 3.34);
    this.lockHaloSprite.scale.set(0.65, 0.65, 1);
    this.scene.add(this.lockHaloSprite);

    // 5. Cangze Hub Core Sapphire Halo & Living Lamp Warm Halo + Bedroom Under-Bed Night Strip
    this.hubHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glowSprite,
        color: '#479ef5',
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.hubHaloSprite.position.set(...HUB_CORE_ANCHOR);
    this.hubHaloSprite.scale.set(0.95, 0.95, 1);
    this.scene.add(this.hubHaloSprite);

    this.livingLampSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glowSprite,
        color: '#ffd296',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.livingLampSprite.position.set(-6.48, 2.02, -1.9);
    this.livingLampSprite.scale.set(1.1, 1.1, 1);
    this.scene.add(this.livingLampSprite);

    this.nightCoveStrip = new THREE.Mesh(
      new THREE.BoxGeometry(2.76, 0.04, 2.34),
      new THREE.MeshBasicMaterial({
        color: '#ffb663',
        transparent: true,
        opacity: 0,
      }),
    );
    this.nightCoveStrip.position.set(-3.4, 3.47, -2.02);
    this.scene.add(this.nightCoveStrip);

    // 6. Subtle Laminar Climate Airflow Micro-Motes
    const pCount = 36;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const upstairs = i >= pCount / 2;
      pPos[i * 3] = upstairs ? -4.2 + (i % 9) * 0.2 : -5.6 + (i % 9) * 0.2;
      pPos[i * 3 + 1] = upstairs ? 5.65 - (i % 4) * 0.25 : 2.72 - (i % 4) * 0.22;
      pPos[i * 3 + 2] = -3.4 + (i % 6) * 0.35;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    this.hvacParticles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: '#8ecaff',
        size: 0.06,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(this.hvacParticles);
  }

  private loadArchitecturalGlb(): void {
    const loader = new GLTFLoader();
    loader.load(
      './models/cangze-residence.glb',
      (gltf) => {
        if (this.disposed) return;
        const root = gltf.scene;
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const mat = obj.material as THREE.MeshStandardMaterial | undefined;
          const mName = mat?.name ?? '';

          if (mName === 'ArchitecturalGlass') {
            obj.material = new THREE.MeshPhysicalMaterial({
              color: '#cbe5fb',
              transparent: true,
              opacity: 0.22,
              roughness: 0.05,
              metalness: 0.08,
              ior: 1.5,
              reflectivity: 0.88,
              clearcoat: 1.0,
              envMapIntensity: 1.85,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            obj.castShadow = false;
            obj.receiveShadow = false;
            return;
          }

          if (mat && mName === 'TravertineStone') {
            mat.map = this.textures.travertineColor;
            mat.bumpMap = this.textures.travertineBump;
            mat.bumpScale = 0.016;
            mat.envMapIntensity = 0.65;
            mat.needsUpdate = true;
          } else if (mat && (mName === 'OiledWalnut' || mName === 'WarmCedar')) {
            mat.map = this.textures.walnutColor;
            mat.roughnessMap = this.textures.walnutRoughness;
            mat.envMapIntensity = 0.85;
            mat.needsUpdate = true;
          } else if (mat && mName === 'BoucleLinen') {
            mat.bumpMap = this.textures.linenBump;
            mat.bumpScale = 0.018;
            mat.needsUpdate = true;
          } else if (mat && mName === 'BrushedBronze') {
            mat.envMapIntensity = 1.45;
            mat.needsUpdate = true;
          }

          obj.castShadow = true;
          obj.receiveShadow = true;
        });

        this.scene.add(root);
        this.callbacks.onModelLoaded?.();
      },
      undefined,
      (err) => {
        console.error('Failed to load cangze-residence.glb', err);
      },
    );
  }

  public applyTimeOfDay(tod: TimeOfDay): void {
    this.timeOfDay = tod;
    if (!this.isSoftwareWebGL) {
      if (!this.envCache[tod]) {
        this.envCache[tod] = buildTwilightEnvironment(this.renderer, tod);
      }
      this.scene.environment = this.envCache[tod] ?? null;
    }

    if (tod === 'day') {
      this.scene.background = new THREE.Color('#1a283d');
      this.scene.fog = new THREE.FogExp2('#1a283d', 0.011);
      this.hemiLight.color.set('#cfe4ff');
      this.hemiLight.groundColor.set('#3d362e');
      this.hemiLight.intensity = 1.18;
      this.dirLight.color.set('#fff3de');
      this.dirLight.intensity = 2.35;
      this.dirLight.position.set(-12, 24, 16);
      this.rimLight.intensity = 0.35;
      this.renderer.toneMappingExposure = 1.05;
    } else if (tod === 'night') {
      this.scene.background = new THREE.Color('#05080f');
      this.scene.fog = new THREE.FogExp2('#05080f', 0.019);
      this.hemiLight.color.set('#355284');
      this.hemiLight.groundColor.set('#0b0d12');
      this.hemiLight.intensity = 0.34;
      this.dirLight.color.set('#7fa8e8');
      this.dirLight.intensity = 0.52;
      this.dirLight.position.set(10, 20, 12);
      this.rimLight.intensity = 0.45;
      this.renderer.toneMappingExposure = 1.18;
    } else {
      // dusk (signature Cangze twilight atmosphere)
      this.scene.background = new THREE.Color('#090d16');
      this.scene.fog = new THREE.FogExp2('#090d16', 0.015);
      this.hemiLight.color.set('#7aa6e8');
      this.hemiLight.groundColor.set('#1c1814');
      this.hemiLight.intensity = 0.65;
      this.dirLight.color.set('#ffc996');
      this.dirLight.intensity = 1.28;
      this.dirLight.position.set(-17, 15, 14);
      this.rimLight.intensity = 0.58;
      this.renderer.toneMappingExposure = 1.14;
    }
  }

  public syncEntities(entities: HomeEntity[], waitingLockApproval = false): void {
    this.entitiesSnapshot = entities;
    this.forcePinSync = true;
    const byId = new Map(entities.map((e) => [e.id, e]));

    const livCeil = byId.get('light.living_ceiling');
    const livLamp = byId.get('light.living_lamp');
    const ceilVal = livCeil?.state === 'on' ? ((livCeil.brightnessPct ?? 80) / 100) * 3.4 : 0;
    const lampVal = livLamp?.state === 'on' ? ((livLamp.brightnessPct ?? 70) / 100) * 2.2 : 0;
    this.targetLightIntensities.livingZone = ceilVal + lampVal;
    this.livingLampTargetOpacity = livLamp?.state === 'on' ? 0.88 : 0;

    const kitPend = byId.get('light.kitchen_pendant');
    const coffee = byId.get('switch.coffee_machine');
    const kitVal = kitPend?.state === 'on' ? ((kitPend.brightnessPct ?? 80) / 100) * 3.5 : 0;
    const coffeeVal = coffee?.state === 'on' ? 0.85 : 0;
    this.targetLightIntensities.kitchenHallZone = 0.75 + kitVal + coffeeVal;

    const bedLight = byId.get('light.bedroom_light');
    const bedNight = byId.get('light.bedroom_nightlight');
    const bedMainVal = bedLight?.state === 'on' ? ((bedLight.brightnessPct ?? 65) / 100) * 3.6 : 0;
    const bedNightVal =
      bedNight?.state === 'on' ? Math.max(0.85, ((bedNight.brightnessPct ?? 20) / 100) * 3.4) : 0;
    this.targetLightIntensities.bedroomZone = bedMainVal + bedNightVal;
    this.bedroomLightColorTarget.set(bedMainVal > 0.1 ? '#ffca85' : '#ffa74f');
    this.nightStripTargetOpacity = bedNight?.state === 'on' ? 0.88 : 0;

    const pathLight = byId.get('light.courtyard_path');
    this.targetLightIntensities.courtyardZone =
      pathLight?.state === 'on' ? ((pathLight.brightnessPct ?? 60) / 100) * 2.6 : 0;

    const livCurtain = byId.get('cover.living_curtain');
    this.livingCurtainTarget = livCurtain?.state === 'closed' ? 0 : (livCurtain?.positionPct ?? 100) / 100;

    const bedCurtain = byId.get('cover.bedroom_curtain');
    this.bedroomCurtainTarget = bedCurtain?.state === 'closed' ? 0 : (bedCurtain?.positionPct ?? 100) / 100;

    const garage = byId.get('cover.garage_door');
    this.garageOpenTarget = garage?.state === 'open' ? 1 : (garage?.positionPct ?? 0) / 100;

    const lock = byId.get('lock.front_door');
    if (waitingLockApproval) {
      this.lockVisualMode = 'waiting_approval';
    } else if (lock?.state === 'locked') {
      this.lockVisualMode = 'locked';
    } else {
      this.lockVisualMode = 'unlocked';
    }

    const livAc = byId.get('climate.living_thermostat');
    const bedAc = byId.get('climate.bedroom_ac');
    this.hvacActive = livAc?.state !== 'off' || bedAc?.state !== 'off';
  }

  public setCameraPose(pose: CameraPose, room: RoomId = 'overview', offsetRatioX = 0): void {
    this.activeRoom = room;
    this.forcePinSync = true;
    this.desiredCamPos.set(...pose.position);
    this.desiredCamTarget.set(...pose.target);
    this.desiredOffsetRatioX = offsetRatioX;
    if (pose.fov && Math.abs(this.camera.fov - pose.fov) > 0.2) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  public setRoamMode(enabled: boolean): void {
    this.roamEnabled = enabled;
    this.forcePinSync = true;
    this.controls.enabled = enabled;
    if (enabled) {
      this.desiredOffsetRatioX = 0;
    }
  }

  public emitSignalArc(event: SignalArcEvent): void {
    const start = new THREE.Vector3(...event.from);
    const end = new THREE.Vector3(...event.to);
    const mid = start.clone().lerp(end, 0.5);
    const dist = start.distanceTo(end);
    mid.y += Math.max(1.4, dist * 0.28);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(36);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

    const hex =
      event.kind === 'approval'
        ? '#f59e0b'
        : event.kind === 'conflict'
          ? '#f87171'
          : event.kind === 'allow'
            ? '#34d399'
            : '#479ef5';

    const lineMat = new THREE.LineBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.78,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshBasicMaterial({ color: hex }),
    );
    orb.position.copy(start);
    this.scene.add(orb);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 24),
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.copy(end);
    ring.lookAt(this.camera.position);
    this.scene.add(ring);

    this.activeArcs.push({
      id: event.id,
      curve,
      line,
      orb,
      ring,
      born: performance.now(),
      duration: 1850,
    });
  }

  public setVisibility(visible: boolean): void {
    this.isVisible = visible;
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.applyViewOffset();
  }

  private applyViewOffset(): void {
    if (Math.abs(this.currentOffsetRatioX) > 0.002 && this.width >= 1024) {
      const pixelShift = Math.round(this.width * this.currentOffsetRatioX);
      this.camera.setViewOffset(this.width, this.height, pixelShift, 0, this.width, this.height);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);
    if (!this.isVisible) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    const damp = 1 - Math.exp(-4.2 * dt);

    // 1. Camera smooth interpolation (unless user is actively orbiting)
    if (!this.userDragging) {
      if (!this.roamEnabled) {
        // Gentle architectural breathing drift in overview
        const swayX = this.activeRoom === 'overview' ? Math.sin(elapsed * 0.28) * 0.35 : 0;
        const swayY = this.activeRoom === 'overview' ? Math.cos(elapsed * 0.22) * 0.12 : 0;
        this.currentCamPos.x += (this.desiredCamPos.x + swayX - this.currentCamPos.x) * damp;
        this.currentCamPos.y += (this.desiredCamPos.y + swayY - this.currentCamPos.y) * damp;
        this.currentCamPos.z += (this.desiredCamPos.z - this.currentCamPos.z) * damp;
        this.currentCamTarget.lerp(this.desiredCamTarget, damp);

        this.camera.position.copy(this.currentCamPos);
        this.controls.target.copy(this.currentCamTarget);
        this.camera.lookAt(this.currentCamTarget);
      } else {
        this.controls.update();
      }
    } else {
      this.controls.update();
    }

    if (Math.abs(this.desiredOffsetRatioX - this.currentOffsetRatioX) > 0.001) {
      this.currentOffsetRatioX += (this.desiredOffsetRatioX - this.currentOffsetRatioX) * damp;
      this.applyViewOffset();
    }

    // 2. Smooth interior light transitions
    const lightLerp = 1 - Math.exp(-5.5 * dt);
    (Object.keys(this.roomLights) as Array<keyof typeof this.roomLights>).forEach((key) => {
      const light = this.roomLights[key];
      const target = this.targetLightIntensities[key];
      light.intensity += (target - light.intensity) * lightLerp;
    });
    this.roomLights.bedroomZone.color.lerp(this.bedroomLightColorTarget, lightLerp);

    // Sync emissive fixture sprites
    const lampMat = this.livingLampSprite.material as THREE.SpriteMaterial;
    lampMat.opacity += (this.livingLampTargetOpacity - lampMat.opacity) * lightLerp;

    const nightMat = this.nightCoveStrip.material as THREE.MeshBasicMaterial;
    nightMat.opacity += (this.nightStripTargetOpacity - nightMat.opacity) * lightLerp;

    const hubMat = this.hubHaloSprite.material as THREE.SpriteMaterial;
    hubMat.opacity = 0.52 + Math.sin(elapsed * 2.4) * 0.16;

    // 3. Smooth motorized curtains (1 = open compressed at edge, 0 = drawn shut)
    this.livingCurtainCurrent += (this.livingCurtainTarget - this.livingCurtainCurrent) * lightLerp;
    const livScale = THREE.MathUtils.lerp(1.0, 0.14, this.livingCurtainCurrent);
    this.livingCurtainLeft.scale.x = livScale;
    this.livingCurtainRight.scale.x = livScale;

    this.bedroomCurtainCurrent += (this.bedroomCurtainTarget - this.bedroomCurtainCurrent) * lightLerp;
    const bedScale = THREE.MathUtils.lerp(1.0, 0.13, this.bedroomCurtainCurrent);
    this.bedroomCurtainLeft.scale.x = bedScale;
    this.bedroomCurtainRight.scale.x = bedScale;

    // 4. Smooth slatted garage door retraction
    this.garageOpenCurrent += (this.garageOpenTarget - this.garageOpenCurrent) * lightLerp;
    for (let i = 0; i < this.garageSlats.length; i++) {
      const slat = this.garageSlats[i];
      const closedY = 0.24 + i * 0.41;
      const openY = 2.62;
      slat.position.y = THREE.MathUtils.lerp(closedY, openY, this.garageOpenCurrent);
      slat.position.z = THREE.MathUtils.lerp(2.36, 1.35 - i * 0.35, this.garageOpenCurrent);
      slat.rotation.x = this.garageOpenCurrent * (Math.PI * 0.48);
    }

    // 5. Smart Front Door Lock Security Halo
    const lockMat = this.lockRingMesh.material as THREE.MeshBasicMaterial;
    const lockSpriteMat = this.lockHaloSprite.material as THREE.SpriteMaterial;
    if (this.lockVisualMode === 'waiting_approval') {
      lockMat.color.set('#f59e0b');
      lockSpriteMat.color.set('#f59e0b');
      const pulse = 1 + Math.sin(elapsed * 6.5) * 0.28;
      this.lockRingMesh.scale.setScalar(pulse);
      lockSpriteMat.opacity = 0.65 + Math.sin(elapsed * 6.5) * 0.25;
    } else if (this.lockVisualMode === 'locked') {
      lockMat.color.set('#34d399');
      lockSpriteMat.color.set('#34d399');
      this.lockRingMesh.scale.setScalar(1.0);
      lockSpriteMat.opacity = 0.62;
    } else {
      lockMat.color.set('#60a5fa');
      lockSpriteMat.color.set('#60a5fa');
      this.lockRingMesh.scale.setScalar(1.0);
      lockSpriteMat.opacity = 0.48;
    }

    // 6. Reflecting Pool Water Ripple Drift & Climate Airflow Motes
    this.textures.waterNormal.offset.x = (elapsed * 0.018) % 1;
    this.textures.waterNormal.offset.y = (elapsed * 0.012) % 1;

    this.hvacParticles.visible = this.hvacActive;
    if (this.hvacActive) {
      const posAttr = this.hvacParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let z = posAttr.getZ(i) + dt * 0.42;
        if (z > -1.3) z = -3.6;
        posAttr.setZ(i, z);
      }
      posAttr.needsUpdate = true;
    }

    // 7. Update 3D Signal Arcs
    const now = performance.now();
    for (let i = this.activeArcs.length - 1; i >= 0; i--) {
      const arc = this.activeArcs[i];
      const t = (now - arc.born) / arc.duration;
      if (t >= 1) {
        this.scene.remove(arc.line, arc.orb, arc.ring);
        arc.line.geometry.dispose();
        (arc.line.material as THREE.Material).dispose();
        arc.orb.geometry.dispose();
        (arc.orb.material as THREE.Material).dispose();
        arc.ring.geometry.dispose();
        (arc.ring.material as THREE.Material).dispose();
        this.activeArcs.splice(i, 1);
      } else {
        const travel = Math.min(1, t * 1.35);
        arc.orb.position.copy(arc.curve.getPoint(travel));
        const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        (arc.line.material as THREE.LineBasicMaterial).opacity = 0.78 * fade;
        arc.ring.lookAt(this.camera.position);
        arc.ring.scale.setScalar(0.8 + t * 1.4);
        (arc.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      }
    }

    this.renderer.render(this.scene, this.camera);

    // 8. Project & de-overlap 3D device hotspot pins with delta gating (zero idle React churn)
    this.frameCounter++;
    if (this.frameCounter % 3 === 0 && this.callbacks.onPinsProjected && this.entitiesSnapshot.length > 0) {
      const candidates: Array<ProjectedPin & { priority: number }> = [];
      const v = new THREE.Vector3();
      for (const ent of this.entitiesSnapshot) {
        if (!ent.pinRooms.includes(this.activeRoom)) continue;
        v.set(...ent.anchor3d);
        const distance = v.distanceTo(this.camera.position);
        v.project(this.camera);
        const inFront = v.z >= -1 && v.z <= 1;
        const x = (v.x * 0.5 + 0.5) * this.width;
        const y = (-v.y * 0.5 + 0.5) * this.height;
        const onScreen = inFront && x > 40 && x < this.width - 40 && y > 82 && y < this.height - 64;
        const priority =
          ent.id === 'lock.front_door' && this.lockVisualMode === 'waiting_approval'
            ? 100
            : ent.highRisk
              ? 80
              : ent.domain === 'sensor'
                ? 20
                : 50;
        candidates.push({
          id: ent.id,
          x,
          y,
          visible: onScreen,
          distance,
          priority,
        });
      }

      // 2D Screen-space collision avoidance so badges never stack on top of one another
      candidates.sort((a, b) => b.priority - a.priority || a.distance - b.distance);
      const placed: ProjectedPin[] = [];
      for (const c of candidates) {
        if (!c.visible) {
          placed.push({ id: c.id, x: c.x, y: c.y, visible: false, distance: c.distance });
          continue;
        }
        let adjY = c.y;
        let blocked = false;
        for (let pass = 0; pass < 2; pass++) {
          for (const other of placed) {
            if (!other.visible) continue;
            const dx = Math.abs(c.x - other.x);
            const dy = Math.abs(adjY - other.y);
            if (dx < 168 && dy < 38) {
              const shift = 39 - dy;
              adjY += adjY >= other.y ? shift : -shift;
            }
          }
        }
        if (adjY < 80 || adjY > this.height - 62) {
          blocked = true;
        } else {
          for (const other of placed) {
            if (other.visible && Math.abs(c.x - other.x) < 156 && Math.abs(adjY - other.y) < 32) {
              blocked = true;
              break;
            }
          }
        }
        placed.push({
          id: c.id,
          x: c.x,
          y: adjY,
          visible: !blocked,
          distance: c.distance,
        });
      }
      placed.sort((a, b) => a.id.localeCompare(b.id));

      let changed = this.forcePinSync || placed.length !== this.lastEmittedPins.length;
      if (!changed) {
        for (let i = 0; i < placed.length; i++) {
          const cur = placed[i];
          const prev = this.lastEmittedPins[i];
          if (
            cur.id !== prev.id ||
            cur.visible !== prev.visible ||
            Math.abs(cur.x - prev.x) > 1.2 ||
            Math.abs(cur.y - prev.y) > 1.2
          ) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this.forcePinSync = false;
        this.lastEmittedPins = placed;
        this.callbacks.onPinsProjected(placed);
      }
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.controls.dispose();
    this.textures.dispose();
    Object.values(this.envCache).forEach((tex) => tex?.dispose());
    this.renderer.dispose();
  }

  public get currentTimeOfDay(): TimeOfDay {
    return this.timeOfDay;
  }
}
