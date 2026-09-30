import { compose } from '../../core/compose';
import { mapState } from './state';
import { mapBuilders } from './builders';
import { mapGenerator } from './generator';
import { mapCollision } from './collision';
import { mapNav } from './nav';
import { mapMesh } from './mesh';
import { mapMinimap } from './minimap';
import { mapProps } from './props';
import { mapSpatial } from './spatial';
import { mapTerrain } from './terrain';
import { mapCity } from '../city/cityGen';

/* MAP is composed from per-concern parts; methods share state through `this`. */
export const MAP = compose(
  mapState,
  mapBuilders,
  mapGenerator,
  mapCity,
  mapSpatial,
  mapTerrain,
  mapCollision,
  mapNav,
  mapMesh,
  mapProps,
  mapMinimap
);