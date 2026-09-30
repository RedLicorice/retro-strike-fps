import { compose } from '../core/compose';
import { combatDamage } from './damage';
import { combatExplosives } from './explosives';

/* Combat is composed from per-concern parts; methods share state through `this`. */
export const Combat = compose(
  combatDamage,
  combatExplosives
);