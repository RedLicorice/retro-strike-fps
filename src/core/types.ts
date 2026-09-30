import type * as BABYLON from 'babylonjs';
import type { Actor } from '../actors/actor';

/* Result of Combat.trace: world hit (actor undefined) or actor hit. */
export interface TraceHit {
  t: number;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  mat: string;
  actor?: Actor;
  head?: boolean;
}

/* Virtual-stick / touch-button state, written by Touch and read by Player & Wep. */
export interface TouchState {
  mx: number; my: number;        /* move stick, -1..1 */
  lx: number; ly: number;        /* look delta accumulated this frame */
  fire: boolean; fireEdge: boolean;
  aim: boolean; jump: boolean; sprint: boolean;
  crouchTap: boolean;            /* one-shot, same as pressing C */
  reload: boolean; thr: boolean; swap: boolean;
}

/* Root of an actor rig: carries its standing height and head height for hit boxes. */
export type RigRoot = BABYLON.TransformNode & { _h?: number; _headY?: number };
