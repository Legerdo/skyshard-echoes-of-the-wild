// Side quests, ambient NPC lines, lore echoes and tutorial hints.
import { t, type TStr } from '../core/i18n';
import type { Line } from './DialogueMain';

const L = (s: string, en: string, ko: string): Line => ({ s, t: t(en, ko) });

export const SIDE_DLG: Record<string, Line[]> = {
  pip_start: [
    L('pip', 'Hey! Hey! Are you an adventurer? My sky-kite got stuck on top of the Old Watchtower!', '저기요! 모험가죠? 제 하늘연이 낡은 망루 꼭대기에 걸렸어요!'),
    L('pip', "It's north of the village. Grown-ups say it's too high. You're not scared of high, right?", '마을 북쪽에 있어요. 어른들은 너무 높대요. 높은 거 안 무섭죠?'),
  ],
  pip_wait: [L('pip', "The watchtower is north of the village. My kite's the red one!", '망루는 마을 북쪽이에요. 빨간 연이 제 거예요!')],
  pip_done: [
    L('pip', "My kite! You're the best! Here — my whole savings. And some of Mom's tarts. Don't tell her.", '내 연이다! 최고예요! 자, 제 전 재산이에요. 엄마가 만든 파이도요. 비밀이에요.'),
  ],
  pip_after: [L('pip', "When I grow up I'm going to glide all the way to the Sanctum!", '크면 저도 성소까지 활강해서 갈 거예요!')],
  tamsin_start: [
    L('tamsin', 'You there, with the sword. Bristleboars have been tearing up my fields at night.', '거기 검 든 양반. 수정갈기 멧돼지들이 밤마다 밭을 헤집어 놔요.'),
    L('tamsin', "Their den's in the hollow west of the village. A big one leads them. Deal with it?", '굴은 마을 서쪽 움푹한 골짜기에 있어요. 큰 놈이 무리를 이끌죠. 처리해 줄래요?'),
  ],
  tamsin_wait: [L('tamsin', 'The den is in the hollow west of Dawnhollow. Mind the big one — it charges.', '굴은 새벽골 서쪽 골짜기에 있어요. 큰 놈 조심해요. 돌진해 오니까.')],
  tamsin_done: [
    L('tamsin', 'Quiet nights again! Take this anklet. My grandmother swore it made her dance lighter than a leaf.', '이제야 밤이 조용하겠네! 이 발찌 가져가요. 할머니가 이걸 차면 나뭇잎보다 가볍게 춤췄대요.'),
  ],
  tamsin_after: [L('tamsin', 'The turnips have never looked happier.', '순무들이 이렇게 행복해 보인 적이 없어요.')],
  quill_start: [
    L('quill', "Ah, a traveler! I'm Quill, scholar of the Skyborne — the old sky-kingdom.", '아, 여행자로군요! 전 퀼, 옛 하늘왕국 스카이본을 연구하는 학자입니다.'),
    L('quill', 'Their memories linger as echoes — little violet lights near old ruins. Find five for me?', '그들의 기억은 옛 유적 근처에 보랏빛 메아리로 남아 있어요. 다섯 개만 찾아 주시겠어요?'),
  ],
  quill_wait: [L('quill', 'Echoes found: {n}/5. They hide near arches, bridges and places the Skyborne loved.', '찾은 메아리: {n}/5. 아치, 다리처럼 스카이본이 사랑한 곳 근처에 숨어 있어요.')],
  quill_done: [
    L('quill', 'Five echoes! A whole chapter of history restored. Take this bell — it rings when elements collide.', '메아리 다섯 개! 역사 한 장이 되살아났어요. 이 종을 받으세요. 원소가 부딪칠 때 울린답니다.'),
  ],
  quill_after: [L('quill', 'A king who would not let go of the light... what a sad, hungry story.', '빛을 놓지 못한 왕이라... 참으로 슬프고 굶주린 이야기군요.')],
  brann: [L('brann', "Brann's the name, steel's the game. Bring me starsteel and I'll make your weapons sing.", '브랜이다. 쇠 다루는 게 내 일이지. 성철을 가져오면 무기가 노래하게 해 주마.')],
  oriel: [L('oriel', "Welcome, welcome! Oriel's Curios — tarts, trinkets and treasures from three regions!", '어서 오세요! 오리엘 잡화점이에요. 파이, 장신구, 세 지역의 보물까지!')],
  sorrel_after: [L('sorrel', "Keep your eyes on the clouds, wanderer. The wind-road remembers those who ride it.", '구름을 잘 보게, 방랑자. 바람길은 자신을 탄 이를 기억한다네.')],
  hollis: [L('hollis', "The Sanctum's been glowing at night. My goats won't stop staring at it.", '성소가 밤마다 빛나. 우리 염소들이 계속 그쪽만 쳐다본다니까.')],
  bea: [L('bea', 'They say the sky-kingdom walked on clouds. I would settle for walking to market without thornlings.', '하늘왕국 사람들은 구름 위를 걸었대요. 난 가시목 없이 장터만 가도 좋겠어요.')],
  villager_shard: [L('bea', 'Is it true? You found a Skyshard? The whole village is talking about it!', '정말이에요? 스카이샤드를 찾았다고요? 온 마을이 그 얘기뿐이에요!')],
  villager_done: [L('hollis', 'The sky is so clear now. Even the goats look relieved. Thank you, wanderer.', '하늘이 정말 맑아졌어. 염소들도 안심한 얼굴이야. 고마워, 방랑자.')],
  elder_wren: [L('elder', 'Wren keeps the windmill on the hill to the west. Climb up — the old stones have plenty of grip.', '렌은 서쪽 언덕의 풍차를 지키네. 올라가 보게. 오래된 돌이라 붙잡을 곳이 많지.')],
  elder_tree: [L('elder', 'The Elder Tree waits to the east, past Veilfall Pond. A stone ramp climbs its plateau.', '태고의 나무는 동쪽, 베일폭포 연못 너머에 있네. 돌 비탈길이 고원 위로 이어지지.')],
  elder_ch2: [L('elder', 'Ashgate lies west, where the valley narrows into the ravine. Idris will be there.', '잿빛 관문은 서쪽, 골짜기가 협곡으로 좁아지는 곳에 있네. 이드리스가 있을 걸세.')],
  elder_ch3: [L('elder', 'Two seals lit... The last shard waits in the Azure Highlands to the northeast.', '봉인 둘이 밝혀졌군... 마지막 샤드는 북동쪽 창공 고원에 있네.')],
  elder_ch4: [L('elder', 'The Sanctum is open. Whatever you find up there — come home.', '성소가 열렸네. 그 위에서 무엇을 만나든... 꼭 돌아오게.')],
  elder_done: [L('elder', "The star's light is in everything now. Even my old bones feel it.", '이제 별빛이 모든 것에 스며 있네. 이 늙은 뼈마디까지도 느껴져.')],
  fountain: [L('system', 'The fountain crystal hums softly. Your party feels refreshed.', '분수의 수정이 부드럽게 울린다. 파티가 기운을 되찾았다.')],
  gate_locked: [L('idris', 'Help me hold the line first. Then we open the gate.', '먼저 전선을 지키는 걸 도와라. 문은 그다음이다.')],
  kite: [L('system', "Pip's sky-kite, tangled on the parapet. It's in surprisingly good shape.", '난간에 얽힌 핍의 하늘연. 생각보다 멀쩡하다.')],
  trial_start: [L('system', 'Windmill Trial: glide through all the rings before time runs out!', '풍차 시련: 제한 시간 안에 모든 고리를 통과하며 활강하라!')],
  temple_sealed: [L('system', 'A storm-seal crackles over the temple steps. It answers only to the Skyshards you have not yet gathered.', '신전 계단 위로 폭풍 봉인이 번뜩인다. 아직 모으지 못한 스카이샤드에만 응답하는 듯하다.')],
  beacon_early: [L('system', 'The beacon is cold and silent. Perhaps its time has not yet come.', '봉화는 차갑고 고요하다. 아직 때가 아닌 듯하다.')],
};

export interface EchoDef {
  id: string;
  x: number;
  z: number;
  yOff?: number;
  text: TStr;
}

export const ECHOES: EchoDef[] = [
  { id: 'echo1', x: 2, z: 78, text: t("'Day one. The star came down gently, like a lantern set on a table. We named it Aster, and we loved it.'", "'첫째 날. 별은 탁자 위에 등불을 내려놓듯 조용히 내려왔다. 우리는 그 별을 아스터라 부르며 사랑했다.'") },
  { id: 'echo2', x: 146, z: 242, text: t("'The King asked Aster for more light. The star gave it gladly. Then he asked for all of it.'", "'왕은 아스터에게 더 많은 빛을 원했다. 별은 기꺼이 내주었다. 그러자 왕은 전부를 원했다.'") },
  { id: 'echo3', x: -200, z: 56, text: t("'We broke the bridges and split the star's heart in three. Let no one reach the Sanctum again.'", "'우리는 다리를 부수고 별의 심장을 셋으로 나누었다. 누구도 다시는 성소에 닿지 못하게.'") },
  { id: 'echo4', x: 234, z: -40, text: t("'The King would not leave. He said the light was his. The Sanctum sealed around him — hollow, and hungry.'", "'왕은 떠나지 않았다. 빛은 자기 것이라 했다. 성소는 그를 품은 채 봉인되었다. 텅 빈 채, 굶주린 채.'") },
  { id: 'echo5', x: 62, z: -168, text: t("'If you are reading this, the seals are failing. Carry the shards up. Set the star free. And forgive us.'", "'이 글을 읽는다면 봉인이 약해지고 있다는 뜻이다. 샤드를 가지고 올라가라. 별을 풀어 주어라. 그리고 우리를 용서해 다오.'") },
];

export interface HintDef {
  title: TStr;
  text: TStr;
}

/** Tutorial hints; {k:action} is replaced with the bound key label. */
export const HINTS: Record<string, HintDef> = {
  move: { title: t('Movement', '이동'), text: t('{k:forward}{k:left}{k:back}{k:right} to move · Mouse to look · {k:jump} to jump. Click the game to capture the mouse.', '{k:forward}{k:left}{k:back}{k:right} 이동 · 마우스로 시점 · {k:jump} 점프. 게임 화면을 클릭하면 마우스가 고정됩니다.') },
  sprint: { title: t('Sprint & Dash', '달리기와 대시'), text: t('Hold {k:sprint} to sprint. Tapping {k:sprint} dashes — use it to dodge attacks.', '{k:sprint}를 누르고 있으면 질주합니다. 짧게 누르면 대시하며 공격을 회피합니다.') },
  attack: { title: t('Combat', '전투'), text: t('{k:attack} to attack. Hold {k:attack} for a charged attack. Attack from high up to plunge!', '{k:attack} 공격 · 길게 누르면 강공격. 높은 곳에서 공격하면 낙하 공격!') },
  dodge: { title: t('Telegraphs', '공격 예고'), text: t('Red shapes on the ground warn of incoming attacks. Dash out with {k:sprint} — a last-second dodge slows time.', '바닥의 붉은 표시는 공격 예고입니다. {k:sprint}로 빠져나오세요. 아슬아슬하게 피하면 시간이 느려집니다.') },
  switch: { title: t('Party Switch', '파티 교체'), text: t('Press {k:char1}–{k:char4} to switch heroes instantly, even mid-fight. Switching in combat grants a Swap Surge.', '{k:char1}~{k:char4}로 즉시 캐릭터를 교체합니다. 전투 중 교체하면 교체 강습이 발동합니다.') },
  reaction: { title: t('Elemental Reactions', '원소 반응'), text: t('Elements cling to foes (see the mark above them). Hit an Ember-marked foe with Tide for a Steamburst!', '원소는 적에게 남습니다(머리 위 표시). 불꽃이 묻은 적을 물결로 공격하면 증기 폭발!') },
  skill: { title: t('Skills', '스킬'), text: t('{k:skill}: Elemental Skill (cooldown). {k:burst}: Elemental Burst — charges as you fight.', '{k:skill}: 원소 스킬(재사용 대기). {k:burst}: 원소 폭발. 싸울수록 충전됩니다.') },
  burst: { title: t('Burst Ready', '원소 폭발 준비'), text: t('Your Elemental Burst is charged! Press {k:burst}.', '원소 폭발이 충전되었습니다! {k:burst}를 누르세요.') },
  climb: { title: t('Climbing', '등반'), text: t('Walk into cliffs and walls to climb. {k:jump}: leap upward · {k:drop}: let go. Climbing drains stamina.', '절벽이나 벽으로 걸어가면 오릅니다. {k:jump}: 도약 · {k:drop}: 놓기. 등반은 기력을 소모합니다.') },
  glide: { title: t('Gliding', '활강'), text: t('In mid-air, press {k:jump} to open your wind-wing. Press {k:jump} again to close it.', '공중에서 {k:jump}를 누르면 바람날개를 펼칩니다. 다시 누르면 접습니다.') },
  updraft: { title: t('Updrafts', '상승 기류'), text: t('Shimmering columns are rising air. Glide into one to soar upward.', '일렁이는 기둥은 상승 기류입니다. 활강하며 들어가면 높이 떠오릅니다.') },
  map: { title: t('Map & Waystones', '지도와 웨이스톤'), text: t('{k:map} opens the map. Attuned waystones heal your party and allow fast travel.', '{k:map}로 지도를 엽니다. 공명한 웨이스톤은 파티를 회복시키고 빠른 이동을 제공합니다.') },
  heal: { title: t('Healing', '회복'), text: t('Press {k:heal} to eat a Sunlit Tart and restore HP.', '{k:heal}를 눌러 햇살 파이를 먹고 HP를 회복합니다.') },
  lockon: { title: t('Lock-On', '고정 조준'), text: t('Press {k:lockon} to lock the camera on the nearest foe.', '{k:lockon}로 가장 가까운 적에게 시점을 고정합니다.') },
  shield: { title: t('Elemental Shields', '원소 보호막'), text: t('Shielded foes take little damage. Strike with the matching element or trigger reactions to shatter it.', '보호막이 있는 적은 피해를 적게 받습니다. 같은 원소로 치거나 반응을 일으켜 깨뜨리세요.') },
  guard: { title: t('Guards', '방어'), text: t('Sentinels block frontal attacks. Terra, heavy blows and reactions break through — or strike from behind.', '파수병은 정면 공격을 막습니다. 대지 원소, 강한 타격, 반응으로 뚫거나 뒤에서 공격하세요.') },
  glideAfterSoar: { title: t('Soar', '비상'), text: t('Soaring! Press {k:jump} to open your wind-wing.', '높이 솟았습니다! {k:jump}로 바람날개를 펼치세요.') },
  jumpBeam: { title: t('Starbeam', '별빛 광선'), text: t('Jump over the sweeping beam!', '휩쓸어 오는 광선을 뛰어넘으세요!') },
  supernova: { title: t('Supernova', '초신성'), text: t('Get close to the Sovereign — the green circle is the only safe place!', '군주 가까이로! 초록 원 안만이 안전합니다!') },
  plume: { title: t('Sky Plume', '하늘 깃털'), text: t('Each Sky Plume permanently raises your maximum stamina.', '하늘 깃털을 모을 때마다 최대 기력이 영구히 늘어납니다.') },
  waystone: { title: t('Waystone', '웨이스톤'), text: t('Waystone attuned. Visit to rest and heal. Fast travel from the map ({k:map}).', '웨이스톤과 공명했습니다. 방문하면 회복하며, 지도({k:map})에서 빠른 이동이 가능합니다.') },
  monolith: { title: t('Bastion Monolith', '방벽 석주'), text: t("Idris's monolith taunts foes, pulses Terra — and you can climb it.", '이드리스의 석주는 적을 도발하고 대지 파동을 내며, 올라설 수도 있습니다.') },
  wrenSoar: { title: t("Wren's Updraft", '렌의 상승 기류'), text: t('Hold {k:skill} as Wren to launch yourself skyward.', '렌으로 {k:skill}를 길게 누르면 하늘로 솟구칩니다.') },
  swim: { title: t('Swimming', '수영'), text: t("Swimming drains stamina. Don't stray too far from shore.", '수영은 기력을 소모합니다. 물가에서 너무 멀어지지 마세요.') },
  relic: { title: t('Relic Found', '유물 발견'), text: t('Equip relics on your heroes from the Party screen ({k:inventory}).', '파티 화면({k:inventory})에서 유물을 장착하세요.') },
  starsteel: { title: t('Starsteel', '성철'), text: t('Bring starsteel to Brann the smith in Dawnhollow to reforge your weapons.', '성철을 새벽골의 대장장이 브랜에게 가져가면 무기를 강화할 수 있습니다.') },
  magma: { title: t('Molten Stones', '용암석'), text: t('Tide cools molten stones into stepping stones — for a while.', '물결 원소는 녹은 돌을 잠시 디딤돌로 식힙니다.') },
  pylon: { title: t('Reaction Pylons', '반응 기둥'), text: t('Each pylon shows two element marks. Apply one element, switch heroes, then hit it with the other.', '기둥마다 원소 문양이 두 개 있습니다. 한 원소를 입힌 뒤 교체하여 다른 원소로 치세요.') },
  totem: { title: t('Wind Totems', '바람 토템'), text: t("Strike the totems with Wren's Gale to set them spinning.", '렌의 질풍으로 토템을 쳐서 회전시키세요.') },
  beacon: { title: t('Beacons', '봉화'), text: t("Light the beacon braziers with Rowan's Ember. Ride the heat updrafts between the ledges.", '로완의 불꽃으로 봉화에 불을 붙이세요. 절벽 턱 사이는 열 상승 기류를 타고 이동합니다.') },
  bloom: { title: t('Veil-blooms', '베일꽃'), text: t("Wake the closed blooms with Mirelle's Tide — her Skill ({k:skill}) soaks everything nearby.", '미렐의 물결로 닫힌 꽃을 깨우세요. 미렐의 스킬({k:skill})은 주변을 모두 적십니다.') },
  seal: { title: t('Thorn Seal', '가시 봉인'), text: t("Burn the thorn seal with Rowan's Ember.", '로완의 불꽃으로 가시 봉인을 태우세요.') },
};
