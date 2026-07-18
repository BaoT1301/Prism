import { useEffect, useRef } from "react";
import {
  BoxGeometry,
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
import type { SandboxSpec, VisualTheme } from "../../features/sandbox/sandbox-types";

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let renderer: WebGLRenderer | undefined;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    try {
      const scene = new Scene();
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
      const floor = new Mesh(new PlaneGeometry(12, 7), new MeshStandardMaterial({ color: 0xd9ed66, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const sceneFactory = theme === "formula1" ? addFormulaScene : theme === "space" ? addSpaceScene : addBasketballScene;
      const { moving, targetX } = sceneFactory(scene);
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
  }, [onAvailability, spec.variables, theme]);

  const force = calculateFormula(spec.formula_id, values);
  return <section className={`three-physics-scene ${active ? "is-active" : ""}`} ref={containerRef} aria-label={`${objectLabel(theme)} 3D physics visualization`}>
    <div className="three-scene-label"><span>3D simulation</span><strong>{force.toFixed(2)} N</strong></div>
  </section>;
}
