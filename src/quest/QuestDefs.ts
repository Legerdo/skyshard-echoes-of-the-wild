// Main quest steps, chapters and side quests (static definitions).
import { t, type TStr } from '../core/i18n';

export interface StepDef {
  id: string;
  chapter: number;
  title: TStr;
  desc: TStr;
}

export const CHAPTERS: TStr[] = [
  t('Prologue', '서장'),
  t('Chapter I · The Verdant Reach', '1장 · 신록의 들녘'),
  t('Chapter II · The Ember Ravine', '2장 · 잿불 협곡'),
  t('Chapter III · The Azure Highlands', '3장 · 창공 고원'),
  t('Finale · The Astral Sanctum', '종장 · 아스트랄 성소'),
  t('Epilogue', '후일담'),
];

const S = (id: string, chapter: number, title: TStr, desc: TStr): StepDef => ({ id, chapter, title, desc });

export const STEPS: StepDef[] = [
  S('dock', 1, t('A Letter and a Star', '편지와 별'), t('Talk to the girl waiting on the dock.', '선착장에서 기다리는 소녀와 대화하세요.')),
  S('road', 1, t('The Road to Dawnhollow', '새벽골로 가는 길'), t('Follow the road north to the village of Dawnhollow.', '북쪽 길을 따라 새벽골 마을로 가세요.')),
  S('ambush', 1, t('Thorns on the Road', '길 위의 가시'), t('Drive off the Thornlings. Combine Ember and Tide!', '가시목을 물리치세요. 불꽃과 물결을 조합하세요!')),
  S('elder', 1, t('The Star-watcher', '별지기'), t('Speak with Elder Maelis in Dawnhollow.', '새벽골의 마엘리스 장로와 대화하세요.')),
  S('wren', 1, t('Wings on the Hill', '언덕 위의 날개'), t('Climb the windmill on Windmill Hill and find Wren.', '풍차 언덕의 풍차에 올라 렌을 찾으세요.')),
  S('tree', 1, t('The Humming Tree', '울리는 나무'), t('Investigate the Elder Tree on the eastern plateau.', '동쪽 고원의 태고의 나무를 조사하세요.')),
  S('blooms', 1, t('Veil-blooms', '베일꽃'), t('Wake the Veil-blooms around the Elder Tree with Tide.', '물결 원소로 태고의 나무 주변의 베일꽃을 깨우세요.')),
  S('seal', 1, t('The Thorn Seal', '가시 봉인'), t('Burn away the thorn seal on the tree\'s heart with Ember.', '불꽃 원소로 나무 심장의 가시 봉인을 태우세요.')),
  S('guardian', 1, t('Heartwood Guardian', '심목의 수호자'), t('Defeat the Elder Thornback.', '늙은 가시등을 쓰러뜨리세요.')),
  S('shard1', 1, t('The Verdant Skyshard', '신록의 스카이샤드'), t('Claim the Verdant Skyshard.', '신록의 스카이샤드를 손에 넣으세요.')),
  S('return1', 1, t('One of Three', '셋 중 하나'), t('Return to Elder Maelis in Dawnhollow.', '새벽골의 마엘리스 장로에게 돌아가세요.')),
  S('ashgate', 2, t('The Last Knight', '마지막 기사'), t('Travel west to Ashgate, the gate to the Ember Ravine.', '서쪽의 잿빛 관문으로 가세요.')),
  S('defend', 2, t('Hold the Line', '전선을 지켜라'), t('Defend Ashgate alongside Idris.', '이드리스와 함께 잿빛 관문을 지키세요.')),
  S('spire', 2, t('Into the Ravine', '협곡 속으로'), t('Cross the broken bridge and reach the Cinder Spire.', '끊어진 다리를 건너 잿불 첨탑에 도착하세요.')),
  S('beacons', 2, t('Three Beacons', '세 봉화'), t('Ride the heat updrafts and light the three beacons with Ember.', '열 상승 기류를 타고 올라 불꽃으로 세 봉화를 밝히세요.')),
  S('summit', 2, t('The Burning Crown', '불타는 왕관'), t('Climb to the summit of the Cinder Spire.', '잿불 첨탑 정상에 오르세요.')),
  S('cinderhorn', 2, t('Heart of the Spire', '첨탑의 심장'), t('Defeat Cinderhorn.', '잿불뿔을 쓰러뜨리세요.')),
  S('shard2', 2, t('The Ember Skyshard', '잿불 스카이샤드'), t('Claim the Ember Skyshard.', '잿불 스카이샤드를 손에 넣으세요.')),
  S('camp', 3, t('The High Road', '높은 길'), t('Travel northeast to Skyharbor Camp and find Captain Sorrel.', '북동쪽 하늘항구 야영지로 가서 소렐 선장을 찾으세요.')),
  S('terrace', 3, t('Windstep Terrace', '바람계단 단구'), t('Climb to Windstep Terrace.', '바람계단 단구에 오르세요.')),
  S('totems', 3, t('Wind-callers', '바람을 부르는 것'), t("Spin the wind totems with Wren's Gale.", '렌의 질풍으로 바람 토템을 회전시키세요.')),
  S('windroad', 3, t('The Wind-road', '바람길'), t('Ride the wind-road to the Stormglass Temple.', '바람길을 타고 폭풍유리 신전으로 가세요.')),
  S('pylons', 3, t('Stormglass Pylons', '폭풍유리 기둥'), t('Awaken each pylon with the reaction shown on its crest.', '각 기둥의 문양에 맞는 원소 반응으로 기둥을 깨우세요.')),
  S('warden', 3, t('The Tempest Warden', '폭풍의 파수자'), t('Defeat the Tempest Warden.', '폭풍의 파수자를 쓰러뜨리세요.')),
  S('shard3', 3, t('The Azure Skyshard', '창공의 스카이샤드'), t('Claim the Azure Skyshard.', '창공의 스카이샤드를 손에 넣으세요.')),
  S('gate', 4, t('The Astral Gate', '아스트랄 관문'), t('Go to the Astral Gate in the Starfall Basin.', '낙성 분지의 아스트랄 관문으로 가세요.')),
  S('ascend', 4, t('Starlight Ascent', '별빛 상승'), t('Ride the starlight up and glide to the Astral Sanctum.', '별빛을 타고 올라 아스트랄 성소로 활강하세요.')),
  S('sovereign', 4, t('The Hollow Sovereign', '공허의 군주'), t('Confront what waits at the heart of the Sanctum.', '성소의 심장부에서 기다리는 존재와 맞서세요.')),
  S('done', 5, t('Echoes of the Wild', '야생의 메아리'), t('The star is free. Explore the world at your leisure.', '별은 자유로워졌습니다. 마음껏 세상을 탐험하세요.')),
];

export const STEP_INDEX: Record<string, number> = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
export const stepIdx = (id: string): number => STEP_INDEX[id];

export interface SideDef {
  id: string;
  giver: string;
  title: TStr;
  desc: TStr;
  goal: number;
  reward: TStr;
}

export const SIDES: SideDef[] = [
  { id: 'kite', giver: 'pip', title: t("Pip's Sky-kite", '핍의 하늘연'), desc: t("Retrieve Pip's kite from the top of the Old Watchtower.", '낡은 망루 꼭대기에서 핍의 연을 되찾아 주세요.'), goal: 1, reward: t('120 Glimmer · 2 Sunlit Tarts', '반짝이 120 · 햇살 파이 2') },
  { id: 'boars', giver: 'tamsin', title: t('Boar Trouble', '멧돼지 소동'), desc: t('Clear the Bristleboar den in the western hollow.', '서쪽 골짜기의 멧돼지 굴을 소탕하세요.'), goal: 1, reward: t('Featherstep Anklet · 150 Glimmer', '깃털걸음 발찌 · 반짝이 150') },
  { id: 'echoes', giver: 'quill', title: t('Echoes of the Skyborne', '스카이본의 메아리'), desc: t('Find five Skyborne echoes across the land.', '대지 곳곳에서 스카이본의 메아리 다섯 개를 찾으세요.'), goal: 5, reward: t('Resonant Bell · 200 Glimmer', '공명의 종 · 반짝이 200') },
];

export const SHARD_NAMES: TStr[] = [
  t('Verdant Skyshard', '신록의 스카이샤드'),
  t('Ember Skyshard', '잿불 스카이샤드'),
  t('Azure Skyshard', '창공의 스카이샤드'),
];
export const SHARD_COLORS = [0x8aff7a, 0xff8a4a, 0x7fd8ff];
