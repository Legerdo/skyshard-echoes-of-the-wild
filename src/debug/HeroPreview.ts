// Debug scene: preview hero models and poses (?debug=heroes&pose=run)
import * as THREE from 'three';
import { buildHero, HERO_IDS } from '../player/Heroes';
import { newPose, poseIdle, poseRun, poseGlide, poseClimb, poseJump } from '../player/Rig';
import { RenderPipeline } from '../render/Renderer';

export function heroPreview(canvas: HTMLCanvasElement, poseName: string): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec8f0);
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.35, 6.2);
  camera.lookAt(0, 0.95, 0);
  const pipe = new RenderPipeline(canvas, scene, camera);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(3, 6, 5);
  sun.castShadow = true;
  scene.add(sun, new THREE.HemisphereLight(0xbfe0ff, 0x8a7a64, 1.3));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshToonMaterial({ color: 0x7cc55a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const models = HERO_IDS.map((id, i) => {
    const m = buildHero(id);
    m.rig.root.position.set((i - 1.5) * 1.25, 0, 0);
    m.rig.root.rotation.y = 0.35 - i * 0.05;
    scene.add(m.rig.root);
    return m;
  });
  const p = newPose();
  let t = 0;
  const loop = () => {
    t += 1 / 60;
    for (const m of models) {
      if (poseName === 'run') poseRun(p, t * 9, 1, t);
      else if (poseName === 'glide') poseGlide(p, t, 0);
      else if (poseName === 'climb') poseClimb(p, t * 5, 1);
      else if (poseName === 'jump') poseJump(p, 1);
      else poseIdle(p, t);
      m.rig.setTarget(p);
      m.rig.update(1 / 60, 30);
    }
    pipe.render();
    requestAnimationFrame(loop);
  };
  loop();
}
