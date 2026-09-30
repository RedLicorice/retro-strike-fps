/* Playable operators. Each maps to public/models/characters/<id>.glb (Mixamo rig, bones "mixamorig:*")
   and a portrait at public/models/characters/thumbs/<id>.png. All share the rifle animation set. */
export interface CharacterDef { id: string; name: string; tag: string }

export const CHARACTERS: CharacterDef[] = [
  { id: 'swat',          name: 'SWAT',          tag: 'TACTICAL' },
  { id: 'swat_guy',      name: 'SWAT GUY',      tag: 'TACTICAL' },
  { id: 'gas_mask',      name: 'GAS MASK',      tag: 'HAZMAT' },
  { id: 'jones',         name: 'JONES',         tag: 'OPERATOR' },
  { id: 'steve',         name: 'STEVE',         tag: 'OPERATOR' },
  { id: 'crypto',        name: 'CRYPTO',        tag: 'OPERATOR' },
  { id: 'morak',         name: 'MORAK',         tag: 'HEAVY' },
  { id: 'zlorp',         name: 'ZLORP',         tag: 'XENO' },
  { id: 'alien_soldier', name: 'ALIEN SOLDIER', tag: 'XENO' }
];

export const CHAR_BY: Record<string, CharacterDef> = {};
CHARACTERS.forEach(c => CHAR_BY[c.id] = c);
export const DEFAULT_CHARACTER = 'swat';
