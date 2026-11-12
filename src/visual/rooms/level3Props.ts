/**
 * Level-3 signature props (Addendum 5.4 + Appendix A.1 "Ambient animation").
 * One forge-drawn prop per room id. Static art: the ambient loop stays on the
 * room's existing emitters, and an Unfinished room does not animate them.
 */
import { Painter, glyph } from './painter';

/** Ambient-animation prop for every room id in ROOM_DEFINITIONS. */
export const LEVEL3_SIGNATURE: Record<string, string> = {
  entrance_hall: 'banner',
  wizard_study: 'orb',
  spiral_stair: 'torch',
  corridor: 'sconce',
  support_pillar: 'keystone',
  storage_vault: 'ledger',
  dormitory: 'lamp',
  grand_dormitory: 'ember',
  faculty_quarters: 'hearth',
  faculty_lounge: 'teapot',
  refectory: 'plate',
  kitchen: 'pot',
  common_room: 'note',
  bathhouse: 'steam',
  class_arcane: 'glyph',
  class_nature: 'sprout',
  class_light: 'mote',
  class_shadow: 'candle',
  class_alchemy: 'cauldron',
  library: 'book',
  observatory: 'scope',
  scriptorium: 'quill',
  greenhouse: 'crop',
  meadow_paddock: 'grass',
  tide_tank: 'kelp',
  menagerie: 'paw',
  infirmary: 'cross',
  aviary: 'bird',
  sunlit_sanctum: 'sun',
  warding_chamber: 'rune',
  gloom_hutch: 'shroom',
  detention_hall: 'pendulum',
  alchemy_lab: 'bubble',
  ember_pit: 'coal',
  crystal_vivarium: 'crystal',
  workshop: 'hammer',
  glassworks: 'gob',
  weaving_room: 'shuttle',
  rift_gate: 'portal',
  training_yard: 'dummy',
  trophy_hall: 'glint',
  vegetable_patch: 'cabbage',
  herb_garden: 'herb',
  woodlot: 'log',
  quarry: 'dust',
  pond: 'fish',
  orchard: 'fruit',
  apiary: 'bee',
  courtyard_garden: 'fountain',
  standing_stones: 'stone',
  moonwell: 'moon'
};

/** Draw that room's level-3 prop centred on (x, y). Returns false if the id has none. */
export function drawSignatureProp(g: Painter, defId: string, x: number, y: number, tint: number): boolean {
  const kind = LEVEL3_SIGNATURE[defId];
  if (!kind) return false;
  g.rect(x - 5, y + 4, 10, 2).fill({ color: 0x5e5d66 });
  switch (kind) {
    case 'banner':
      g.rect(x - 4, y - 8, 8, 1.5).fill({ color: 0x6e4529 });
      g.poly([x - 3.5, y - 6.5, x + 3.5, y - 6.5, x + 3.5, y + 2, x, y + 4, x - 3.5, y + 2]).fill({ color: tint });
      glyph(g, 'star8', x, y - 2, 2, 0xf7e39a);
      break;
    case 'orb':
      g.rect(x - 1, y, 2, 4).fill({ color: 0x6e4529 });
      g.circle(x, y - 2, 3.2).fill({ color: tint });
      g.circle(x - 1, y - 3, 1).fill({ color: 0xffffff, alpha: 0.7 });
      break;
    case 'torch':
      g.rect(x - 1, y - 2, 2, 6).fill({ color: 0x3b3a40 });
      g.circle(x, y - 4, 2).fill({ color: 0xf07a5c });
      break;
    case 'sconce':
      g.rect(x - 3, y, 6, 1.5).fill({ color: 0xb08a22 });
      g.circle(x, y - 2, 1.6).fill({ color: 0xf6e08c });
      break;
    case 'keystone':
      g.poly([x, y - 5, x + 4, y, x, y + 4, x - 4, y]).fill({ color: 0xb9b8c2 });
      break;
    case 'ledger':
      g.rect(x - 4, y - 3, 8, 6).fill({ color: 0xf6f1e8 });
      g.rect(x - 4, y - 3, 2, 6).fill({ color: 0x6e4529 });
      break;
    case 'lamp':
      g.rect(x - 1, y - 1, 2, 5).fill({ color: 0x3b3a40 });
      g.circle(x, y - 3, 2.2).fill({ color: 0xf6e08c });
      break;
    case 'ember':
      g.rect(x - 4, y, 8, 4).fill({ color: 0x3b3a40 });
      g.circle(x, y - 1, 2).fill({ color: 0xf07a5c });
      break;
    case 'hearth':
      g.rect(x - 4, y - 2, 8, 6).fill({ color: 0x5e5d66 });
      g.rect(x - 2, y, 4, 4).fill({ color: 0xe8752a });
      break;
    case 'teapot':
      g.ellipse(x, y, 3, 2.2).fill({ color: 0xc9ced6 });
      g.rect(x + 2, y - 1, 2, 1.5).fill({ color: 0x8a8994 });
      g.circle(x - 1, y - 3, 1).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    case 'plate':
      g.ellipse(x, y, 4, 1.6).fill({ color: 0xf6f1e8 });
      g.circle(x, y - 1, 1.2).fill({ color: 0xe0a33a });
      break;
    case 'pot':
      g.ellipse(x, y, 3.2, 2.4).fill({ color: 0x3b3a40 });
      g.rect(x - 3, y - 2, 6, 1.2).fill({ color: 0x5e5d66 });
      break;
    case 'note':
      g.rect(x - 3, y - 4, 6, 7).fill({ color: 0xf6f1e8 });
      g.rect(x - 2, y - 2, 4, 0.6).fill({ color: 0x1b1822 });
      g.rect(x - 2, y, 3, 0.6).fill({ color: 0x1b1822 });
      break;
    case 'steam':
      g.circle(x, y + 1, 1.4).fill({ color: 0xffffff, alpha: 0.85 });
      g.circle(x - 2, y - 2, 1.1).fill({ color: 0xffffff, alpha: 0.6 });
      g.circle(x + 2, y - 3, 1).fill({ color: 0xffffff, alpha: 0.45 });
      break;
    case 'glyph':
      glyph(g, 'star8', x, y - 1, 3.2, tint);
      break;
    case 'sprout':
      g.rect(x - 0.6, y - 1, 1.2, 5).fill({ color: 0x3a6b2c });
      g.ellipse(x - 2, y - 2, 2, 1.2).fill({ color: 0x6ba34f });
      g.ellipse(x + 2, y - 3, 2, 1.2).fill({ color: 0x7db861 });
      break;
    case 'mote':
      g.poly([x - 1, y - 6, x + 1, y - 6, x + 4, y + 4, x - 4, y + 4]).fill({ color: 0xfff6dc, alpha: 0.55 });
      g.circle(x, y - 1, 1).fill({ color: 0xffffff });
      break;
    case 'candle':
      g.rect(x - 1, y - 2, 2, 6).fill({ color: 0xf6f1e8 });
      g.circle(x, y - 4, 1.3).fill({ color: 0x5fc2c2 });
      break;
    case 'cauldron':
      g.ellipse(x, y, 3.5, 2.5).fill({ color: 0x3b3a40 });
      g.circle(x, y - 3, 1.2).fill({ color: 0x7db861 });
      break;
    case 'book':
      g.rect(x - 4, y - 3, 8, 6).fill({ color: 0x6b4fbb });
      g.rect(x - 0.4, y - 3, 0.8, 6).fill({ color: 0xf6f1e8 });
      break;
    case 'scope':
      g.rect(x - 1, y, 2, 4).fill({ color: 0x6e4529 });
      g.poly([x - 2, y, x + 2, y, x + 4, y - 6, x, y - 6]).fill({ color: 0xb08a22 });
      break;
    case 'quill':
      g.poly([x, y - 6, x + 2, y + 4, x - 1, y + 3]).fill({ color: 0xf6f1e8 });
      g.circle(x, y + 4, 1).fill({ color: 0x1b1822 });
      break;
    case 'crop':
      g.rect(x - 4, y + 1, 8, 3).fill({ color: 0x5a4030 });
      g.circle(x - 2, y - 1, 1.6).fill({ color: 0x4e8b3a });
      g.circle(x + 2, y - 2, 2).fill({ color: 0x6ba34f });
      break;
    case 'grass':
      g.poly([x - 3, y + 3, x - 2, y - 4, x - 1, y + 3]).fill({ color: 0x6ba34f });
      g.poly([x, y + 3, x + 1, y - 5, x + 2, y + 3]).fill({ color: 0x4e8b3a });
      break;
    case 'kelp':
      g.poly([x, y + 4, x - 2, y - 2, x, y, x + 2, y - 5, x + 1, y + 4]).fill({ color: 0x3a6b2c });
      break;
    case 'paw':
      g.circle(x, y + 1, 2.2).fill({ color: tint });
      g.circle(x - 2, y - 2, 1).fill({ color: tint });
      g.circle(x, y - 3, 1).fill({ color: tint });
      g.circle(x + 2, y - 2, 1).fill({ color: tint });
      break;
    case 'cross':
      g.rect(x - 1, y - 4, 2, 8).fill({ color: 0xfff6dc });
      g.rect(x - 3, y - 1, 6, 2).fill({ color: 0xfff6dc });
      break;
    case 'bird':
      g.ellipse(x, y, 3, 1.6).fill({ color: 0xe8c547 });
      g.poly([x + 2, y, x + 5, y - 1, x + 2, y + 1]).fill({ color: 0xf6e08c });
      break;
    case 'sun':
      glyph(g, 'sun', x, y - 1, 3, 0xf6e08c);
      break;
    case 'rune':
      g.circle(x, y, 3.2).stroke({ color: 0x5fc2c2, width: 1 });
      glyph(g, 'star8', x, y, 1.6, 0x5fc2c2);
      break;
    case 'shroom':
      g.rect(x - 0.7, y, 1.4, 4).fill({ color: 0xf6f1e8 });
      g.ellipse(x, y - 1, 3, 1.8).fill({ color: 0x5fc2c2 });
      break;
    case 'pendulum':
      g.circle(x, y - 4, 2.2).fill({ color: 0xf6f1e8 });
      g.rect(x - 0.4, y - 2, 0.8, 6).fill({ color: 0xb08a22 });
      g.circle(x, y + 4, 1.3).fill({ color: 0xb08a22 });
      break;
    case 'bubble':
      g.circle(x, y, 2.4).stroke({ color: 0x7db861, width: 1 });
      g.circle(x - 2, y + 2, 1.2).stroke({ color: 0x9cd4ff, width: 0.8 });
      break;
    case 'coal':
      g.circle(x - 2, y + 1, 2).fill({ color: 0x5c1a0e });
      g.circle(x + 2, y + 1, 1.8).fill({ color: 0xd9472b });
      break;
    case 'crystal':
      g.poly([x, y - 5, x + 3, y, x, y + 4, x - 3, y]).fill({ color: 0x9c86e0 });
      break;
    case 'hammer':
      g.rect(x - 0.6, y - 4, 1.2, 8).fill({ color: 0x6e4529 });
      g.rect(x - 3, y - 5, 6, 2.5).fill({ color: 0x8a8994 });
      break;
    case 'gob':
      g.circle(x, y - 1, 2.2).fill({ color: 0xf07a5c });
      g.rect(x - 0.5, y + 1, 1, 3).fill({ color: 0x3b3a40 });
      break;
    case 'shuttle':
      g.ellipse(x, y, 4, 1.4).fill({ color: 0x6e4529 });
      g.rect(x - 3, y - 0.4, 6, 0.8).fill({ color: tint });
      break;
    case 'portal':
      g.ellipse(x, y, 3, 4).fill({ color: 0x7d5ba6 });
      g.circle(x, y, 1.2).fill({ color: 0xb9a6ff });
      break;
    case 'dummy':
      g.rect(x - 0.7, y - 3, 1.4, 7).fill({ color: 0x6e4529 });
      g.circle(x, y - 4, 1.8).fill({ color: 0xc9b88a });
      g.rect(x - 3, y - 2, 6, 1.2).fill({ color: 0x6e4529 });
      break;
    case 'glint':
      g.poly([x, y - 5, x + 1.2, y - 1, x + 5, y, x + 1.2, y + 1, x, y + 4, x - 1.2, y + 1, x - 5, y, x - 1.2, y - 1]).fill({ color: 0xf7e39a });
      break;
    case 'cabbage':
      g.circle(x, y, 3).fill({ color: 0x3a6b2c });
      g.circle(x - 1, y - 1, 1.4).fill({ color: 0x6ba34f });
      break;
    case 'herb':
      g.rect(x - 0.5, y - 2, 1, 6).fill({ color: 0x3a6b2c });
      g.ellipse(x - 2, y - 2, 1.6, 1).fill({ color: 0x7db861 });
      g.ellipse(x + 2, y - 1, 1.6, 1).fill({ color: 0x9c86e0 });
      break;
    case 'log':
      g.ellipse(x - 2, y, 2.2, 2.2).fill({ color: 0x6e4529 });
      g.rect(x - 2, y - 2, 6, 4).fill({ color: 0x96633b });
      g.ellipse(x + 4, y, 2.2, 2.2).fill({ color: 0xc28e5c });
      break;
    case 'dust':
      g.rect(x - 3, y, 6, 4).fill({ color: 0x8a8994 });
      g.circle(x, y - 2, 1).fill({ color: 0xc9c0b0, alpha: 0.8 });
      break;
    case 'fish':
      g.ellipse(x, y, 3.2, 1.6).fill({ color: 0x5a9ad6 });
      g.poly([x + 2, y, x + 5, y - 2, x + 5, y + 2]).fill({ color: 0x2e8b8b });
      break;
    case 'fruit':
      g.circle(x, y, 2.4).fill({ color: 0xd9472b });
      g.rect(x - 0.4, y - 4, 0.8, 2).fill({ color: 0x3a6b2c });
      break;
    case 'bee':
      g.ellipse(x, y, 2.4, 1.4).fill({ color: 0xf5ce7a });
      g.rect(x - 1, y - 1.2, 0.7, 2.4).fill({ color: 0x1b1822 });
      g.ellipse(x - 1, y - 2, 1.5, 0.7).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    case 'fountain':
      g.rect(x - 3, y + 1, 6, 3).fill({ color: 0x8a8994 });
      g.rect(x - 0.6, y - 4, 1.2, 5).fill({ color: 0x9cd4ff });
      g.circle(x, y - 4, 1.2).fill({ color: 0xd8eef7 });
      break;
    case 'stone':
      g.poly([x - 2, y + 4, x + 2, y + 4, x + 1.5, y - 5, x - 1, y - 4]).fill({ color: 0x5e5d66 });
      g.rect(x - 1, y - 1, 2, 2).fill({ color: 0x9bd4ff });
      break;
    case 'moon':
      g.circle(x, y - 1, 3).fill({ color: 0xd8d8f0 });
      g.circle(x + 1.2, y - 1.4, 2.2).fill({ color: 0x2a2533 });
      break;
    default:
      g.circle(x, y, 2).fill({ color: tint });
  }
  return true;
}
