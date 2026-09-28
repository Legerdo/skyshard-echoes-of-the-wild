// Shared game context passed to subsystems (avoids circular imports).
import type * as THREE from 'three';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import type { CameraRig } from '../player/CameraRig';
import type { VFX } from '../fx/VFX';
import type { EventBus } from '../core/Events';
import type { Elem, Reaction } from '../combat/Elements';

export interface GameEvents extends Record<string, unknown> {
  enemyKilled: { type: string; x: number; z: number; camp?: string; elite?: boolean; boss?: boolean };
  reaction: { r: Reaction; x: number; y: number; z: number };
  elementHit: { elem: Elem; x: number; y: number; z: number; r: number; charId: string };
  interact: { id: string };
  playerHurt: { amount: number };
  memberDown: { id: string };
  switched: { id: string };
  levelUp: { level: number };
  itemGained: { id: string; n: number };
  chest: { id: string };
  discover: { id: string };
  questStep: { id: string };
  shard: { index: number };
  bossPhase: { phase: number };
  bossDefeated: { id: string };
  flag: { flag: string };
  talk: { npc: string };
  monolith: { x: number; y: number; z: number; active: boolean };
}

export interface SfxApi {
  play(name: string, opts?: { pos?: THREE.Vector3; vol?: number; pitch?: number }): void;
}

export interface Ctx {
  world: World;
  player: Player;
  cam: CameraRig;
  fx: VFX;
  bus: EventBus<GameEvents>;
  sfx: SfxApi;
  time: number;
  /** Seconds of hit-stop requested. */
  hitstop(t: number): void;
  slowmo(t: number, scale: number): void;
  shake(a: number): void;
  toast(text: string, color?: string): void;
  /** Show a contextual tutorial hint once (id from the hint table). */
  hint(id: string): void;
}
