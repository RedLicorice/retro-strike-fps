/* ------------------------------ C3. PLAYER CONTROLLER ------------------------------ */
export const GRAV = 23, STAND_H = 1.78, CROUCH_H = 1.22, PRONE_H = .62;

export const SPAWN_PROT = 3.0;
/* armour: 3 plates × 50 absorb weapon/explosive damage before health; they refill one after another
   once the operator has been idle (no damage taken or dealt, not moving) for SHIELD_IDLE seconds */
export const SHIELD_PLATES = 3, SHIELD_PER = 50, SHIELD_MAX = SHIELD_PLATES * SHIELD_PER;
export const SHIELD_IDLE = 4, SHIELD_REFILL = 1.5;   /* seconds idle before refilling, seconds per plate */
