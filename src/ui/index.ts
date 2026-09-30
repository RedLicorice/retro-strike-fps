import { compose } from '../core/compose';
import { uiHud } from './hud';
import { uiScoreboard } from './scoreboard';
import { uiScreens } from './screens';
import { uiMenus } from './menus';

/* UI is composed from per-concern parts; methods share state through `this`. */
export const UI = compose(
  uiHud,
  uiScoreboard,
  uiScreens,
  uiMenus
);