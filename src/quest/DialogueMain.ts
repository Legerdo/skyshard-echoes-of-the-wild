// Main story dialogue (English / Korean). Kept short and readable on purpose.
import { t, type TStr } from '../core/i18n';

export interface Line {
  s: string;
  t: TStr;
}

export interface Speaker {
  name: TStr;
  color: string;
  role?: TStr;
}

export const SPEAKERS: Record<string, Speaker> = {
  rowan: { name: t('Rowan', '로완'), color: '#ff8a5c' },
  mirelle: { name: t('Mirelle', '미렐'), color: '#6ec8ff' },
  wren: { name: t('Wren', '렌'), color: '#7ff0c8' },
  idris: { name: t('Idris', '이드리스'), color: '#f0c060' },
  elder: { name: t('Elder Maelis', '마엘리스 장로'), color: '#d8c8ff', role: t('Star-watcher of Dawnhollow', '새벽골의 별지기') },
  oriel: { name: t('Oriel', '오리엘'), color: '#ffb87a', role: t('Merchant', '상인') },
  brann: { name: t('Brann', '브랜'), color: '#ffa060', role: t('Blacksmith', '대장장이') },
  pip: { name: t('Pip', '핍'), color: '#ffe07a', role: t('Village kid', '마을 아이') },
  tamsin: { name: t('Tamsin', '탬신'), color: '#c8e07a', role: t('Farmer', '농부') },
  quill: { name: t('Quill', '퀼'), color: '#c8b0ff', role: t('Scholar of the Skyborne', '하늘왕국 학자') },
  sorrel: { name: t('Captain Sorrel', '소렐 선장'), color: '#8ad8ff', role: t('Skyharbor Fleet', '하늘항구 선단') },
  hollis: { name: t('Hollis', '홀리스'), color: '#e0d0b0', role: t('Goatherd', '염소치기') },
  bea: { name: t('Bea', '베아'), color: '#f0c0d0', role: t('Baker', '제빵사') },
  tree: { name: t('The Elder Tree', '태고의 나무'), color: '#9aff8a' },
  sovereign: { name: t('The Hollow Sovereign', '공허의 군주'), color: '#d0a0ff' },
  system: { name: t('', ''), color: '#f3d38a' },
  echo: { name: t('Skyborne Echo', '하늘왕국의 메아리'), color: '#b8a0ff' },
};

const L = (s: string, en: string, ko: string): Line => ({ s, t: t(en, ko) });

export const DLG: Record<string, Line[]> = {
  dock_mirelle: [
    L('mirelle', 'You made it! And the skiff is still in one piece. Mostly.', '왔구나! 비행정도 멀쩡하네. 거의.'),
    L('rowan', '"Mostly" is my specialty. You sent the letter?', '"거의"가 내 특기지. 편지 보낸 사람이 너야?'),
    L('mirelle', "Elder Maelis did. I'm Mirelle. I patch people up — and I shoot things that need shooting.", '마엘리스 장로님이 보내셨어. 난 미렐. 다친 사람을 치료하고, 쏴야 할 건 쏴.'),
    L('mirelle', 'Look north, above the basin. The Astral Sanctum. It woke up three nights ago.', '북쪽을 봐. 분지 위에 떠 있는 저거. 아스트랄 성소야. 사흘 전에 깨어났어.'),
    L('rowan', 'Huge, glowing and ominous. Great. Where do we start?', '크고, 빛나고, 불길하네. 좋아. 어디서부터 시작하지?'),
    L('mirelle', "Dawnhollow, just up the road. The Elder will explain. And I'm coming with you.", '길 따라가면 바로 새벽골이야. 장로님이 설명해 주실 거야. 그리고 나도 같이 갈게.'),
    L('system', 'Mirelle joined the party!', '미렐이 파티에 합류했다!'),
  ],
  fields_ambush: [
    L('mirelle', "Thornlings! They've never come this close to the village!", '가시목이야! 마을까지 내려온 적은 없었는데!'),
  ],
  fields_after: [
    L('mirelle', 'Did you see that? Your fire, my water — boom. Steam everywhere.', '봤어? 네 불꽃에 내 물이 닿으니까 펑! 온통 증기였어.'),
    L('rowan', "I'll call that a plan. Let's keep doing it.", '그걸 작전이라고 부르자. 계속 그렇게 하는 거야.'),
    L('mirelle', 'Elements cling to monsters for a while. Swap to me and strike while it lingers.', '원소는 한동안 몬스터에 남아. 그때 나로 교체해서 공격하면 돼.'),
  ],
  elder_intro: [
    L('elder', 'So you are the wanderer who follows falling stars. Welcome to Dawnhollow.', '떨어지는 별을 쫓는 방랑자가 바로 그대로군. 새벽골에 온 걸 환영하네.'),
    L('elder', 'Long ago a star fell here and shattered. The old sky-kingdom built the Sanctum around its heart.', '아주 오래전, 별 하나가 이곳에 떨어져 부서졌지. 옛 하늘왕국은 그 심장 위에 성소를 세웠다네.'),
    L('elder', 'Three great pieces — the Ancient Skyshards — were hidden across the land to seal it shut.', '가장 큰 세 조각, 고대 스카이샤드는 성소를 봉인하기 위해 대지 곳곳에 숨겨졌지.'),
    L('elder', 'Now something inside is stirring, and it is twisting the wild. Thornlings, fire-wisps... worse, soon.', '그런데 지금 그 안의 무언가가 꿈틀대며 야생을 비틀고 있네. 가시목, 불도깨비... 곧 더한 것도.'),
    L('elder', 'Only the three Skyshards can open the Sanctum — and end what waits within.', '성소를 열고 그 안에 기다리는 것을 끝낼 수 있는 건 세 스카이샤드뿐이라네.'),
    L('rowan', 'Three shards, one angry sky-castle. Where is the first?', '샤드 셋에 화난 하늘 성 하나. 첫 번째는 어디 있죠?'),
    L('elder', 'The Elder Tree east of the village has been humming like a struck bell. The first shard sleeps there.', '마을 동쪽의 태고의 나무가 종처럼 울리고 있네. 첫 번째 샤드는 거기 잠들어 있지.'),
    L('elder', 'But first, climb Windmill Hill and find Wren. No one knows the winds better — and you will need wings.', '하지만 먼저 풍차 언덕에 올라 렌을 찾게. 바람을 그 아이만큼 아는 이는 없고, 자네에겐 날개가 필요할 테니.'),
  ],
  wren_top: [
    L('wren', 'Oh! A climber! The swallows said someone loud was coming up.', '앗! 등반가다! 제비들이 시끄러운 사람이 올라온다고 했어.'),
    L('rowan', 'The swallows are... not wrong.', '제비들 말이... 틀리진 않네.'),
    L('wren', "I'm Wren. I keep the mill turning and the sky friendly. The Elder sent you for the shards, right?", '난 렌. 풍차를 돌리고 하늘을 다정하게 지켜. 장로님이 샤드 때문에 보냈지?'),
    L('wren', 'Here — a wind-wing! Jump from anywhere high, press jump again, and the air will carry you.', '자, 바람날개야! 높은 데서 뛰어내린 다음 점프를 한 번 더 누르면 바람이 널 실어 줄 거야.'),
    L('wren', 'Rising air lifts you higher. Look for the shimmering columns!', '상승 기류를 타면 더 높이 오를 수 있어. 일렁이는 공기 기둥을 찾아봐!'),
    L('wren', "And I'm coming too. The birds have been scared silent for days. I want to know why.", '그리고 나도 갈래. 새들이 며칠째 겁먹고 조용해. 이유를 알고 싶어.'),
    L('system', 'Wren joined the party! Wind-wing obtained.', '렌이 파티에 합류했다! 바람날개를 얻었다.'),
  ],
  tree_arrive: [
    L('mirelle', "The tree's heart is sealed in thorns... and something inside is humming.", '나무의 심장이 가시로 봉인돼 있어... 안에서 뭔가 울리고 있고.'),
    L('wren', 'The Veil-blooms around it are shut tight. They are thirsty — the tree is sick.', '주변의 베일꽃들이 꼭 닫혀 있어. 목이 마른 거야. 나무가 아파.'),
    L('mirelle', "Then let's give them water. My Tide should wake them.", '그럼 물을 주자. 내 물결이면 깨어날 거야.'),
  ],
  tree_blooms_done: [
    L('tree', '...warm... the water remembers... burn the thorns that bind me...', '...따뜻하다... 물이 기억하는구나... 나를 옭아맨 가시를 태워다오...'),
    L('rowan', 'Did the tree just talk? Okay. Burning things is finally my department.', '방금 나무가 말했어? 좋아. 태우는 건 드디어 내 담당이지.'),
  ],
  tree_guardian: [
    L('wren', "The ground is shaking — something's coming out of the roots!", '땅이 흔들려. 뿌리에서 뭔가 나오고 있어!'),
    L('rowan', "The tree's guardian — and it's been twisted! Take it down!", '나무의 수호자야. 뒤틀려 버렸어! 쓰러뜨리자!'),
  ],
  shard1: [
    L('mirelle', "The Verdant Skyshard... it's warm, like sunlight on water.", '신록의 스카이샤드... 물 위의 햇살처럼 따뜻해.'),
    L('wren', 'Look! One of the lights on the Sanctum just woke up!', '봐! 성소의 빛 하나가 방금 켜졌어!'),
    L('rowan', "One down. Let's tell the Elder.", '하나 끝. 장로님께 알리자.'),
  ],
  elder_shard1: [
    L('elder', 'You carry it... I felt the Sanctum answer from here. One seal of three is lit.', '가져왔군... 여기서도 성소가 응답하는 걸 느꼈네. 세 봉인 중 하나가 밝혀졌어.'),
    L('elder', 'The second shard lies in the Ember Ravine, west beyond Ashgate, where the Cinder Spire burns.', '두 번째 샤드는 잿빛 관문 너머 서쪽, 잿불 첨탑이 타오르는 잿불 협곡에 있네.'),
    L('elder', 'The gate has been shut since the fire-beasts came. The last knight of Ashgate still holds it — Idris.', '불의 짐승들이 나타난 뒤로 관문은 닫혀 있지. 잿빛 관문의 마지막 기사, 이드리스가 아직 지키고 있다네.'),
    L('elder', 'Take this starsteel. Brann the smith can reforge your weapons with it.', '이 성철을 가져가게. 대장장이 브랜이 자네들 무기를 다시 벼려 줄 걸세.'),
  ],
  ashgate_idris: [
    L('idris', 'Travelers? No — fighters. Good. The ravine spills over this wall every night.', '여행자인가? 아니, 싸울 줄 아는군. 잘됐다. 협곡의 것들이 매일 밤 벽을 넘어온다.'),
    L('idris', 'They are coming again. Hold the line with me.', '또 온다. 나와 함께 전선을 지켜라.'),
  ],
  ashgate_after: [
    L('idris', '...You fight like people with nothing to lose.', '...잃을 것 없는 사람들처럼 싸우는군.'),
    L('rowan', "We're after the Ember Skyshard. In the Cinder Spire.", '우린 잿불 스카이샤드를 찾고 있어. 잿불 첨탑에.'),
    L('idris', 'Then you need someone who knows the ravine. I have held this gate alone for a year.', '그렇다면 협곡을 아는 자가 필요하겠지. 난 일 년 동안 홀로 이 관문을 지켰다.'),
    L('idris', 'It is time the gate opened. I am Idris. My shield is yours.', '이제 관문을 열 때다. 나는 이드리스. 내 방패는 너희의 것이다.'),
    L('system', 'Idris joined the party!', '이드리스가 파티에 합류했다!'),
    L('idris', 'The bridge beyond is broken. Hot air rises from the chasm — glide on it to cross.', '너머의 다리는 끊어졌다. 협곡 틈에서 뜨거운 바람이 솟으니, 그걸 타고 활강해 건너라.'),
  ],
  spire_arrive: [
    L('idris', 'The Cinder Spire. My order lit its three beacons to guide the sky-ships home.', '잿불 첨탑이다. 우리 기사단은 세 봉화를 밝혀 하늘배들의 귀항을 인도했지.'),
    L('idris', "Light them again and the spire's heart will wake. The heat will carry you up.", '다시 불을 붙이면 첨탑의 심장이 깨어난다. 열기가 너희를 위로 실어 줄 것이다.'),
    L('wren', 'Updrafts! I love updrafts!', '상승 기류다! 나 상승 기류 정말 좋아해!'),
  ],
  spire_awake: [
    L('idris', 'All three burn. Listen — the mountain is breathing.', '셋 모두 타오른다. 들어라, 산이 숨 쉬고 있다.'),
    L('mirelle', 'The summit. Whatever guards the shard is up there.', '정상이야. 샤드를 지키는 무언가가 저 위에 있어.'),
  ],
  cinderhorn: [
    L('idris', "Cinderhorn... the spire's old guardian. The shard's fire has driven it mad.", '잿불뿔... 첨탑의 옛 수호자다. 샤드의 불길에 미쳐 버렸군.'),
    L('rowan', 'Then we cool it down. Mirelle — your water!', '그럼 식혀 주자. 미렐, 물을 부탁해!'),
  ],
  shard2: [
    L('idris', 'The Ember Skyshard. My order died protecting this. They would be glad it is in your hands.', '잿불 스카이샤드. 우리 기사단은 이걸 지키다 스러졌다. 너희 손에 있다면 기뻐하겠지.'),
    L('mirelle', 'Two seals lit. The last shard... I can feel it pulling northeast, toward the storm over the highlands.', '봉인 둘이 밝혀졌어. 마지막 샤드는... 북동쪽 고원 위 폭풍 쪽으로 끌려가는 게 느껴져.'),
    L('wren', 'The Azure Highlands! Head for Skyharbor Camp — the sky-sailors know those peaks.', '창공 고원이야! 하늘항구 야영지로 가자. 하늘 뱃사람들이 그 봉우리를 잘 알아.'),
  ],
  camp_sorrel: [
    L('sorrel', "Ho there! Wanderers on the high road? Captain Sorrel, of what's left of the Skyharbor fleet.", '어이! 높은 길의 방랑자들인가? 하늘항구 선단... 의 남은 전부, 소렐 선장일세.'),
    L('sorrel', "The Stormglass Temple? Up in the clouds past the terrace. Nobody's reached it since the storms came.", '폭풍유리 신전? 단구 너머 구름 위에 있지. 폭풍이 온 뒤로 아무도 닿지 못했어.'),
    L('sorrel', 'The old wind-road starts at Windstep Terrace. Wake the wind totems there and the currents will rise.', '옛 바람길은 바람계단 단구에서 시작하네. 거기 바람 토템을 깨우면 기류가 솟아오를 걸세.'),
    L('sorrel', "I'd go myself, but my balloon has a hole the size of my pride.", '내가 가고 싶지만, 내 기구엔 내 자존심만 한 구멍이 났거든.'),
  ],
  terrace_arrive: [
    L('wren', "These totems are wind-callers! Give them a push of Gale and they'll wake the road.", '이 토템들은 바람을 부르는 거야! 질풍으로 한 번씩 밀어 주면 바람길이 깨어날 거야.'),
  ],
  windroad_open: [
    L('wren', "Hear that? The wind-road is singing! Ride the currents up to the floating stones.", '들려? 바람길이 노래해! 기류를 타고 떠 있는 돌들까지 올라가자.'),
  ],
  temple_arrive: [
    L('mirelle', 'The Stormglass Temple... the pylons are dark. Each one bears two marks.', '폭풍유리 신전... 기둥들이 꺼져 있어. 기둥마다 문양이 두 개씩 있네.'),
    L('idris', 'Elements, paired. It wants reactions, not brute force.', '짝지어진 원소다. 힘이 아니라 반응을 원하는 거다.'),
  ],
  warden: [
    L('wren', "The storm's taking shape — look out!", '폭풍이 형체를 갖추고 있어. 조심해!'),
    L('idris', 'It shifts its shield. Match the element, or break it with reactions.', '방패의 원소를 바꾼다. 같은 원소를 맞히거나 반응으로 부숴라.'),
  ],
  shard3: [
    L('mirelle', "The Azure Skyshard. All three... they're resonating together.", '창공의 스카이샤드. 셋 모두... 서로 공명하고 있어.'),
    L('wren', 'Look at the sky—!', '하늘을 봐...!'),
  ],
  sanctum_vision: [
    L('elder', 'Wanderer... the seals are broken. Starlight will rise from the Astral Gate in the basin. End this — and come home.', '방랑자여... 봉인이 풀렸네. 분지의 아스트랄 관문에서 별빛이 솟을 걸세. 끝을 내고... 돌아오게.'),
  ],
  gate_open: [
    L('idris', 'The starlight rises. This is the path.', '별빛이 솟는다. 이것이 길이다.'),
    L('rowan', 'Everyone ready? No turning back once we are up there.', '다들 준비됐지? 올라가면 돌아올 수 없어.'),
    L('mirelle', "We didn't come this far to turn around.", '돌아서려고 여기까지 온 거 아니야.'),
  ],
  sanctum_arrive: [
    L('wren', "It's so quiet up here... even the wind is holding its breath.", '여긴 너무 조용해... 바람마저 숨을 죽이고 있어.'),
    L('mirelle', 'There, at the heart. Something is feeding on the star.', '저기, 심장부에. 뭔가가 별을 먹어 치우고 있어.'),
  ],
  sovereign_intro: [
    L('sovereign', 'Little lights. You carried my keys all the way to my door.', '작은 빛들이여. 내 열쇠를 문 앞까지 가져다주었구나.'),
    L('sovereign', 'I was king of the sky when your ancestors dug in the mud. The star is MINE.', '너희 조상이 진흙을 파던 시절, 나는 하늘의 왕이었다. 별은 나의 것이다.'),
    L('rowan', "Funny. It doesn't look like it wants to be yours.", '웃기네. 별은 네 것이 되고 싶어 하지 않는 것 같은데.'),
    L('sovereign', 'Then I will take it — and you — apart.', '그렇다면 별도, 너희도 산산이 부숴 주마.'),
  ],
  sovereign_p2: [L('sovereign', 'You burn brighter than I thought. No matter — I will swallow the sky itself!', '생각보다 밝게 타는구나. 상관없다. 하늘 자체를 삼켜 주마!')],
  sovereign_p3: [L('sovereign', 'ENOUGH! Behold the light of a dying star!', '그만! 죽어 가는 별의 빛을 보아라!')],
};

export const ENDING_LINES: TStr[] = [
  t('The Hollow Sovereign crumbled into dust and starlight.', '공허의 군주는 먼지와 별빛으로 부서져 내렸다.'),
  t('Freed at last, the heart of the fallen star rose — and its light rained across the land.', '마침내 풀려난 별의 심장이 떠올랐고, 그 빛이 온 대지에 비처럼 내렸다.'),
  t('Thorns softened into blossom. The ravine cooled to warm stone. The storms broke into clear sky.', '가시는 꽃으로 피어났다. 협곡은 따스한 돌로 식었고, 폭풍은 맑은 하늘로 갈라졌다.'),
  t('In Dawnhollow, the lanterns were lit all night long.', '새벽골에서는 밤새도록 등불이 꺼지지 않았다.'),
  t('And the wanderer who followed falling stars... decided to stay a while.', '그리고 떨어지는 별을 쫓던 방랑자는... 조금 더 머물기로 했다.'),
];

export const INTRO_LINES: TStr[] = [
  t('Long ago, a star fell from the sky and shattered.', '아주 오래전, 하늘에서 별 하나가 떨어져 부서졌다.'),
  t('The sky-kingdom that sheltered its heart fell silent, and its shards were scattered across the land.', '그 심장을 품었던 하늘왕국은 침묵했고, 파편들은 대지 곳곳으로 흩어졌다.'),
  t('Now the shards are waking... and the wild is twisting.', '이제 파편들이 깨어나고... 야생이 뒤틀리고 있다.'),
  t('Following a letter and a falling star, a wanderer arrives at the edge of the world.', '한 통의 편지와 떨어지는 별을 따라, 방랑자가 세상의 끝자락에 도착한다.'),
];
