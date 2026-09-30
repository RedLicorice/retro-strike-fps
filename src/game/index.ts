import { compose } from '../core/compose';
import { gameState } from './state';
import { gameMatch } from './match';
import { gameSpawning } from './spawning';
import { gameThrowables } from './throwables';
import { gameHorde } from './horde';

/* Game is composed from per-concern parts; methods share state through `this`. */
export const Game = compose(
  gameState,
  gameMatch,
  gameSpawning,
  gameThrowables,
  gameHorde
);