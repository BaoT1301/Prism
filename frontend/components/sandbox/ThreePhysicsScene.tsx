import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from "three";

import { calculateFormula } from "../../features/sandbox/formula-registry";
import type { PersonalScene, PersonalSceneProp, SandboxSpec, VisualTheme } from "../../features/sandbox/sandbox-types";

type Props = {
  spec: SandboxSpec;
  values: Record<string, number>;
  runToken: number;
  active: boolean;
  onAvailability: (available: boolean) => void;
};

function objectLabel(theme: VisualTheme): string {
  return { basketball: "Basketball", formula1: "Formula 1 car", space: "Rocket" }[theme];
}

function defaultPersonalScene(theme: VisualTheme): PersonalScene {
  const defaults: Record<VisualTheme, PersonalScene> = {
    basketball: { setting: "court", primary_prop: "basketball", accent_props: [], mood: "sunset", label: "Your court" },
    formula1: { setting: "racetrack", primary_prop: "race_car", accent_props: [], mood: "neon", label: "Your pit lane" },
    space: { setting: "launchpad", primary_prop: "rocket", accent_props: [], mood: "starlight", label: "Your launchpad" },
  };
  return defaults[theme];
}

const scenePalette = {
  court: { floor: 0xd9ed66, sky: 0x2a2455 },
  racetrack: { floor: 0x3d3a3d, sky: 0x1b1649 },
  launchpad: { floor: 0x242338, sky: 0x10162f },
  music_room: { floor: 0xe8c5ae, sky: 0x463257 },
  gaming_desk: { floor: 0x24223e, sky: 0x15122c },
  art_studio: { floor: 0xf1d5bd, sky: 0x6c5a98 },
  city_park: { floor: 0x94c75f, sky: 0x5387a0 },
  workshop: { floor: 0xb2a796, sky: 0x483f38 },
} as const;

function addPersonalProp(scene: Scene, prop: PersonalSceneProp, x: number, z: number, scale = 0.65) {
  const group = new Group();
  const ink = new MeshStandardMaterial({ color: 0x252124, roughness: 0.65 });
  const coral = new MeshStandardMaterial({ color: 0xe86a36, roughness: 0.55 });
  const paper = new MeshStandardMaterial({ color: 0xf6f0e3, roughness: 0.55 });
  const lime = new MeshStandardMaterial({ color: 0xd9ed66, roughness: 0.7 });
  if (prop === "basketball" || prop === "soccer_ball") group.add(new Mesh(new SphereGeometry(0.5, 20, 16), prop === "basketball" ? coral : paper));
  if (prop === "race_car") group.add(new Mesh(new BoxGeometry(1.3, 0.26, 0.62), coral));
  if (prop === "rocket") { const rocket = new Mesh(new ConeGeometry(0.35, 1.15, 16), paper); rocket.rotation.z = -Math.PI / 2; group.add(rocket); }
  if (prop === "guitar") { group.add(new Mesh(new SphereGeometry(0.38, 16, 12), coral), new Mesh(new BoxGeometry(0.16, 1.1, 0.12), ink)); }
  if (prop === "controller") group.add(new Mesh(new BoxGeometry(1.1, 0.28, 0.62), ink), new Mesh(new SphereGeometry(0.1, 12, 8), coral));
  if (prop === "sketchbook") group.add(new Mesh(new BoxGeometry(0.88, 0.1, 1.08), paper), new Mesh(new BoxGeometry(0.05, 0.16, 1.08), coral));
  if (prop === "camera") group.add(new Mesh(new BoxGeometry(0.9, 0.58, 0.42), ink), new Mesh(new CylinderGeometry(0.2, 0.2, 0.25, 16), paper));
  if (prop === "skateboard") { group.add(new Mesh(new BoxGeometry(1.25, 0.09, 0.35), coral)); for (const wheelX of [-0.4, 0.4]) { const wheel = new Mesh(new CylinderGeometry(0.1, 0.1, 0.09, 12), ink); wheel.rotation.x = Math.PI / 2; wheel.position.x = wheelX; wheel.position.y = -0.12; group.add(wheel); } }
  if (prop === "book_stack") { for (let index = 0; index < 3; index += 1) { const book = new Mesh(new BoxGeometry(0.86, 0.16, 0.58), index === 1 ? coral : index === 2 ? lime : paper); book.position.y = index * 0.17; group.add(book); } }
  if (prop === "headphones") { const band = new Mesh(new TorusGeometry(0.38, 0.06, 8, 20, Math.PI), ink); band.rotation.z = Math.PI; group.add(band); for (const side of [-1, 1]) { const cup = new Mesh(new SphereGeometry(0.12, 12, 8), coral); cup.position.set(side * 0.36, -0.15, 0); group.add(cup); } }
  if (prop === "plant") { const pot = new Mesh(new CylinderGeometry(0.23, 0.3, 0.34, 10), coral); pot.position.y = -0.15; group.add(pot); for (let index = 0; index < 4; index += 1) { const leaf = new Mesh(new ConeGeometry(0.16, 0.65, 8), lime); leaf.position.set((index - 1.5) * 0.12, 0.28, 0); leaf.rotation.z = (index - 1.5) * 0.35; group.add(leaf); } }
  group.position.set(x, 0.42, z);
  group.scale.setScalar(scale);
  group.rotation.y = (x + z) * 0.4;
  group.traverse((child) => { if (child instanceof Mesh) child.castShadow = true; });
  scene.add(group);
}

function addPersonalComposition(scene: Scene, personalScene: PersonalScene) {
  const props = [...new Set([personalScene.primary_prop, ...personalScene.accent_props])].slice(0, 3);
  const placements: Array<[number, number, number]> = [[-2.7, 1.25, 0.58], [0.3, -1.45, 0.46], [2.4, 1.2, 0.42]];
  props.forEach((prop, index) => addPersonalProp(scene, prop, ...placements[index]));
}

function addBasketballScene(scene: Scene): { moving: Group; targetX: number } {
  const moving = new Group();
  const orange = new MeshStandardMaterial({ color: 0xe86a36, roughness: 0.68 });
  const ball = new Mesh(new SphereGeometry(0.48, 32, 20), orange);
  ball.castShadow = true;
  moving.add(ball);
  scene.add(moving);

  const hoop = new Group();
  const dark = new MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.78 });
  const rim = new Mesh(new TorusGeometry(0.48, 0.045, 10, 28), dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(3.1, 1.65, 0);
  hoop.add(rim);
  const board = new Mesh(new BoxGeometry(0.08, 1.25, 1.45), new MeshStandardMaterial({ color: 0xf6f0e3, roughness: 0.45 }));
  board.position.set(3.48, 2.2, 0);
  hoop.add(board);
  const pole = new Mesh(new CylinderGeometry(0.06, 0.08, 2.8, 10), dark);
  pole.position.set(3.75, 0.3, 0);
  hoop.add(pole);
  for (let index = 0; index < 6; index += 1) {
    const strand = new Mesh(new CylinderGeometry(0.012, 0.012, 0.7, 6), dark);
    const angle = (index / 6) * Math.PI * 2;
    strand.position.set(3.1 + Math.cos(angle) * 0.34, 1.3, Math.sin(angle) * 0.34);
    strand.rotation.z = Math.cos(angle) * 0.25;
    hoop.add(strand);
  }
  scene.add(hoop);
  return { moving, targetX: 2.7 };
}

function addFormulaScene(scene: Scene): { moving: Group; targetX: number } {
  const moving = new Group();
  const body = new Mesh(new BoxGeometry(1.3, 0.28, 0.58), new MeshStandardMaterial({ color: 0xd74839, roughness: 0.48, metalness: 0.18 }));
  body.position.y = 0.28;
  moving.add(body);
  const wing = new Mesh(new BoxGeometry(1.7, 0.08, 0.72), new MeshStandardMaterial({ color: 0x282422, roughness: 0.6 }));
  wing.position.set(-0.15, 0.55, 0);
  moving.add(wing);
  for (const [x, z] of [[-0.45, -0.42], [-0.45, 0.42], [0.48, -0.42], [0.48, 0.42]]) {
    const wheel = new Mesh(new CylinderGeometry(0.22, 0.22, 0.16, 16), new MeshStandardMaterial({ color: 0x191716, roughness: 0.85 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.2, z);
    moving.add(wheel);
  }
  scene.add(moving);
  return { moving, targetX: 2.5 };
}

function addSpaceScene(scene: Scene): { moving: Group; targetX: number } {
  const moving = new Group();
  const rocket = new Mesh(new ConeGeometry(0.42, 1.5, 20), new MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.35, metalness: 0.2 }));
  rocket.rotation.z = -Math.PI / 2;
  moving.add(rocket);
  const window = new Mesh(new SphereGeometry(0.13, 16, 12), new MeshStandardMaterial({ color: 0x314a78, roughness: 0.2, metalness: 0.4 }));
  window.position.set(0.13, 0.19, 0.39);
  moving.add(window);
  const flame = new Mesh(new ConeGeometry(0.17, 0.7, 12), new MeshBasicMaterial({ color: 0xe8f275 }));
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -1.02;
  moving.add(flame);
  for (let index = 0; index < 30; index += 1) {
    const star = new Mesh(new SphereGeometry(0.025, 8, 6), new MeshBasicMaterial({ color: 0xf8f4e9 }));
    star.position.set(-4 + (index * 1.7) % 8, 0.25 + (index * 0.71) % 3.5, -1.5 + (index % 4) * 0.8);
    scene.add(star);
  }
  scene.add(moving);
  return { moving, targetX: 2.7 };
}

export function ThreePhysicsScene({ spec, values, runToken, active, onAvailability }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef(values);
  const runTokenRef = useRef(runToken);
  valuesRef.current = values;
  runTokenRef.current = runToken;
  const theme = spec.visual_theme ?? "basketball";
  const personalScene = useMemo(() => spec.personal_scene ?? defaultPersonalScene(theme), [spec.personal_scene, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let renderer: WebGLRenderer | undefined;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    try {
      const scene = new Scene();
      const palette = scenePalette[personalScene.setting];
      scene.background = new Color(palette.sky);
      const camera = new PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(0, 3.2, 9.2);
      camera.lookAt(0.5, 0.8, 0);
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);
      scene.add(new HemisphereLight(0xf7eedf, 0x2a2455, 2.1));
      const keyLight = new DirectionalLight(0xffffff, 2.4);
      keyLight.position.set(-2, 5, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);
      const floor = new Mesh(new PlaneGeometry(12, 7), new MeshStandardMaterial({ color: palette.floor, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const sceneFactory = theme === "formula1" ? addFormulaScene : theme === "space" ? addSpaceScene : addBasketballScene;
      const { moving, targetX } = sceneFactory(scene);
      addPersonalComposition(scene, personalScene);
      moving.position.set(-3.3, theme === "basketball" ? 0.65 : theme === "space" ? 1.2 : 0, 0);
      let lastRun = runTokenRef.current;
      let startedAt = performance.now();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        if (!renderer || width < 1 || height < 1) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();
      onAvailability(true);

      const render = (now: number) => {
        if (runTokenRef.current !== lastRun) {
          lastRun = runTokenRef.current;
          startedAt = now;
        }
        const current = valuesRef.current;
        const acceleration = current.acceleration ?? 0;
        const maxAcceleration = spec.variables.find((variable) => variable.id === "acceleration")?.max ?? 1;
        const restingX = -3.3 + Math.min(2.7, Math.max(0, acceleration / maxAcceleration) * 2.1);
        const progress = reduceMotion ? 1 : Math.min(1, (now - startedAt) / 900);
        const launchX = -3.3 + (targetX + 3.3) * (1 - Math.pow(1 - progress, 3));
        moving.position.x = runTokenRef.current === 0 || progress >= 1 ? restingX : launchX;
        moving.rotation.z = theme === "basketball" ? -now / 850 : 0;
        renderer?.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };
      frameId = window.requestAnimationFrame(render);
    } catch {
      onAvailability(false);
    }

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, [onAvailability, personalScene, spec.variables, theme]);

  const force = calculateFormula(spec.formula_id, values);
  return <section className={`three-physics-scene ${active ? "is-active" : ""}`} ref={containerRef} aria-label={`${objectLabel(theme)} 3D physics visualization`}>
    <div className="three-scene-label"><span>{personalScene.label}</span><strong>{force.toFixed(2)} N</strong></div>
  </section>;
}
