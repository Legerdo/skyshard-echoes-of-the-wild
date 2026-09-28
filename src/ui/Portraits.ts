// Renders hero head portraits once (using the main renderer) for the party UI.
import * as THREE from 'three';
import type { HeroModel, HeroId } from '../player/Heroes';
import { HEROES } from '../player/Heroes';
import { ELEM_INFO } from '../combat/Elements';
import { newPose, poseIdle } from '../player/Rig';

export function renderPortraits(renderer: THREE.WebGLRenderer, models: Record<HeroId, HeroModel>): Record<string, string> {
  const out: Record<string, string> = {};
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(2, 3, 4);
  scene.add(key, new THREE.HemisphereLight(0xdfe8ff, 0x6a5a70, 1.6));
  const rim = new THREE.DirectionalLight(0xffe0c0, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  const size = 256;
  const canvas = renderer.domElement;
  const pr = renderer.getPixelRatio();
  const prevVp = new THREE.Vector4();
  renderer.getViewport(prevVp);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const pose = newPose();
  poseIdle(pose, 0);
  for (const id of Object.keys(models) as HeroId[]) {
    const m = models[id];
    const root = m.rig.root;
    const parent = root.parent;
    const vis = root.visible;
    const pos = root.position.clone();
    const rot = root.rotation.y;
    const wVis = m.weapon.visible;
    scene.add(root);
    root.visible = true;
    m.weapon.visible = false;
    root.position.set(0, 0, 0);
    root.rotation.y = 0.35;
    m.rig.snap(pose);
    if (m.rig.faceMat?.map) m.rig.faceMat.map.offset.y = 0.5;
    root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    m.rig.head.getWorldPosition(head);
    const hr = m.rig.headR * (root.scale.x || 1);
    cam.position.set(head.x + 0.25, head.y + hr * 0.3, head.z + hr * 9.5);
    cam.lookAt(head.x, head.y - hr * 0.2, head.z);
    const col = new THREE.Color(ELEM_INFO[HEROES[id].elem].hex).multiplyScalar(0.35);
    scene.background = col;
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, size, size);
    renderer.setScissor(0, 0, size, size);
    renderer.render(scene, cam);
    ctx.clearRect(0, 0, 128, 128);
    ctx.drawImage(canvas, 0, canvas.height - size * pr, size * pr, size * pr, 0, 0, 128, 128);
    out[id] = cv.toDataURL('image/png');
    renderer.setScissorTest(false);
    // restore
    if (parent) parent.add(root);
    root.visible = vis;
    m.weapon.visible = wVis;
    root.position.copy(pos);
    root.rotation.y = rot;
  }
  renderer.setViewport(prevVp.x, prevVp.y, prevVp.z, prevVp.w);
  return out;
}
