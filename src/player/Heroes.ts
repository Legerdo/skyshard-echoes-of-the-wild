// The four playable heroes: definitions (stats + ability text) and procedural models.
import * as THREE from 'three';
import { Rig, charMat, part, geo, hairShell } from './Rig';
import { Elem } from '../combat/Elements';
import { t, type TStr } from '../core/i18n';

export type HeroId = 'rowan' | 'mirelle' | 'wren' | 'idris';
export const HERO_IDS: HeroId[] = ['rowan', 'mirelle', 'wren', 'idris'];

export interface HeroDef {
  id: HeroId;
  name: TStr;
  title: TStr;
  elem: Elem;
  role: TStr;
  hp: number;
  atk: number;
  def: number;
  color: string;
  skillCd: number;
  burstCost: number;
  glideMul: number;
  swimMul: number;
  basic: TStr;
  skill: TStr;
  burst: TStr;
  passive: TStr;
  bio: TStr;
}

export const HEROES: Record<HeroId, HeroDef> = {
  rowan: {
    id: 'rowan',
    name: t('Rowan', '로완'),
    title: t('The Ember Blade', '잿불의 검'),
    elem: Elem.Ember,
    role: t('Vanguard · Melee', '선봉 · 근접'),
    hp: 520, atk: 24, def: 20, color: '#ff6a3c',
    skillCd: 7, burstCost: 60, glideMul: 1, swimMul: 1,
    basic: t('Four-hit sword combo; the last hit spins. Hold to unleash a rising flame cut.', '4연격 검술, 마지막 타격은 회전베기. 길게 누르면 불꽃 올려베기.'),
    skill: t('Cinder Rush — dash through foes, leaving a burning trail.', '잿불 돌진 — 적을 꿰뚫고 돌진하며 불타는 궤적을 남긴다.'),
    burst: t('Phoenix Arc — leap and slam down a wave of fire that leaves a flame ring.', '불사조의 호 — 도약 후 내려찍어 화염 파도와 불꽃 고리를 남긴다.'),
    passive: t('Deals +15% damage to burning foes.', '불타는 적에게 피해 +15%.'),
    bio: t('A wandering swordsman who follows falling stars. Loud, brave, and terrible at maps.', '떨어지는 별을 쫓는 방랑 검사. 시끄럽고 용감하며, 지도 보는 법은 모른다.'),
  },
  mirelle: {
    id: 'mirelle',
    name: t('Mirelle', '미렐'),
    title: t('The Tidecaller', '물결을 부르는 자'),
    elem: Elem.Tide,
    role: t('Support · Ranged healer', '지원 · 원거리 치유'),
    hp: 460, atk: 20, def: 16, color: '#46b8ff',
    skillCd: 9, burstCost: 70, glideMul: 1, swimMul: 0.6,
    basic: t('Rapid water arrows that seek the nearest foe. Hold for a charged tide shot.', '가장 가까운 적을 쫓는 물의 화살 연사. 길게 누르면 충전된 물결 화살.'),
    skill: t('Rippling Veil — a tidal ring soaks nearby foes and heals the party.', '잔물결 장막 — 물결 고리가 주변 적을 적시고 파티를 치유한다.'),
    burst: t('Moonsurge Rain — a rain field follows you, soaking foes and healing over time. Persists after switching.', '월조의 비 — 따라다니는 비의 장이 적을 적시고 지속 치유. 교체 후에도 유지.'),
    passive: t('Swimming costs 40% less stamina.', '수영 기력 소모 40% 감소.'),
    bio: t('A healer from a drowned island. Calm on the surface, stubborn as the sea beneath.', '가라앉은 섬 출신의 치유사. 겉은 잔잔하지만 바다처럼 고집스럽다.'),
  },
  wren: {
    id: 'wren',
    name: t('Wren', '렌'),
    title: t('Galewing', '질풍의 날개'),
    elem: Elem.Gale,
    role: t('Control · Mobility', '제어 · 기동'),
    hp: 480, atk: 19, def: 18, color: '#6ff0c0',
    skillCd: 6, burstCost: 60, glideMul: 0.6, swimMul: 1,
    basic: t('Quick staff strikes with wind blades. Hold to spin and pull foes in.', '바람 칼날을 날리는 빠른 지팡이 공격. 길게 누르면 회전하며 적을 끌어당긴다.'),
    skill: t('Updraft Vortex — tap: a vortex gathers foes then bursts. Hold: launch yourself skyward.', '상승 소용돌이 — 짧게: 적을 모은 뒤 폭발. 길게: 자신을 하늘로 띄운다.'),
    burst: t('Tempest Bloom — a roaming tornado drags foes and spreads any element it touches.', '폭풍의 꽃 — 떠도는 회오리가 적을 끌어당기고 닿은 원소를 퍼뜨린다.'),
    passive: t('Gliding costs 40% less stamina.', '활강 기력 소모 40% 감소.'),
    bio: t('Keeper of the windmill on the hill. Talks to birds and claims they answer.', '언덕 풍차의 관리인. 새들과 대화하며 새들이 대답한다고 우긴다.'),
  },
  idris: {
    id: 'idris',
    name: t('Idris', '이드리스'),
    title: t('The Stonewarden', '돌의 수호자'),
    elem: Elem.Terra,
    role: t('Guardian · Breaker', '수호 · 방어 파괴'),
    hp: 700, atk: 21, def: 34, color: '#f0b448',
    skillCd: 10, burstCost: 60, glideMul: 1, swimMul: 1,
    basic: t('Heavy hammer blows that stagger and break guards. Hold for a ground slam.', '경직과 방어 파괴를 일으키는 묵직한 망치. 길게 누르면 지면 강타.'),
    skill: t('Bastion Monolith — raise a stone pillar that taunts and pulses Terra. You can climb it.', '방벽 석주 — 적을 도발하고 대지 파동을 내는 돌기둥 소환. 올라설 수 있다.'),
    burst: t('Worldshell — a quake that shields the whole party.', '세계의 껍질 — 대지진과 함께 파티 전체에 보호막.'),
    passive: t('Shields are 30% stronger. Attacks shatter enemy guards.', '보호막 30% 강화. 공격이 적의 방어를 부순다.'),
    bio: t('The last knight of Ashgate. Speaks rarely, and only when it matters.', '잿빛 관문의 마지막 기사. 말수가 적고, 꼭 필요할 때만 말한다.'),
  },
};

export interface HeroModel {
  rig: Rig;
  weapon: THREE.Group;
  /** Local points (in weapon space) for trails. */
  trailA: THREE.Vector3;
  trailB: THREE.Vector3;
  flutter: THREE.Object3D[];
  offhand?: THREE.Group;
}

function hairSpikes(head: THREE.Object3D, mat: THREE.Material, r: number, count: number, len: number, spread = 1): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const tilt = 0.9 + (i % 3) * 0.2;
    const c = part(geo.cone, mat, r * 0.36, len, r * 0.36);
    c.position.set(Math.sin(a) * r * 0.55 * spread, r * 0.55, Math.cos(a) * r * 0.55 * spread - r * 0.12);
    c.rotation.set(Math.cos(a) * -tilt * 0.9 - 0.3, 0, Math.sin(a) * tilt * 0.9);
    head.add(c);
  }
}

function buildRowan(): HeroModel {
  const rig = new Rig({ top: 0xb8322e, bottom: 0x2e2a36, boots: 0x5a3a2a, accent: 0xffc05a, eye: '#e89a28', hair: '#8a2a1a', headR: 0.166, shoulderW: 0.19 });
  const hair = charMat(0xe0502a);
  const hairDark = charMat(0xb83a22);
  const gold = charMat(0xf0c060);
  const h = rig.headR;
  // hair shell + spikes + bangs
  hairShell(rig.head, hair, h);
  hairSpikes(rig.head, hair, h, 9, h * 1.2);
  for (let i = -2; i <= 2; i++) {
    const c = part(geo.cone, i % 2 ? hairDark : hair, h * 0.26, h * 0.62, h * 0.2);
    c.position.set(i * h * 0.3, h * 0.55, h * 0.8);
    c.rotation.set(2.5, 0, -i * 0.25);
    rig.head.add(c);
  }
  // coat tails: open at the front
  const coatGeo = new THREE.CylinderGeometry(0.16, 0.25, 0.42, 14, 1, true, Math.PI * 0.18, Math.PI * 1.64);
  const coatMat = charMat(0xa82a28).clone();
  coatMat.side = THREE.DoubleSide;
  const coat = new THREE.Mesh(coatGeo, coatMat);
  coat.position.y = -0.17;
  coat.castShadow = true;
  rig.hips.add(coat);
  rig.hips.add(part(geo.cyl, gold, 0.155, 0.04, 0.115, 0, 0.04, 0));
  rig.chest.add(part(geo.box, gold, 0.03, 0.26, 0.02, 0.03, 0.1, 0.112));
  // shoulder guard
  rig.armR.a.add(part(geo.sphere, charMat(0x3a2a2a), 0.085, 0.06, 0.085, 0, 0.02, 0));
  // scarf (flutters)
  const scarfMat = charMat(0xff6a3c, 0x7a1a08, 0.4);
  rig.neck.add(part(geo.cyl, scarfMat, 0.075, 0.06, 0.075, 0, 0.0, 0));
  const flutter: THREE.Object3D[] = [];
  let parent: THREE.Object3D = rig.chest;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.position.set(0.05, i === 0 ? 0.24 : -0.13, i === 0 ? -0.1 : -0.02);
    const s = part(geo.box, scarfMat, 0.09 - i * 0.012, 0.14, 0.02, 0, -0.07, 0);
    g.add(s);
    parent.add(g);
    flutter.push(g);
    parent = g;
  }
  // sword
  const weapon = new THREE.Group();
  const blade = part(geo.box, charMat(0xeae6f2, 0xff5a20, 0.25), 0.07, 0.95, 0.018, 0, 0.56, 0);
  const edge = part(geo.box, charMat(0xff8a40, 0xff5a10, 0.9), 0.02, 0.9, 0.024, 0.035, 0.55, 0);
  const guard = part(geo.box, gold, 0.24, 0.04, 0.06, 0, 0.07, 0);
  const grip = part(geo.cyl, charMat(0x3a2020), 0.022, 0.18, 0.022, 0, -0.02, 0);
  const pommel = part(geo.sphere, gold, 0.035, 0.035, 0.035, 0, -0.12, 0);
  const tip = part(geo.cone, charMat(0xeae6f2), 0.035, 0.1, 0.009, 0, 1.08, 0);
  weapon.add(blade, edge, guard, grip, pommel, tip);
  weapon.rotation.set(Math.PI / 2, 0, 0);
  weapon.position.set(0, -0.04, 0.02);
  rig.handR.add(weapon);
  rig.addOutline();
  return { rig, weapon, trailA: new THREE.Vector3(0, 0.25, 0), trailB: new THREE.Vector3(0, 1.1, 0), flutter };
}

function buildMirelle(): HeroModel {
  const rig = new Rig({ top: 0xdce8f8, bottom: 0x3a7ad8, boots: 0xdce6f6, accent: 0x46b8ff, eye: '#27b0c8', hair: '#5a78a8', headR: 0.162, shoulderW: 0.165, skin: 0xfff0e6, bulk: 0.92 });
  const hair = charMat(0xb4ccf4);
  const hairShade = charMat(0x8eaae0);
  const blue = charMat(0x3a8ae0);
  const gold = charMat(0xf0d080);
  const h = rig.headR;
  hairShell(rig.head, hair, h, 1.1);
  // bangs
  for (let i = -3; i <= 3; i++) {
    const c = part(geo.cone, i % 2 ? hairShade : hair, h * 0.2, h * 0.55, h * 0.14);
    c.position.set(i * h * 0.22, h * 0.56, h * 0.84);
    c.rotation.set(2.65, 0, -i * 0.12);
    rig.head.add(c);
  }
  // long back hair
  const back = part(geo.capsule, hair, h * 0.95, 0.32, h * 0.55, 0, -0.3, -h * 0.7);
  rig.head.add(back);
  const flutter: THREE.Object3D[] = [];
  const tail = new THREE.Group();
  tail.position.set(0, -0.62, -h * 0.72);
  tail.add(part(geo.capsule, hairShade, h * 0.7, 0.2, h * 0.4, 0, -0.18, 0));
  rig.head.add(tail);
  flutter.push(tail);
  // side locks
  for (const s of [-1, 1]) rig.head.add(part(geo.capsule, hair, h * 0.22, 0.12, h * 0.22, s * h * 0.9, -h * 0.55, h * 0.2));
  // shell clip
  rig.head.add(part(geo.sphere, charMat(0x7fe8ff, 0x2a8ab8, 0.8), h * 0.18, h * 0.18, h * 0.08, h * 0.75, h * 0.55, h * 0.45));
  // dress coat (flared)
  const dressGeo = new THREE.CylinderGeometry(0.15, 0.36, 0.72, 16, 1, true);
  const dressMat = charMat(0x4a9ae8).clone();
  dressMat.side = THREE.DoubleSide;
  const dress = new THREE.Mesh(dressGeo, dressMat);
  dress.position.y = -0.3;
  dress.castShadow = true;
  rig.hips.add(dress);
  const hem = part(geo.cyl, charMat(0xeef6ff), 0.365, 0.06, 0.365, 0, -0.64, 0);
  rig.hips.add(hem);
  rig.chest.add(part(geo.box, blue, 0.26, 0.05, 0.02, 0, 0.02, 0.1));
  rig.chest.add(part(geo.sphere, gold, 0.03, 0.03, 0.02, 0, 0.18, 0.11));
  // bow in left hand
  const weapon = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.62, 0), new THREE.Vector3(0, 0, 0.42), new THREE.Vector3(0, 0.62, 0));
  const bowGeo = new THREE.TubeGeometry(curve, 16, 0.022, 6);
  const bow = new THREE.Mesh(bowGeo, charMat(0x2a5ab8, 0x46b8ff, 0.35));
  bow.castShadow = true;
  weapon.add(bow);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.24, 4), charMat(0xe6f6ff, 0x8ad8ff, 0.8));
  weapon.add(string);
  weapon.add(part(geo.sphere, charMat(0x9ff0ff, 0x46b8ff, 1), 0.05, 0.08, 0.05, 0, 0, 0.21));
  weapon.rotation.set(0, Math.PI / 2, 0);
  weapon.position.set(0, -0.04, 0.02);
  rig.handL.add(weapon);
  rig.addOutline();
  return { rig, weapon, trailA: new THREE.Vector3(0, -0.5, 0.1), trailB: new THREE.Vector3(0, 0.5, 0.1), flutter };
}

function buildWren(): HeroModel {
  const rig = new Rig({ top: 0xf4ead4, bottom: 0xe8d6b0, boots: 0x6a5a4a, accent: 0x3ab89a, eye: '#3cc070', hair: '#4a6a3a', headR: 0.182, shoulderW: 0.15, scale: 0.84, bulk: 0.9, hipsY: 0.86 });
  const cloak = charMat(0x2fae8e);
  const cloakDark = charMat(0x238a70);
  const scarf = charMat(0xf6d45a);
  const h = rig.headR;
  // hood (open face)
  hairShell(rig.head, cloak, h * 1.1, 1.05);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(h * 1.02, h * 0.12, 6, 22, Math.PI * 1.25), cloakDark);
  rim.position.set(0, -h * 0.05, h * 0.3);
  rim.rotation.set(-0.25, 0, -Math.PI * 0.125);
  rig.head.add(rim);
  // feather ears
  const flutter: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * h * 0.62, h * 0.85, -h * 0.2);
    ear.rotation.set(-0.5, 0, -s * 0.45);
    ear.add(part(geo.cone, cloak, h * 0.28, h * 1.3, h * 0.12, 0, h * 0.6, 0));
    ear.add(part(geo.cone, charMat(0xf6fff8), h * 0.14, h * 0.5, h * 0.07, 0, h * 1.2, 0));
    rig.head.add(ear);
    flutter.push(ear);
  }
  // hair tufts peeking
  for (let i = -1; i <= 1; i++) {
    const c = part(geo.cone, charMat(0x6a8a4a), h * 0.2, h * 0.5, h * 0.14);
    c.position.set(i * h * 0.3, h * 0.35, h * 0.85);
    c.rotation.set(2.7, 0, -i * 0.3);
    rig.head.add(c);
  }
  // cape
  const capeGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.46, 14, 1, true, Math.PI * 0.3, Math.PI * 1.4);
  const capeMat = (cloak as THREE.MeshToonMaterial).clone();
  capeMat.side = THREE.DoubleSide;
  const cape = new THREE.Mesh(capeGeo, capeMat);
  cape.position.set(0, 0.02, -0.02);
  cape.castShadow = true;
  rig.chest.add(cape);
  // big scarf
  rig.neck.add(part(geo.sphere, scarf, 0.1, 0.07, 0.1, 0, 0.0, 0));
  const tailS = new THREE.Group();
  tailS.position.set(-0.06, 0.24, -0.1);
  tailS.add(part(geo.box, scarf, 0.08, 0.3, 0.02, 0, -0.15, 0));
  rig.chest.add(tailS);
  flutter.push(tailS);
  // staff with ring
  const weapon = new THREE.Group();
  weapon.add(part(geo.cyl, charMat(0x8a6a4a), 0.022, 1.25, 0.022, 0, 0.3, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 20), charMat(0xf0d070, 0x6ff0c0, 0.5));
  ring.position.y = 1.02;
  weapon.add(ring);
  weapon.add(part(geo.sphere, charMat(0xbfffe8, 0x6ff0c0, 1), 0.05, 0.05, 0.05, 0, 1.02, 0));
  for (const s of [-1, 1]) {
    const f = part(geo.cone, charMat(0xf6fff8), 0.03, 0.22, 0.012, s * 0.08, 0.84, 0);
    f.rotation.z = s * 2.6;
    weapon.add(f);
  }
  weapon.rotation.set(Math.PI / 2, 0, 0);
  weapon.position.set(0, -0.04, 0.02);
  rig.handR.add(weapon);
  rig.addOutline(0x2a2238, 0.014);
  return { rig, weapon, trailA: new THREE.Vector3(0, 0.7, 0), trailB: new THREE.Vector3(0, 1.1, 0), flutter };
}

function buildIdris(): HeroModel {
  const rig = new Rig({ top: 0x8a909c, bottom: 0x4a3a30, boots: 0x6a6e78, accent: 0xf0b448, eye: '#d08a30', hair: '#2a1a14', headR: 0.158, shoulderW: 0.23, scale: 1.1, bulk: 1.28, skin: 0xe8c29c });
  const armor = charMat(0x9aa0ac);
  const armorDark = charMat(0x6a6e7a);
  const amber = charMat(0xffb040, 0xff9a20, 0.9);
  const h = rig.headR;
  // short hair + ponytail
  hairShell(rig.head, charMat(0x2e2018), h);
  for (let i = -2; i <= 2; i++) {
    const c = part(geo.cone, charMat(0x3a2a20), h * 0.22, h * 0.55, h * 0.16);
    c.position.set(i * h * 0.28, h * 0.5, h * 0.78);
    c.rotation.set(2.5, 0, -i * 0.2);
    rig.head.add(c);
  }
  const flutter: THREE.Object3D[] = [];
  const pony = new THREE.Group();
  pony.position.set(0, h * 0.3, -h * 0.95);
  pony.add(part(geo.capsule, charMat(0x2e2018), h * 0.2, 0.08, h * 0.2, 0, -0.1, 0));
  rig.head.add(pony);
  flutter.push(pony);
  // chest plate + amber core
  rig.chest.add(part(geo.sphere, armor, 0.2, 0.16, 0.14, 0, 0.12, 0.02));
  rig.chest.add(part(geo.sphere, amber, 0.045, 0.045, 0.02, 0, 0.14, 0.15));
  // pauldrons
  for (const arm of [rig.armL, rig.armR]) {
    arm.a.add(part(geo.sphere, armorDark, 0.12, 0.08, 0.12, 0, 0.04, 0));
    arm.a.add(part(geo.sphere, armor, 0.1, 0.06, 0.1, 0, 0.09, 0));
  }
  // belt & tassets
  rig.hips.add(part(geo.cyl, charMat(0x5a4030), 0.2, 0.06, 0.15, 0, 0.03, 0));
  for (const s of [-1, 1]) rig.hips.add(part(geo.box, armorDark, 0.12, 0.2, 0.03, s * 0.1, -0.1, 0.12));
  // cape
  const cape = new THREE.Group();
  cape.position.set(0, 0.26, -0.13);
  cape.add(part(geo.box, charMat(0xa8641e), 0.38, 0.8, 0.02, 0, -0.4, 0));
  rig.chest.add(cape);
  flutter.push(cape);
  // hammer (right) and shield (left)
  const weapon = new THREE.Group();
  weapon.add(part(geo.cyl, charMat(0x5a4030), 0.028, 0.95, 0.028, 0, 0.3, 0));
  weapon.add(part(geo.box, charMat(0x7a7e88), 0.34, 0.26, 0.26, 0, 0.82, 0));
  weapon.add(part(geo.box, amber, 0.2, 0.05, 0.27, 0, 0.82, 0));
  weapon.rotation.set(Math.PI / 2, 0, 0);
  weapon.position.set(0, -0.04, 0.02);
  rig.handR.add(weapon);
  const offhand = new THREE.Group();
  offhand.add(part(geo.box, armor, 0.06, 0.72, 0.5, 0, 0, 0));
  offhand.add(part(geo.box, armorDark, 0.07, 0.76, 0.06, 0, 0, 0.24));
  offhand.add(part(geo.box, armorDark, 0.07, 0.76, 0.06, 0, 0, -0.24));
  offhand.add(part(geo.sphere, amber, 0.05, 0.12, 0.08, 0.04, 0.05, 0));
  offhand.position.set(0.09, 0.0, 0.05);
  rig.handL.add(offhand);
  rig.addOutline(0x2a2238, 0.012);
  return { rig, weapon, trailA: new THREE.Vector3(0, 0.7, 0), trailB: new THREE.Vector3(0, 0.95, 0), flutter, offhand };
}

export function buildHero(id: HeroId): HeroModel {
  switch (id) {
    case 'rowan':
      return buildRowan();
    case 'mirelle':
      return buildMirelle();
    case 'wren':
      return buildWren();
    case 'idris':
      return buildIdris();
  }
}
