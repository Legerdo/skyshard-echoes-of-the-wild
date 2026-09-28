// World layout: every authored coordinate lives here so terrain, props, quests and the map agree.
import { t, type TStr } from '../core/i18n';

export const WORLD = {
  half: 432,
  cell: 1.5,
  cells: 576,
};

export enum Region {
  Verdant = 0,
  Ember = 1,
  Azure = 2,
  Basin = 3,
  Sanctum = 4,
}

export interface RegionInfo {
  id: Region;
  name: TStr;
  sub: TStr;
  mapColor: string;
}

export const REGIONS: RegionInfo[] = [
  { id: Region.Verdant, name: t('Verdant Reach', '신록의 들녘'), sub: t('Where the wind remembers', '바람이 기억하는 땅'), mapColor: '#8fcf6a' },
  { id: Region.Ember, name: t('Ember Ravine', '잿불 협곡'), sub: t('Canyons of the burning shard', '불타는 파편의 협곡'), mapColor: '#d9814f' },
  { id: Region.Azure, name: t('Azure Highlands', '창공 고원'), sub: t('Where the sky touches stone', '하늘이 돌에 닿는 곳'), mapColor: '#7fb6e0' },
  { id: Region.Basin, name: t('Starfall Basin', '낙성 분지'), sub: t('The wound beneath the sanctum', '성소 아래의 상흔'), mapColor: '#b9a6d8' },
  { id: Region.Sanctum, name: t('Astral Sanctum', '아스트랄 성소'), sub: t('Heart of the fallen star', '떨어진 별의 심장'), mapColor: '#ffe6a0' },
];

export const REGION_SEEDS: Array<{ id: Region; x: number; z: number }> = [
  { id: Region.Verdant, x: 30, z: 232 },
  { id: Region.Ember, x: -265, z: -20 },
  { id: Region.Azure, x: 255, z: -130 },
  { id: Region.Basin, x: 0, z: -150 },
];

export const P = {
  landing: { x: 40, z: 364 },
  fields: { x: 36, z: 326 },
  village: { x: 24, z: 282 },
  elderHouse: { x: 22, z: 256 },
  windmill: { x: -88, z: 212 },
  watchtower: { x: -26, z: 186 },
  bramble: { x: -40, z: 140 },
  elderTree: { x: 118, z: 160 },
  pond: { x: 128, z: 234 },
  boarDen: { x: -142, z: 300 },
  meadow: { x: 150, z: 300 },
  ashgate: { x: -140, z: 132 },
  bridge: { x: -212, z: 30 },
  outpost: { x: -266, z: 62 },
  grotto: { x: -326, z: 60 },
  spire: { x: -286, z: -112 },
  lavaLake: { x: -340, z: -36 },
  crater: { x: 0, z: -120 },
  gate: { x: 0, z: -76 },
  sanctum: { x: 0, z: -160, y: 170 },
  azurePass: { x: 196, z: 80 },
  camp: { x: 148, z: -20 },
  lake: { x: 214, z: -50 },
  lakeIsle: { x: 230, z: -44 },
  terrace: { x: 204, z: -140 },
  temple: { x: 256, z: -230 },
};

export const LAKE_R = 56;
export const TEMPLE_R = 26;

// Elevations of authored features.
export const H = {
  village: 16,
  landing: 18,
  elderTop: 46,
  riverLevel: 13.2,
  springLevel: 45.4,
  canyonFloor: 22,
  spireFloor: 22,
  spireTop: 124,
  spireR: 26,
  lakeLevel: 38,
  terrace: 64,
  templeTop: 118,
  craterFloor: 12,
  sanctumTop: 170,
  lavaChasm: 2,
  lavaLake: 15,
};

/** Spire ledges: angle (radians, atan2(dz,dx)), height, depth outward, half arc. */
export const SPIRE_LEDGES = [
  { id: 'L1', ang: (60 * Math.PI) / 180, h: 52, depth: 8, arc: (26 * Math.PI) / 180 },
  { id: 'L3', ang: (-62 * Math.PI) / 180, h: 92, depth: 7, arc: (22 * Math.PI) / 180 },
];

export interface Polyline {
  pts: Array<[number, number, number?]>;
  hw: number; // half width of flat part
  wall: number; // wall/blend width
  floor?: number;
}

// Canyons carve down into the Ember plateau. Third value = floor height at that vertex.
export const CANYONS: Polyline[] = [
  // main canyon from Verdant into the ravine (Ashgate) to the chasm
  { pts: [[-96, 156, 17], [-120, 142, 18], [-142, 128, 19], [-166, 104, 20], [-188, 80, 21], [-202, 58, 22], [-210, 40, 22]], hw: 13, wall: 12 },
  // after the bridge toward the spire basin
  { pts: [[-214, 24, 22], [-226, 0, 22], [-244, -32, 22], [-262, -64, 22], [-276, -88, 22]], hw: 13, wall: 12 },
  // branch toward the lava lake
  { pts: [[-244, -32, 22], [-276, -38, 21], [-306, -38, 19]], hw: 11, wall: 10 },
  // ravine exit toward Starfall Basin
  { pts: [[-232, -122, 22], [-200, -128, 21], [-168, -130, 19], [-134, -128, 17], [-100, -124, 15]], hw: 12, wall: 12 },
  // side canyon to the sentinel outpost and grotto
  { pts: [[-190, 78, 21], [-218, 72, 24], [-246, 66, 26], [-266, 62, 26], [-296, 62, 27], [-326, 60, 27]], hw: 9, wall: 9 },
];

// The chasm crossed by the broken bridge.
export const CHASM: Polyline = { pts: [[-276, 44, -12], [-244, 38, -12], [-212, 30, -12], [-180, 22, -12], [-150, 10, -12]], hw: 8, wall: 3 };

export const BRIDGE = {
  // bridge endpoints on either side of the chasm (along main canyon direction)
  a: { x: -206, z: 50 },
  b: { x: -219, z: 12 },
  deck: 22.6,
  gapFrom: 0.38,
  gapTo: 0.62,
};

// Circular carves (basins) and raises.
export interface CircleFeature {
  x: number;
  z: number;
  r: number;
  h: number;
  blend: number;
  mode: 'min' | 'max' | 'set';
  noise?: number;
}

export const CARVES: CircleFeature[] = [
  { x: P.spire.x, z: P.spire.z, r: 60, h: H.spireFloor, blend: 10, mode: 'min', noise: 6 },
  { x: P.lavaLake.x, z: P.lavaLake.z, r: 34, h: 11, blend: 10, mode: 'min', noise: 4 },
  { x: P.outpost.x, z: P.outpost.z, r: 20, h: 26, blend: 8, mode: 'min', noise: 3 },
  { x: P.grotto.x, z: P.grotto.z, r: 14, h: 27, blend: 6, mode: 'min', noise: 2 },
  { x: P.boarDen.x, z: P.boarDen.z, r: 16, h: 13, blend: 10, mode: 'min', noise: 3 },
];

export const RAISES: CircleFeature[] = [
  { x: P.watchtower.x, z: P.watchtower.z, r: 10, h: 22, blend: 14, mode: 'max', noise: 2 },
  { x: P.terrace.x, z: P.terrace.z, r: 24, h: H.terrace, blend: 10, mode: 'max', noise: 3 },
  { x: P.temple.x, z: P.temple.z, r: 26, h: H.templeTop, blend: 4, mode: 'max', noise: 1.5 },
  { x: P.camp.x, z: P.camp.z, r: 16, h: 47, blend: 12, mode: 'set' },
  { x: P.village.x, z: P.village.z, r: 40, h: H.village, blend: 14, mode: 'set' },
  { x: P.landing.x, z: P.landing.z, r: 22, h: H.landing, blend: 12, mode: 'set' },
  { x: P.gate.x, z: P.gate.z, r: 22, h: H.craterFloor, blend: 8, mode: 'set' },
  { x: P.fields.x, z: P.fields.z, r: 18, h: 17, blend: 12, mode: 'set' },
];

export interface Mountain {
  x: number;
  z: number;
  h: number;
  s: number;
}
export const MOUNTAINS: Mountain[] = [
  { x: 318, z: -176, h: 135, s: 46 },
  { x: 370, z: -84, h: 118, s: 36 },
  { x: 338, z: -300, h: 128, s: 40 },
  { x: 200, z: -270, h: 96, s: 38 },
  { x: -128, z: -322, h: 128, s: 44 },
  { x: 70, z: -340, h: 140, s: 46 },
  { x: -40, z: -366, h: 92, s: 40 },
  { x: -360, z: -200, h: 104, s: 40 },
  { x: -370, z: 150, h: 92, s: 36 },
];

// Rivers: pts with water level per vertex.
export const RIVER: Polyline = {
  pts: [
    [128, 234, 13.2], [110, 254, 13.0], [94, 272, 12.8], [80, 292, 12.6], [70, 318, 12.4], [74, 346, 12.2], [86, 374, 12.0], [94, 398, 11.8], [98, 420, 11.6],
  ],
  hw: 5.5,
  wall: 7,
};

export interface Road {
  pts: Array<[number, number, number?]>;
  hw: number;
  kind: 'dirt' | 'stone' | 'ash';
  skipRiver?: boolean;
}

export const ROADS: Road[] = [
  { kind: 'dirt', hw: 2.6, pts: [[40, 358], [38, 340], [35, 320], [29, 302], [24, 290]] },
  { kind: 'dirt', hw: 2.4, pts: [[8, 284], [-20, 272], [-50, 254], [-74, 240], [-84, 224]] },
  { kind: 'dirt', hw: 2.4, pts: [[-50, 254], [-94, 238], [-116, 204], [-114, 172], [-100, 154]] },
  { kind: 'dirt', hw: 2.4, skipRiver: true, pts: [[42, 280], [66, 276], [92, 272], [118, 256], [150, 232], [174, 206], [182, 192]] },
  { kind: 'stone', hw: 2.8, pts: [[182, 192, 17], [181, 176, 22], [177, 158, 28], [170, 142, 34], [161, 130, 39], [150, 122, 43.5], [138, 126, 46]] },
  { kind: 'dirt', hw: 2.4, pts: [[24, 262], [20, 232], [10, 196], [0, 156], [-6, 116], [-4, 74], [0, 30], [0, -12], [0, -40], [0, -62]] },
  { kind: 'stone', hw: 2.6, pts: [[150, 232], [186, 206], [204, 170], [206, 136, 19], [200, 110, 25], [193, 86, 32], [186, 62, 39], [178, 38, 44], [168, 12, 46.5], [156, -10, 47], [148, -20, 47]] },
  { kind: 'stone', hw: 2.4, pts: [[146, -30], [148, -70], [160, -104], [180, -128], [198, -140]] },
  { kind: 'stone', hw: 2.2, pts: [[138, -34], [110, -62], [84, -84], [56, -96]] },
];

export interface WaterBody {
  kind: 'water' | 'lava';
  shape: 'circle' | 'river';
  x?: number;
  z?: number;
  r?: number;
  level?: number;
  river?: Polyline;
}

export const WATERS: WaterBody[] = [
  { kind: 'water', shape: 'circle', x: P.pond.x, z: P.pond.z, r: 19, level: H.riverLevel },
  { kind: 'water', shape: 'river', river: RIVER },
  { kind: 'water', shape: 'circle', x: 121, z: 202, r: 6, level: H.springLevel },
  { kind: 'water', shape: 'circle', x: P.lake.x, z: P.lake.z, r: LAKE_R, level: H.lakeLevel },
  { kind: 'lava', shape: 'river', river: { pts: CHASM.pts.map((p) => [p[0], p[1], H.lavaChasm] as [number, number, number]), hw: 9, wall: 2 } },
  { kind: 'lava', shape: 'circle', x: P.lavaLake.x, z: P.lavaLake.z, r: 42, level: H.lavaLake },
  { kind: 'lava', shape: 'circle', x: -318, z: -150, r: 9, level: 22.4 },
  { kind: 'lava', shape: 'circle', x: -248, z: -150, r: 7, level: 22.4 },
];

// Floating stones for the Azure glide route (top heights) and Ember beacon rock.
export const FLOATING_ISLES = [
  { id: 'azure1', x: 214, z: -172, top: 82, r: 7 },
  { id: 'azure2', x: 230, z: -202, top: 100, r: 7 },
  { id: 'emberRock', x: P.spire.x + 44 * Math.cos(-0.17), z: P.spire.z + 44 * Math.sin(-0.17), top: 88, r: 7.5 },
  { id: 'azurePerch', x: 198, z: -216, top: 112, r: 4.5 },
  { id: 'lakeSpire', x: 214, z: -90, top: 70, r: 5 },
];

export interface Updraft {
  id: string;
  x: number;
  z: number;
  r: number;
  y0: number;
  top: number;
  kind: 'heat' | 'wind' | 'star';
  enabledFlag?: string;
}

const L1 = SPIRE_LEDGES[0];
export const UPDRAFTS: Updraft[] = [
  { id: 'chasm', x: -212.5, z: 31, r: 5.5, y0: -5, top: 34, kind: 'heat' },
  { id: 'spireFloor', x: P.spire.x + 40 * Math.cos(0.5), z: P.spire.z + 40 * Math.sin(0.5), r: 4.5, y0: 20, top: 64, kind: 'heat' },
  { id: 'spireL1', x: P.spire.x + (H.spireR + 4.5) * Math.cos(L1.ang), z: P.spire.z + (H.spireR + 4.5) * Math.sin(L1.ang), r: 3.4, y0: L1.h - 1, top: 106, kind: 'heat' },
  { id: 'spireRock', x: FLOATING_ISLES[2].x, z: FLOATING_ISLES[2].z, r: 3.4, y0: 86, top: 106, kind: 'heat' },
  { id: 'terrace', x: P.terrace.x + 4, z: P.terrace.z - 14, r: 4, y0: 60, top: 98, kind: 'wind', enabledFlag: 'windroad' },
  { id: 'azure1', x: FLOATING_ISLES[0].x, z: FLOATING_ISLES[0].z, r: 3.2, y0: 80, top: 116, kind: 'wind', enabledFlag: 'windroad' },
  { id: 'azure2', x: FLOATING_ISLES[1].x, z: FLOATING_ISLES[1].z, r: 3.2, y0: 98, top: 132, kind: 'wind', enabledFlag: 'windroad' },
  { id: 'windmill', x: -70, z: 200, r: 3, y0: 40, top: 72, kind: 'wind' },
  { id: 'starlift', x: P.gate.x, z: P.gate.z, r: 5, y0: 10, top: 196, kind: 'star', enabledFlag: 'sanctum_open' },
];

// Wind currents (horizontal push while gliding) in the Azure highlands.
export const WIND_ZONES = [
  { x: 222, z: -188, r: 22, y0: 76, y1: 140, dx: 0.45, dz: -0.89, force: 2.6 },
  { x: 244, z: -216, r: 20, y0: 92, y1: 150, dx: 0.68, dz: -0.73, force: 2.6 },
];

export interface WaystoneDef {
  id: string;
  x: number;
  z: number;
  name: TStr;
}
export const WAYSTONES: WaystoneDef[] = [
  { id: 'ws_village', x: 36, z: 284, name: t('Dawnhollow', '새벽골 마을') },
  { id: 'ws_windmill', x: -76, z: 226, name: t('Windmill Hill', '풍차 언덕') },
  { id: 'ws_elder', x: 140, z: 136, name: t('Elder Tree', '태고의 나무') },
  { id: 'ws_ashgate', x: -124, z: 146, name: t('Ashgate', '잿빛 관문') },
  { id: 'ws_spire', x: -262, z: -76, name: t('Cinder Spire', '잿불 첨탑') },
  { id: 'ws_camp', x: 156, z: -12, name: t('Skyharbor Camp', '하늘항구 야영지') },
  { id: 'ws_terrace', x: 196, z: -132, name: t('Windstep Terrace', '바람계단 단구') },
  { id: 'ws_basin', x: 14, z: -66, name: t('Starfall Basin', '낙성 분지') },
];

export interface LandmarkDef {
  id: string;
  x: number;
  z: number;
  r: number;
  name: TStr;
  region: Region;
}
export const LANDMARKS: LandmarkDef[] = [
  { id: 'lm_landing', x: P.landing.x, z: P.landing.z, r: 26, name: t('Southwind Landing', '남풍 선착장'), region: Region.Verdant },
  { id: 'lm_village', x: P.village.x, z: P.village.z, r: 40, name: t('Dawnhollow', '새벽골 마을'), region: Region.Verdant },
  { id: 'lm_windmill', x: P.windmill.x, z: P.windmill.z, r: 30, name: t('Windmill Hill', '풍차 언덕'), region: Region.Verdant },
  { id: 'lm_watchtower', x: P.watchtower.x, z: P.watchtower.z, r: 20, name: t('Old Watchtower', '낡은 망루'), region: Region.Verdant },
  { id: 'lm_elder', x: P.elderTree.x, z: P.elderTree.z, r: 50, name: t('The Elder Tree', '태고의 나무'), region: Region.Verdant },
  { id: 'lm_falls', x: P.pond.x, z: P.pond.z, r: 24, name: t('Veilfall Pond', '베일폭포 연못'), region: Region.Verdant },
  { id: 'lm_ashgate', x: P.ashgate.x, z: P.ashgate.z, r: 24, name: t('Ashgate', '잿빛 관문'), region: Region.Ember },
  { id: 'lm_bridge', x: P.bridge.x, z: P.bridge.z, r: 24, name: t('The Broken Bridge', '끊어진 다리'), region: Region.Ember },
  { id: 'lm_spire', x: P.spire.x, z: P.spire.z, r: 60, name: t('Cinder Spire', '잿불 첨탑'), region: Region.Ember },
  { id: 'lm_lavalake', x: P.lavaLake.x, z: P.lavaLake.z, r: 34, name: t('Molten Mere', '녹아내린 호수'), region: Region.Ember },
  { id: 'lm_camp', x: P.camp.x, z: P.camp.z, r: 24, name: t('Skyharbor Camp', '하늘항구 야영지'), region: Region.Azure },
  { id: 'lm_lake', x: P.lake.x, z: P.lake.z, r: 60, name: t('Mirrorsky Lake', '거울하늘 호수'), region: Region.Azure },
  { id: 'lm_terrace', x: P.terrace.x, z: P.terrace.z, r: 24, name: t('Windstep Terrace', '바람계단 단구'), region: Region.Azure },
  { id: 'lm_temple', x: P.temple.x, z: P.temple.z, r: 34, name: t('Stormglass Temple', '폭풍유리 신전'), region: Region.Azure },
  { id: 'lm_gate', x: P.gate.x, z: P.gate.z, r: 30, name: t('The Astral Gate', '아스트랄 관문'), region: Region.Basin },
];

export function coastRadius(angle: number, noise: (x: number, y: number) => number): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return 390 + 14 * noise(c * 1.7 + 10, s * 1.7) + 6 * noise(c * 5 + 3, s * 5 - 7);
}
