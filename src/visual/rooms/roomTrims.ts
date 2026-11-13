/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-room-type upgrade trims (Part B: V4 room trim fixes).
 * - Every room defId in ROOM_DEFINITIONS (all 51 rooms) has its own distinct L2 and L3 trim.
 * - Outdoor rooms (area === 'grounds', 13 rooms) NEVER draw indoor trim elements
 *   ('window', 'stained_window', 'wall_shelf', 'cornice', 'wall_panelling', 'wall_banner').
 *   Instead they get outdoor fencing, stone/gravel edging, post lanterns, signposts, and planted borders.
 * - Indoor rooms (area === 'castle', 38 rooms) replace the uniform trim with room-specific
 *   architectural moulding, brass/wood/stone brackets, school alcoves, and L3 signature props.
 */
import { PlacedRoom } from '../../types/ankicaster';
import { PALETTE } from '../sprites/forge/palettes';
import { Painter, hex, line, darken, glyph } from './painter';
import { drawSignatureProp } from './level3Props';

export interface TrimBox {
  left: number;
  top: number;
  width: number;
  height: number;
  floorLineY: number;
}

export const INDOOR_ONLY_TRIM_TAGS = [
  'window',
  'stained_window',
  'wall_shelf',
  'cornice',
  'wall_panelling',
  'wall_banner'
] as const;

export type IndoorOnlyTrimTag = (typeof INDOOR_ONLY_TRIM_TAGS)[number];

const STONE = PALETTE.stone.map(hex);
const WOOD = PALETTE.wood.map(hex);
const GOLDS = PALETTE.gold.map(hex);

interface RoomTrimSpec {
  area: 'castle' | 'grounds';
  l2Tags: string[];
  l3Tags: string[];
  accent: number;
}

/**
 * Distinct per-room trim specification for all 51 ROOM_DEFINITIONS entries.
 * Each defId has unique sorted tag sets at both L2 and L3, and outdoor rooms contain 0 indoor tags.
 */
export const ROOM_TRIM_SPECS: Record<string, RoomTrimSpec> = {
  // === CASTLE ROOMS (38) ===
  entrance_hall: {
    area: 'castle',
    l2Tags: ['cornice:vault_arch', 'wall_banner:coat_of_arms'],
    l3Tags: ['cornice:gilded_arch', 'stained_window:rose_oculus', 'trim:grand_columns'],
    accent: GOLDS[2]
  },
  wizard_study: {
    area: 'castle',
    l2Tags: ['wall_shelf:arcane_tomes', 'trim:brass_astrolabe_bracket'],
    l3Tags: ['stained_window:astral_lancet', 'trim:star_finials'],
    accent: 0x6b4fbb
  },
  spiral_stair: {
    area: 'castle',
    l2Tags: ['trim:iron_handrail_studs', 'trim:stair_cresset'],
    l3Tags: ['window:arrow_slit_glaze', 'trim:gilded_newel'],
    accent: STONE[3]
  },
  corridor: {
    area: 'castle',
    l2Tags: ['cornice:passage_keystones', 'trim:torch_sconces'],
    l3Tags: ['wall_panelling:dado_wainscot', 'trim:passage_pilasters'],
    accent: 0xc28e5c
  },
  support_pillar: {
    area: 'castle',
    l2Tags: ['trim:carved_capital_bands', 'trim:masonry_buttress'],
    l3Tags: ['trim:gilded_pier_rings', 'trim:keystone_medallion'],
    accent: GOLDS[1]
  },
  storage_vault: {
    area: 'castle',
    l2Tags: ['trim:iron_vault_ribs', 'trim:tally_slate'],
    l3Tags: ['trim:brass_reinforced_arch', 'trim:guild_seal_plate'],
    accent: 0x8a8994
  },
  dormitory: {
    area: 'castle',
    l2Tags: ['trim:timber_bunk_moulding', 'trim:warm_wall_lamps'],
    l3Tags: ['wall_panelling:cozy_quilt_pelmets', 'stained_window:moon_dormer'],
    accent: 0xd97a9a
  },
  grand_dormitory: {
    area: 'castle',
    l2Tags: ['cornice:dorm_tie_beams', 'trim:brass_lantern_chain'],
    l3Tags: ['wall_panelling:canopy_valance', 'stained_window:celestial_clerestory'],
    accent: 0xe8c547
  },
  faculty_quarters: {
    area: 'castle',
    l2Tags: ['trim:hearth_mantel_corbels', 'wall_shelf:faculty_folio'],
    l3Tags: ['wall_panelling:mahogany_studs', 'stained_window:scholar_casement'],
    accent: 0x96633b
  },
  faculty_lounge: {
    area: 'castle',
    l2Tags: ['cornice:tea_gallery_moulding', 'trim:gilt_picture_wire'],
    l3Tags: ['wall_panelling:velvet_wainscot', 'stained_window:emerald_parlor_glass'],
    accent: 0x4e8b3a
  },
  refectory: {
    area: 'castle',
    l2Tags: ['trim:timber_hammerbeams', 'wall_banner:house_pennants'],
    l3Tags: ['cornice:feast_frieze', 'stained_window:harvest_triptych'],
    accent: 0xe0a33a
  },
  kitchen: {
    area: 'castle',
    l2Tags: ['trim:copper_pot_rack', 'trim:brick_range_hood'],
    l3Tags: ['trim:glazed_hearth_tiles', 'trim:brass_ladle_rail'],
    accent: 0xd9472b
  },
  common_room: {
    area: 'castle',
    l2Tags: ['trim:club_mantel_clock', 'wall_banner:academy_tassels'],
    l3Tags: ['wall_panelling:hearthside_oaks', 'stained_window:hearth_amber_pane'],
    accent: 0xd97a9a
  },
  bathhouse: {
    area: 'castle',
    l2Tags: ['trim:seafoam_mosaic_dado', 'trim:brass_steam_spouts'],
    l3Tags: ['trim:marble_pillar_flutes', 'stained_window:aqua_oculus'],
    accent: 0x5fc2c2
  },
  class_arcane: {
    area: 'castle',
    l2Tags: ['trim:chalk_compass_frieze', 'trim:arcane_runic_border'],
    l3Tags: ['stained_window:violet_star_rose', 'trim:levitating_candle_brackets'],
    accent: 0x9c86e0
  },
  class_nature: {
    area: 'castle',
    l2Tags: ['trim:trellis_ceiling_ribs', 'trim:pressed_leaf_frames'],
    l3Tags: ['stained_window:emerald_bough_arch', 'trim:living_bough_corbels'],
    accent: 0x6ba34f
  },
  class_light: {
    area: 'castle',
    l2Tags: ['cornice:sunburst_dentils', 'trim:brass_prism_sill'],
    l3Tags: ['stained_window:radiant_halo_rose', 'trim:gilded_sun_pilasters'],
    accent: 0xf6e08c
  },
  class_shadow: {
    area: 'castle',
    l2Tags: ['trim:obsidian_velvet_pelmet', 'trim:silver_crescent_studs'],
    l3Tags: ['stained_window:indigo_eclipse_lancet', 'trim:moonlit_belfry_corbels'],
    accent: 0x4c5ba3
  },
  class_alchemy: {
    area: 'castle',
    l2Tags: ['trim:copper_manifold_clamps', 'trim:riveted_slate_frieze'],
    l3Tags: ['stained_window:amber_retort_glass', 'trim:brass_condenser_pilasters'],
    accent: 0xdb8c46
  },
  library: {
    area: 'castle',
    l2Tags: ['wall_shelf:upper_mezzanine_books', 'trim:ladder_brass_stops'],
    l3Tags: ['wall_panelling:catalog_gallery_trim', 'stained_window:folio_rosette'],
    accent: 0x6b4fbb
  },
  observatory: {
    area: 'castle',
    l2Tags: ['trim:brass_azimuth_ring', 'trim:star_sector_ticks'],
    l3Tags: ['stained_window:zodiac_oculus', 'trim:gilded_orrery_ribs'],
    accent: 0x9bd4ff
  },
  scriptorium: {
    area: 'castle',
    l2Tags: ['trim:illuminated_frieze_scrolls', 'trim:inkwell_wall_pegs'],
    l3Tags: ['wall_panelling:vellum_archive_trim', 'stained_window:quill_crest_glass'],
    accent: 0xe0b860
  },
  greenhouse: {
    area: 'castle',
    l2Tags: ['trim:cast_iron_mullions', 'trim:hanging_herb_baskets'],
    l3Tags: ['trim:etched_botanical_fanlight', 'trim:copper_irrigation_rail'],
    accent: 0x7db861
  },
  tide_tank: {
    area: 'castle',
    l2Tags: ['trim:riveted_bronze_tank_rim', 'trim:kelp_lantern_hooks'],
    l3Tags: ['trim:nautilus_keystone_arch', 'trim:sea_glass_mosaic_band'],
    accent: 0x2e8b8b
  },
  menagerie: {
    area: 'castle',
    l2Tags: ['trim:habitat_divider_arches', 'trim:keeper_sign_plaques'],
    l3Tags: ['cornice:zoological_gallery_beam', 'trim:elemental_crest_medallions'],
    accent: 0x7db861
  },
  infirmary: {
    area: 'castle',
    l2Tags: ['trim:linen_curtain_brass_rod', 'trim:apotheke_cross_medallion'],
    l3Tags: ['wall_panelling:bright_birch_wainscot', 'stained_window:golden_balm_glass'],
    accent: 0xfff6dc
  },
  aviary: {
    area: 'castle',
    l2Tags: ['trim:carved_roost_brackets', 'trim:feather_wind_chime'],
    l3Tags: ['trim:gilded_cage_filigree', 'trim:sky_cupola_finials'],
    accent: 0xe8c547
  },
  sunlit_sanctum: {
    area: 'castle',
    l2Tags: ['trim:alabaster_sun_ribs', 'trim:incense_censor_hooks'],
    l3Tags: ['stained_window:solar_kaleidoscope', 'trim:gold_leaf_halo_arch'],
    accent: 0xf7e39a
  },
  warding_chamber: {
    area: 'castle',
    l2Tags: ['trim:chalk_sigil_border', 'trim:iron_salt_sconces'],
    l3Tags: ['trim:silver_rune_inlay', 'trim:protective_ward_pillars'],
    accent: 0x5fc2c2
  },
  gloom_hutch: {
    area: 'castle',
    l2Tags: ['trim:moss_lined_burrow_arch', 'trim:glowcap_shelves'],
    l3Tags: ['trim:luminous_spore_frieze', 'trim:basalt_shadow_columns'],
    accent: 0x2e8b8b
  },
  detention_hall: {
    area: 'castle',
    l2Tags: ['trim:slate_rule_plaques', 'trim:brass_hourglass_bracket'],
    l3Tags: ['wall_panelling:stern_oak_wainscot', 'trim:gilded_pendulum_casement'],
    accent: 0x8a8994
  },
  alchemy_lab: {
    area: 'castle',
    l2Tags: ['trim:copper_still_coils', 'trim:reagent_bottle_guard_rail'],
    l3Tags: ['stained_window:distillate_triptych', 'trim:brass_fume_hood_fluting'],
    accent: 0xf07a5c
  },
  ember_pit: {
    area: 'castle',
    l2Tags: ['trim:firebrick_ash_curb', 'trim:wrought_iron_tongs_rack'],
    l3Tags: ['trim:molten_bronze_relief', 'trim:obsidian_hearth_hood'],
    accent: 0xd9472b
  },
  crystal_vivarium: {
    area: 'castle',
    l2Tags: ['trim:faceted_quartz_lintel', 'trim:silver_mirror_frames'],
    l3Tags: ['stained_window:prismatic_geode_rose', 'trim:crystal_spire_brackets'],
    accent: 0x9c86e0
  },
  workshop: {
    area: 'castle',
    l2Tags: ['trim:pegboard_gauge_rail', 'trim:timber_gantry_beam'],
    l3Tags: ['trim:guild_master_mallet_crest', 'trim:reinforced_oak_trusses'],
    accent: 0xc28e5c
  },
  glassworks: {
    area: 'castle',
    l2Tags: ['trim:annealing_oven_hood', 'trim:blowpipe_iron_hooks'],
    l3Tags: ['stained_window:spun_prism_fanlight', 'trim:copper_gloryhole_rim'],
    accent: 0xf07a5c
  },
  weaving_room: {
    area: 'castle',
    l2Tags: ['trim:bobbin_peg_frieze', 'trim:dyed_skein_hooks'],
    l3Tags: ['wall_panelling:loom_tapestry_border', 'trim:gilded_spindle_pilasters'],
    accent: 0xd97a9a
  },
  trophy_hall: {
    area: 'castle',
    l2Tags: ['trim:laurel_garland_frieze', 'trim:velvet_rope_stanchions'],
    l3Tags: ['wall_panelling:museum_gilt_pilasters', 'stained_window:victor_crest_glass'],
    accent: 0xe8c547
  },

  // === GROUNDS / OUTDOOR ROOMS (13) — strictly outdoor tags only ===
  meadow_paddock: {
    area: 'grounds',
    l2Tags: ['outdoor:split_rail_fence', 'outdoor:hay_rack_post'],
    l3Tags: ['outdoor:timber_paddock_arch', 'outdoor:lantern_gate_posts'],
    accent: 0x6ba34f
  },
  rift_gate: {
    area: 'grounds',
    l2Tags: ['outdoor:carved_flagstone_apron', 'outdoor:ward_brazier_posts'],
    l3Tags: ['outdoor:veil_rune_obelisk_tips', 'outdoor:floating_anchor_stones'],
    accent: 0x9bd4ff
  },
  training_yard: {
    area: 'grounds',
    l2Tags: ['outdoor:sand_ring_curb_stones', 'outdoor:dueling_rope_posts'],
    l3Tags: ['outdoor:tournament_pennant_poles', 'outdoor:lantern_sparring_posts'],
    accent: 0xe0a33a
  },
  vegetable_patch: {
    area: 'grounds',
    l2Tags: ['outdoor:wicker_garden_hurdles', 'outdoor:wooden_bed_stakes'],
    l3Tags: ['outdoor:timber_trellis_stakes', 'outdoor:watering_barrel_plinth'],
    accent: 0x7db861
  },
  herb_garden: {
    area: 'grounds',
    l2Tags: ['outdoor:cobble_bed_edging', 'outdoor:slate_herb_signpost'],
    l3Tags: ['outdoor:lavender_border_stones', 'outdoor:copper_sundial_post'],
    accent: 0x9c86e0
  },
  woodlot: {
    area: 'grounds',
    l2Tags: ['outdoor:stacked_log_cradle', 'outdoor:forestry_marker_post'],
    l3Tags: ['outdoor:mossy_boulder_boundary', 'outdoor:forester_lantern_stump'],
    accent: 0x96633b
  },
  quarry: {
    area: 'grounds',
    l2Tags: ['outdoor:cut_granite_kerb', 'outdoor:iron_winch_chock'],
    l3Tags: ['outdoor:dressed_stone_retaining_curb', 'outdoor:surveyor_cairn_lantern'],
    accent: 0xb9b8c2
  },
  pond: {
    area: 'grounds',
    l2Tags: ['outdoor:river_pebble_bank', 'outdoor:jetty_mooring_bollard'],
    l3Tags: ['outdoor:stepping_stone_lip', 'outdoor:lily_lantern_post'],
    accent: 0x5a9ad6
  },
  orchard: {
    area: 'grounds',
    l2Tags: ['outdoor:whitewashed_trunk_guards', 'outdoor:harvest_basket_crate'],
    l3Tags: ['outdoor:stone_tree_ring_curbs', 'outdoor:orchard_lantern_pole'],
    accent: 0xd9472b
  },
  apiary: {
    area: 'grounds',
    l2Tags: ['outdoor:wildflower_turf_strip', 'outdoor:painted_hive_stand'],
    l3Tags: ['outdoor:honeycomb_signpost', 'outdoor:woven_skep_shelter_hood'],
    accent: 0xf5ce7a
  },
  courtyard_garden: {
    area: 'grounds',
    l2Tags: ['outdoor:boxwood_hedge_trim', 'outdoor:gravel_walkway_kerb'],
    l3Tags: ['outdoor:carved_stone_balustrade', 'outdoor:wrought_garden_lamp_post'],
    accent: 0x9cd4ff
  },
  standing_stones: {
    area: 'grounds',
    l2Tags: ['outdoor:moss_ring_pebbles', 'outdoor:ground_chalk_circle'],
    l3Tags: ['outdoor:glowing_monolith_inlay', 'outdoor:hearth_brazier_stones'],
    accent: 0x9bd4ff
  },
  moonwell: {
    area: 'grounds',
    l2Tags: ['outdoor:silver_pebble_apron', 'outdoor:low_stone_well_curb'],
    l3Tags: ['outdoor:moonstone_corner_cairns', 'outdoor:lantern_well_post'],
    accent: 0xd8d8f0
  }
};

/** Return sorted list of trim tags rendered for a room defId at level 1..3. */
export function getRoomTrimTags(defId: string, level: number): string[] {
  const spec = ROOM_TRIM_SPECS[defId];
  if (!spec || level < 2) return [];
  const tags = level >= 3 ? [...spec.l2Tags, ...spec.l3Tags] : [...spec.l2Tags];
  return tags.sort();
}

/** Draw bespoke L2 / L3 upgrade trim for any placed built room. */
export function drawRoomUpgradeTrim(
  g: Painter,
  room: PlacedRoom,
  box: TrimBox,
  tint: number,
  gk: string
): string[] {
  const level = room.level || 1;
  const spec = ROOM_TRIM_SPECS[room.defId];
  const tags = getRoomTrimTags(room.defId, level);
  if (level < 2) return tags;

  if (room.area === 'grounds' || spec?.area === 'grounds') {
    drawOutdoorUpgradeTrim(g, room, box, tint, spec?.accent ?? tint);
    return tags;
  }

  drawIndoorUpgradeTrim(g, room, box, tint, gk, spec?.accent ?? tint);
  return tags;
}

function drawOutdoorUpgradeTrim(
  g: Painter,
  room: PlacedRoom,
  box: TrimBox,
  tint: number,
  accent: number
) {
  const L = box.left;
  const W = box.width;
  const B = box.floorLineY;
  const R = L + W;
  const cx = L + W / 2;
  const level = room.level || 1;

  // Ground-level edging / curb stone strip (never in sky!)
  const curbColor = level >= 3 ? STONE[3] : WOOD[2];
  g.rect(L + 2, B - 1, W - 4, 1.5).fill({ color: curbColor, alpha: 0.9 });

  // Outdoor progressive fencing/posts at plot edges
  if (room.defId === 'rift_gate' || room.defId === 'quarry' || room.defId === 'standing_stones' || room.defId === 'moonwell') {
    // Low stone corner cairns / bollards on the ground line
    for (const px of [L + 4, R - 7]) {
      g.rect(px, B - 7, 3, 7).fill({ color: STONE[2] });
      g.rect(px - 0.5, B - 8, 4, 1.5).fill({ color: level >= 3 ? accent : STONE[3] });
    }
  } else {
    // Wooden rail / garden stake posts along the ground edge
    const postColor = level >= 3 ? WOOD[1] : WOOD[2];
    for (const px of [L + 3, R - 5]) {
      g.rect(px, B - 11, 2, 11).fill({ color: postColor });
      g.rect(px - 0.5, B - 12, 3, 1.5).fill({ color: level >= 3 ? GOLDS[2] : WOOD[3] });
    }
    if (level >= 3) {
      // Extra flower / tuft accent along ground curb
      for (let fx = L + 10; fx <= R - 10; fx += 14) {
        g.circle(fx, B - 2, 1.4).fill({ color: accent });
      }
    }
  }

  // Room-specific L2/L3 outdoor flourishes at ground level
  switch (room.defId) {
    case 'meadow_paddock':
      g.rect(L + 6, B - 12, 6, 4).fill({ color: 0xe0a33a }); // hay rack
      if (level >= 3) postLantern(g, L + 4, B, 0xf6e08c);
      break;
    case 'rift_gate':
      if (level >= 3) {
        g.circle(L + 5.5, B - 10, 1.8).fill({ color: 0x9bd4ff });
        g.circle(R - 5.5, B - 10, 1.8).fill({ color: 0x9bd4ff });
      }
      break;
    case 'training_yard':
      for (let px = L + 8; px < R - 8; px += 12) g.circle(px, B - 1.5, 1).fill({ color: STONE[2] });
      if (level >= 3) {
        postLantern(g, L + 5, B, 0xf6e08c);
        g.poly([R - 6, B - 16, R - 1, B - 14, R - 6, B - 12]).fill({ color: 0xd9472b });
      }
      break;
    case 'vegetable_patch':
    case 'herb_garden':
      // Wooden signpost stake on left edge
      g.rect(L + 8, B - 10, 1.5, 10).fill({ color: WOOD[1] });
      g.rect(L + 6, B - 11, 6, 3).fill({ color: level >= 3 ? GOLDS[2] : 0xe3dbce });
      break;
    case 'pond':
      for (let x = L + 8; x < R - 8; x += 10) g.circle(x, B - 1, 1.3).fill({ color: STONE[2] });
      if (level >= 3) postLantern(g, R - 8, B, 0x9cd4ff);
      break;
    case 'orchard':
      g.rect(L + 5, B - 7, 5, 5).fill({ color: WOOD[2] });
      if (level >= 3) postLantern(g, L + 4, B, 0xf5ce7a);
      break;
    case 'apiary':
      g.rect(cx - 5, B - 9, 10, 1.5).fill({ color: 0xf5ce7a });
      break;
    case 'courtyard_garden':
      if (level >= 3) postLantern(g, L + 6, B, 0xfff6dc);
      break;
    default:
      if (level >= 3) postLantern(g, L + 5, B, accent);
      break;
  }

  // L3 signature prop anchored cleanly on a low stone plinth at ground level (never floating in sky!)
  if (level >= 3) {
    const px = room.defId === 'rift_gate' ? R - 12 : R - 13;
    g.rect(px - 5, B - 4, 10, 4).fill({ color: STONE[1] });
    drawSignatureProp(g, room.defId, px, B - 8, tint);
  }
}

function postLantern(g: Painter, x: number, groundFloorY: number, glowColor: number) {
  g.rect(x - 0.75, groundFloorY - 15, 1.5, 15).fill({ color: 0x3b3a40 });
  g.rect(x - 2, groundFloorY - 18, 4, 3.5).fill({ color: GOLDS[1] });
  g.rect(x - 1, groundFloorY - 17, 2, 2).fill({ color: glowColor });
}

function drawIndoorUpgradeTrim(
  g: Painter,
  room: PlacedRoom,
  box: TrimBox,
  tint: number,
  gk: string,
  accent: number
) {
  const L = box.left;
  const T = box.top + 3;
  const W = box.width;
  const B = box.floorLineY;
  const R = L + W;
  const cx = L + W / 2;
  const level = room.level || 1;
  const primary = level >= 3 ? GOLDS[2] : accent;

  // Tailored L2 architectural moulding / rail (differs by room family)
  switch (room.defId) {
    case 'kitchen':
    case 'alchemy_lab':
    case 'class_alchemy':
    case 'glassworks':
    case 'ember_pit': {
      // Copper / wrought-iron hood & manifold trim rail
      const copper = level >= 3 ? 0xdb8c46 : 0xb5651d;
      g.rect(L + 4, T + 1, W - 8, 2).fill({ color: copper });
      for (let x = L + 8; x < R - 6; x += 10) {
        g.circle(x, T + 2, 1.1).fill({ color: level >= 3 ? GOLDS[3] : 0x3b3a40 });
      }
      break;
    }
    case 'bathhouse':
    case 'tide_tank': {
      // Aqua mosaic dado border along lower wall
      const dadoCol = room.defId === 'bathhouse' ? 0x5fc2c2 : 0x2e8b8b;
      g.rect(L + 2, B - 16, W - 4, 2).fill({ color: level >= 3 ? GOLDS[2] : dadoCol });
      for (let x = L + 5; x < R - 5; x += 6) {
        g.rect(x, B - 15.5, 2, 1).fill({ color: 0xf6f1e8 });
      }
      break;
    }
    case 'library':
    case 'scriptorium':
    case 'faculty_quarters':
    case 'wizard_study': {
      // Timber dado + brass rail / shelf bracket trim
      g.rect(L + 3, T, W - 6, 1.5).fill({ color: level >= 3 ? GOLDS[2] : WOOD[2] });
      g.rect(L + 3, B - 12, W - 6, 1).fill({ color: WOOD[0] });
      break;
    }
    case 'class_nature':
    case 'greenhouse':
    case 'menagerie': {
      // Trellis / cast-iron arch brackets
      g.rect(L + 2, T, W - 4, 1.5).fill({ color: level >= 3 ? GOLDS[2] : 0x3a6b2c });
      for (const fx of [L + 6, R - 6]) {
        g.rect(fx - 1, T + 1.5, 2, 7).fill({ color: 0x4e8b3a });
      }
      break;
    }
    case 'class_shadow':
    case 'gloom_hutch':
    case 'warding_chamber':
    case 'detention_hall': {
      // Silver / teal rune-studded border band
      g.rect(L + 2, T, W - 4, 1.5).fill({ color: level >= 3 ? 0x5fc2c2 : 0x4c5ba3 });
      for (let x = L + 8; x < R - 6; x += 12) {
        g.rect(x, T + 2, 1.5, 1.5).fill({ color: level >= 3 ? 0xc9ced6 : accent });
      }
      break;
    }
    case 'support_pillar':
    case 'spiral_stair':
    case 'storage_vault':
    case 'corridor': {
      // Cut-stone chamfered ribs & corbel brackets
      g.rect(L + 2, T, W - 4, 2).fill({ color: level >= 3 ? GOLDS[2] : STONE[3] });
      for (const kx of [L + 4, R - 7]) {
        g.poly([kx, T + 2, kx + 3, T + 2, kx + 1.5, T + 6]).fill({ color: STONE[2] });
      }
      break;
    }
    default: {
      // Carved cornice with room accent dentils
      g.rect(L + 2, T, W - 4, 1.5).fill({ color: primary });
      for (let x = L + 6; x < R - 4; x += 8) {
        g.rect(x, T + 1.5, 2, 1.5).fill({ color: darken(primary, 0.78) });
      }
      break;
    }
  }

  // Room-specific L2 corner crest / plaque (top-right clear of centered room title)
  const badgeX = R - 9;
  const badgeY = T + 7;
  g.poly([
    badgeX - 3.5, badgeY - 3.5,
    badgeX + 3.5, badgeY - 3.5,
    badgeX + 3.5, badgeY + 1,
    badgeX, badgeY + 4.5,
    badgeX - 3.5, badgeY + 1
  ]).fill({ color: level >= 3 ? GOLDS[1] : STONE[2] });
  glyph(g, gk, badgeX, badgeY, 2, level >= 3 ? GOLDS[3] : accent);

  // L3 bespoke architectural centerpiece + pilasters + signature prop
  if (level >= 3) {
    // Gilded side pilasters
    for (const fx of [L + 3, R - 3]) {
      g.circle(fx, T + 2, 1.6).fill({ color: GOLDS[3] });
      g.rect(fx - 0.75, T + 3, 1.5, B - T - 3).fill({ color: primary, alpha: 0.55 });
    }

    // Room-tailored L3 window / frieze / rack detail
    const wx = L + 11;
    const wy = T + 5;
    if (
      room.defId === 'entrance_hall' ||
      room.defId.startsWith('class_') ||
      room.defId === 'library' ||
      room.defId === 'observatory' ||
      room.defId === 'sunlit_sanctum' ||
      room.defId === 'trophy_hall' ||
      room.defId === 'refectory'
    ) {
      // Stained-glass lancet / rosette in room accent
      g.rect(wx - 1, wy - 1, 10, 13).fill({ color: GOLDS[1] });
      g.rect(wx, wy, 8, 11).fill({ color: accent });
      g.rect(wx + 1, wy + 1, 2.5, 2.5).fill({ color: 0xffffff, alpha: 0.45 });
      line(g, wx + 4, wy, wx + 4, wy + 11, GOLDS[2], 0.6);
      line(g, wx, wy + 5.5, wx + 8, wy + 5.5, GOLDS[2], 0.6);
    } else if (room.defId === 'kitchen' || room.defId === 'alchemy_lab' || room.defId === 'workshop') {
      // Brass/copper hanging tool & vessel bar
      g.rect(wx, wy + 1, 16, 1.5).fill({ color: GOLDS[2] });
      for (let i = 0; i < 3; i++) {
        g.circle(wx + 3 + i * 5, wy + 5, 1.6).fill({ color: accent });
      }
    } else {
      // Gilded framed emblem plaque
      g.rect(wx, wy, 10, 10).fill({ color: GOLDS[1] });
      g.rect(wx + 1, wy + 1, 8, 8).fill({ color: darken(tint, 0.7) });
      glyph(g, gk, wx + 5, wy + 5, 2.5, GOLDS[3]);
    }

    // Signature prop on a wall bracket / pedestal
    const propX = Math.max(L + 16, Math.min(R - 14, cx + W * 0.25));
    drawSignatureProp(g, room.defId, propX, T + 17, tint);
  }
}
