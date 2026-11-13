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
import { Painter, hex, line, mix, darken, glyph } from './painter';
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
    l2Tags: ['trim:reinforced_tank_glass', 'trim:reef_coral_clusters', 'trim:bubbling_aerator_stones', 'trim:kelp_fronds'],
    l3Tags: ['trim:tide_rock_cave', 'trim:sea_glass_mosaic_band'],
    accent: 0x2e8b8b
  },
  menagerie: {
    area: 'castle',
    l2Tags: ['trim:sturdier_pen_dividers', 'trim:pen_feeding_troughs', 'trim:straw_bedding', 'trim:tamers_tool_rack'],
    l3Tags: ['trim:menagerie_name_plaques', 'trim:zoological_gallery_beam'],
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
    l2Tags: ['trim:multi_tier_perches', 'trim:wooden_nesting_boxes', 'trim:hanging_seed_feeder', 'trim:aviary_hanging_vines'],
    l3Tags: ['trim:central_perch_tree', 'trim:sky_cupola_finials'],
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
    l2Tags: ['trim:mossy_burrow_arches', 'trim:hanging_cave_roots', 'trim:glowing_mushroom_clusters'],
    l3Tags: ['trim:mossy_hollow_log', 'trim:bioluminescent_canopy'],
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
    l2Tags: ['trim:heat_stone_ring', 'trim:expanded_coal_bed', 'trim:obsidian_rock_outcrops'],
    l3Tags: ['trim:lava_glow_basin', 'trim:obsidian_hearth_hood'],
    accent: 0xd9472b
  },
  crystal_vivarium: {
    area: 'castle',
    l2Tags: ['trim:faceted_quartz_lintel', 'trim:rune_stone_sand_floor'],
    l3Tags: ['trim:floating_levitating_geode', 'trim:crystal_spire_brackets'],
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
    l2Tags: ['outdoor:wooden_rail_fence', 'outdoor:hay_rack', 'outdoor:water_trough'],
    l3Tags: ['outdoor:hedgerow_border', 'outdoor:paddock_shelter_hut', 'outdoor:outside_post_lantern'],
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
  const curbColor = room.defId === 'meadow_paddock' ? WOOD[2] : level >= 3 ? STONE[3] : WOOD[2];
  g.rect(L + 2, B - 1, W - 4, 1.5).fill({ color: curbColor, alpha: 0.9 });

  // Meadow Paddock has its own full progressive fencing, hay rack, water trough, hedge & shelter hut
  if (room.defId === 'meadow_paddock') {
    // L2+: sturdy wooden rail fence replacing rope & stakes
    for (let x = L + 3; x <= R - 4; x += 12) {
      g.rect(x, B - 12, 2, 12).fill({ color: WOOD[1] });
    }
    g.rect(L + 3, B - 10, W - 6, 1.5).fill({ color: WOOD[2] });
    g.rect(L + 3, B - 5, W - 6, 1.5).fill({ color: WOOD[2] });

    // L2+: slatted hay rack
    g.rect(L + 9, B - 13, 10, 7).fill({ color: WOOD[0] });
    g.rect(L + 10, B - 12, 8, 4.5).fill({ color: 0xe0a33a });
    for (let sx = L + 11; sx <= L + 17; sx += 2) {
      g.rect(sx, B - 13, 0.8, 7).fill({ color: WOOD[2] });
    }

    // L2+: wooden water trough
    g.rect(L + 31, B - 7, 14, 7).fill({ color: WOOD[1] });
    g.rect(L + 32.5, B - 6, 11, 2).fill({ color: 0x5a9ad6 });
    g.rect(L + 33, B - 2, 2, 2).fill({ color: WOOD[0] });
    g.rect(L + 41, B - 2, 2, 2).fill({ color: WOOD[0] });

    // L3: adds green hedgerow border, little shelter hut, outside post lantern, and plinth prop
    if (level >= 3) {
      for (let hx = L + 10; hx <= R - 34; hx += 10) {
        g.circle(hx, B - 3, 3.6).fill({ color: 0x3a6b2c });
        g.circle(hx - 1, B - 4.5, 2.1).fill({ color: 0x4e8b3a });
      }
      // Little wooden paddock shelter hut on the right (roof peak B - 24 stays inside ground trim margin)
      g.rect(R - 29, B - 15, 21, 15).fill({ color: WOOD[1] });
      g.rect(R - 26, B - 13, 15, 13).fill({ color: 0x3a2a1e });
      g.poly([R - 31, B - 15, R - 6, B - 15, R - 18.5, B - 24]).fill({ color: 0x9c4832 });
      g.rect(R - 25, B - 3, 13, 3).fill({ color: 0xe0a33a }); // straw floor inside shelter

      // Outside post lantern on left fence corner
      postLantern(g, L + 4, B, 0xf6e08c);

      // L3 signature prop on low stone plinth clear of the shelter hut
      const px = cx + 6;
      g.rect(px - 5, B - 4, 10, 4).fill({ color: STONE[1] });
      drawSignatureProp(g, room.defId, px, B - 8, tint);
    }
    return;
  }

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
      for (let fx = L + 10; pxValid(fx, R - 10); fx += 14) {
        g.circle(fx, B - 2, 1.4).fill({ color: accent });
      }
    }
  }

  // Room-specific L2/L3 outdoor flourishes at ground level
  switch (room.defId) {
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

function pxValid(fx: number, limit: number): boolean {
  return fx <= limit;
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
  const level = room.level || 1;
  if (
    room.defId === 'tide_tank' ||
    room.defId === 'menagerie' ||
    room.defId === 'aviary' ||
    room.defId === 'gloom_hutch' ||
    room.defId === 'ember_pit' ||
    room.defId === 'crystal_vivarium'
  ) {
    drawPenUpgradeTrim(g, room, box, tint, level);
    return;
  }

  const L = box.left;
  const T = box.top + 3;
  const W = box.width;
  const B = box.floorLineY;
  const R = L + W;
  const cx = L + W / 2;
  const primary = level >= 3 ? GOLDS[2] : accent;

  // Tailored L2 architectural moulding / rail (differs by room family)
  switch (room.defId) {
    case 'kitchen':
    case 'alchemy_lab':
    case 'class_alchemy':
    case 'glassworks': {
      // Copper / wrought-iron hood & manifold trim rail
      const copper = level >= 3 ? 0xdb8c46 : 0xb5651d;
      g.rect(L + 4, T + 1, W - 8, 2).fill({ color: copper });
      for (let x = L + 8; x < R - 6; x += 10) {
        g.circle(x, T + 2, 1.1).fill({ color: level >= 3 ? GOLDS[3] : 0x3b3a40 });
      }
      break;
    }
    case 'bathhouse': {
      // Aqua mosaic dado border along lower wall
      g.rect(L + 2, B - 16, W - 4, 2).fill({ color: level >= 3 ? GOLDS[2] : 0x5fc2c2 });
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
    case 'greenhouse': {
      // Trellis / cast-iron arch brackets
      g.rect(L + 2, T, W - 4, 1.5).fill({ color: level >= 3 ? GOLDS[2] : 0x3a6b2c });
      for (const fx of [L + 6, R - 6]) {
        g.rect(fx - 1, T + 1.5, 2, 7).fill({ color: 0x4e8b3a });
      }
      break;
    }
    case 'class_shadow':
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

/**
 * Bespoke L2 & L3 upgrade trims for the 6 indoor creature pens.
 * L3 strictly adds onto all L2 elements; zero wall torches, sconces, candles, or open flames.
 */
function drawPenUpgradeTrim(
  g: Painter,
  room: PlacedRoom,
  box: TrimBox,
  tint: number,
  level: number
) {
  const L = box.left;
  const T = box.top + 3;
  const W = box.width;
  const B = box.floorLineY;
  const R = L + W;
  const cx = L + W / 2;

  switch (room.defId) {
    case 'tide_tank': {
      // L2: reinforced tank glass mullions & specular sheen
      g.rect(L + 5, T + 3, W - 10, B - T - 5).stroke({ color: 0xb08a22, width: 1.5 });
      line(g, cx, T + 3, cx, B - 2, STONE[3], 1.2);
      line(g, L + 16, T + 9, L + 28, T + 21, 0xd8eef7, 0.9);
      line(g, R - 26, T + 11, R - 16, T + 21, 0xd8eef7, 0.9);

      // L2: coral clusters
      for (const [kx, col] of [[L + 22, 0xf07a5c], [R - 24, 0xe8c547]] as Array<[number, number]>) {
        g.rect(kx - 1, B - 9, 2, 7).fill({ color: col });
        g.rect(kx - 4, B - 7, 3, 1.5).fill({ color: col });
        g.rect(kx + 1, B - 11, 3, 1.5).fill({ color: col });
        g.circle(kx - 4, B - 8, 1.4).fill({ color: mix(col, 0xffffff, 0.25) });
        g.circle(kx + 3.5, B - 12, 1.5).fill({ color: mix(col, 0xffffff, 0.25) });
      }

      // L2: bubbling aerator stones on tank floor
      for (const ax of [L + 42, R - 42]) {
        g.ellipse(ax, B - 2.5, 4, 2).fill({ color: STONE[2] });
        g.circle(ax - 1, B - 6, 1).fill({ color: 0xd8eef7, alpha: 0.75 });
        g.circle(ax + 1.5, B - 10, 1.2).fill({ color: 0xd8eef7, alpha: 0.65 });
      }

      // L2: swaying kelp fronds
      for (const kx of [L + 13, cx + 14, R - 13]) {
        g.poly([kx - 1, B - 2, kx - 2.5, B - 12, kx + 0.5, B - 19, kx + 2, B - 11, kx + 1, B - 2]).fill({ color: 0x3a6b2c });
      }

      // L3: sea-glass mosaic header + tide rock cave + signature kelp prop
      if (level >= 3) {
        for (let mx = L + 6, i = 0; mx < R - 8; mx += 6, i++) {
          g.rect(mx, T + 0.5, 5, 2).fill({ color: [0x5fc2c2, 0x9cd4ff, GOLDS[2]][i % 3] });
        }
        // Layered tide rock cave archway on left
        g.poly([L + 7, B - 2, L + 7, B - 21, L + 16, B - 25, L + 29, B - 22, L + 32, B - 2]).fill({ color: STONE[1] });
        g.poly([L + 11, B - 2, L + 11, B - 16, L + 18, B - 19, L + 26, B - 16, L + 26, B - 2]).fill({ color: 0x162a3a });
        g.circle(L + 19, B - 19, 1.6).fill({ color: 0xf7e39a }); // glowing shell keystone
        drawSignatureProp(g, room.defId, R - 14, B - 6, tint);
      }
      break;
    }

    case 'menagerie': {
      // L2: sturdier iron-braced pen dividers at each bay boundary
      for (let x = L + 64; x < R; x += 64) {
        g.rect(x - 2, T + 2, 4, B - T - 2).fill({ color: WOOD[1] });
        g.rect(x - 3, B - 20, 6, 2).fill({ color: 0x3b3a40 });
        g.rect(x - 3, T + 22, 6, 2).fill({ color: 0x3b3a40 });
        g.circle(x, B - 19, 1.2).fill({ color: GOLDS[2] });
      }

      // L2: feeding troughs in bays + straw bedding along floor
      for (const tx of [L + 18, L + 82]) {
        g.rect(tx, B - 6, 16, 6).fill({ color: WOOD[2] });
        g.rect(tx + 1.5, B - 7, 13, 2).fill({ color: 0xe0a33a });
      }
      for (let sx = L + 10; sx < R - 28; sx += 11) {
        line(g, sx, B - 0.5, sx + 3, B - 3, 0xe8c547, 0.9);
        line(g, sx + 2, B - 0.5, sx + 5, B - 2.5, 0xc9b88a, 0.8);
      }

      // L2: tamer's tool rack on right bay upper wall
      const rx = R - 26;
      const ry = T + 18;
      g.rect(rx, ry, 18, 2).fill({ color: WOOD[0] });
      // Brush, net hoop, satchel
      g.rect(rx + 2, ry + 2, 2.5, 5).fill({ color: WOOD[2] });
      g.circle(rx + 9, ry + 5, 2.8).stroke({ color: 0x9cd4ff, width: 1 });
      g.rect(rx + 13, ry + 2, 4, 5).fill({ color: 0x8b4513 });

      // L3: zoological gallery tie-beam + bay name-plaque boards + paw pedestal
      if (level >= 3) {
        g.rect(L + 2, T, W - 4, 2.5).fill({ color: WOOD[0] });
        for (const px of [L + 32, cx, R - 32]) {
          const py = px === cx ? T + 12 : T + 5;
          g.rect(px - 10, py, 20, 6).fill({ color: WOOD[1] });
          g.rect(px - 8.5, py + 1, 17, 4).fill({ color: 0xf6f1e8 });
          g.rect(px - 6, py + 2.5, 12, 1.2).fill({ color: tint });
        }
        drawSignatureProp(g, room.defId, R - 14, B - 7, tint);
      }
      break;
    }

    case 'aviary': {
      // L2: multi-tier wall perches across full 2-floor height
      const perches: Array<[number, number, boolean]> = [
        [L + 3, T + 22, true],
        [R - 19, T + 38, false],
        [L + 3, T + 54, true],
        [R - 19, T + 70, false]
      ];
      for (const [px, py, isLeft] of perches) {
        g.rect(px, py, 16, 2).fill({ color: WOOD[1] });
        g.circle(isLeft ? px + 14 : px + 2, py - 1.5, 2.2).fill({ color: 0x4e8b3a });
      }

      // L2: wooden nesting boxes mounted on opposite walls
      for (const [nx, ny] of [[L + 6, T + 9], [R - 16, T + 25]] as Array<[number, number]>) {
        g.rect(nx, ny + 3, 9, 8).fill({ color: WOOD[2] });
        g.poly([nx - 1, ny + 3, nx + 10, ny + 3, nx + 4.5, ny]).fill({ color: WOOD[0] });
        g.circle(nx + 4.5, ny + 7, 1.8).fill({ color: 0x1b1822 });
      }

      // L2: hanging brass seed feeder from ceiling
      line(g, cx - 10, T, cx - 10, T + 6, 0x3b3a40, 0.8);
      g.rect(cx - 13, T + 6, 6, 8).fill({ color: GOLDS[1] });
      g.rect(cx - 12, T + 8, 4, 4).fill({ color: 0xe8c547 });

      // L2: hanging green vines
      for (const vx of [L + 15, R - 11]) {
        for (let vy = T + 1; vy < T + 18; vy += 4) {
          g.circle(vx + ((vy / 4) % 2 ? 1.5 : -1), vy, 1.8).fill({ color: vy % 8 === 1 ? 0x6ba34f : 0x4e8b3a });
        }
      }

      // L3: big central perch tree + sky cupola finials + bird signature prop
      if (level >= 3) {
        // Trunk & fork branches rising through the middle
        g.rect(cx - 2.5, B - 56, 5, 56).fill({ color: WOOD[0] });
        g.rect(cx - 1, B - 54, 2, 52).fill({ color: WOOD[1] });
        line(g, cx, B - 30, cx - 15, B - 38, WOOD[1], 2.2);
        line(g, cx, B - 42, cx + 15, B - 50, WOOD[1], 2.2);
        line(g, cx, B - 54, cx - 10, B - 63, WOOD[1], 1.8);
        // Canopy clusters
        for (const [lx, ly, lr] of [[cx, B - 60, 7], [cx - 13, B - 41, 5], [cx + 14, B - 52, 5.5]] as Array<[number, number, number]>) {
          g.circle(lx, ly, lr).fill({ color: 0x3a6b2c });
          g.circle(lx - 1.5, ly - 1.5, lr * 0.65).fill({ color: 0x6ba34f });
        }
        // Gilded ceiling cupola finials
        g.rect(L + 2, T, W - 4, 2).fill({ color: GOLDS[2] });
        for (const fx of [L + 6, R - 6]) {
          g.poly([fx - 2, T + 2, fx + 2, T + 2, fx, T + 7]).fill({ color: GOLDS[3] });
        }
        drawSignatureProp(g, room.defId, R - 11, B - 8, tint);
      }
      break;
    }

    case 'gloom_hutch': {
      // L2: mossy burrow arches along floor
      for (const bx of [L + 14, R - 15]) {
        g.ellipse(bx, B - 5, 7, 7).fill({ color: 0x3a6b2c });
        g.ellipse(bx, B - 3.5, 5, 5.5).fill({ color: 0x101326 });
      }
      // L2: hanging cave roots from ceiling
      for (let rx = L + 10, i = 0; rx <= R - 10; rx += 10, i++) {
        const len = 7 + (i % 3) * 3;
        line(g, rx, T, rx + (i % 2 ? 1.5 : -1.5), T + len, WOOD[0], 1.1);
      }
      // L2: glowing mushroom clusters (crystal/bioluminescent glow, no open flame)
      for (const [mx, my, r] of [[L + 7, B - 2, 2.6], [cx, B - 2, 2.2], [R - 7, B - 2, 2.6]] as Array<[number, number, number]>) {
        g.circle(mx, my - 3, r + 2.5).fill({ color: 0x5fc2c2, alpha: 0.18 });
        g.rect(mx - 0.7, my - 3, 1.4, 3).fill({ color: 0xe3dbce });
        g.ellipse(mx, my - 3.5, r, 1.7).fill({ color: 0x5fc2c2 });
      }

      // L3: mossy hollow log + bioluminescent canopy droplets + mushroom signature prop
      if (level >= 3) {
        g.rect(cx - 11, B - 8, 20, 8).fill({ color: WOOD[1] });
        g.ellipse(cx - 11, B - 4, 2.5, 4).fill({ color: 0x101326 });
        g.rect(cx - 9, B - 9, 16, 2.5).fill({ color: 0x4e8b3a });
        for (let sx = L + 8; sx <= R - 8; sx += 12) {
          g.circle(sx, T + 3, 1.6).fill({ color: 0x9cd4ff, alpha: 0.75 });
        }
        drawSignatureProp(g, room.defId, R - 11, B - 7, tint);
      }
      break;
    }

    case 'ember_pit': {
      // L2: masonry heat-stone ring + expanded coal bed + obsidian outcrops (NO torches/sconces)
      g.rect(L + 7, B - 4.5, W - 14, 4.5).fill({ color: 0x3b3a40 });
      g.ellipse(cx, B - 2.5, W / 2 - 11, 3.5).fill({ color: 0x5c1a0e });
      for (let kx = L + 12, i = 0; kx <= R - 12; kx += 5, i++) {
        g.circle(kx, B - 2.5 + (i % 2) * 0.8, 1.6).fill({ color: i % 2 ? 0xd9472b : 0xf07a5c });
      }
      // Obsidian rock outcrops on left & right walls
      g.poly([L + 3, B, L + 3, B - 15, L + 9, B - 11, L + 11, B]).fill({ color: 0x1b1822 });
      line(g, L + 4, B - 13, L + 8, B - 4, 0x4c4860, 0.9);
      g.poly([R - 11, B, R - 9, B - 12, R - 3, B - 16, R - 3, B]).fill({ color: 0x1b1822 });
      line(g, R - 4, B - 14, R - 7, B - 4, 0x4c4860, 0.9);

      // L3: molten lava-glow basin + obsidian hearth hood + coal signature prop
      if (level >= 3) {
        g.ellipse(cx, B - 3, 12, 4).fill({ color: 0xf59e0b, alpha: 0.9 });
        g.ellipse(cx, B - 3, 7, 2.2).fill({ color: 0xfef08a, alpha: 0.95 });
        g.poly([L + 10, T + 1, R - 10, T + 1, R - 15, T + 7, L + 15, T + 7]).fill({ color: 0x252429 });
        drawSignatureProp(g, room.defId, R - 11, B - 7, tint);
      }
      break;
    }

    case 'crystal_vivarium': {
      // L2: mineral sand floor with rune stones
      g.rect(L + 5, B - 4, W - 10, 4).fill({ color: 0xe0cfa9 });
      for (const [rx, symCol] of [[L + 18, 0x9bd4ff], [cx + 4, 0xc9b7ff], [R - 18, 0x9bd4ff]] as Array<[number, number]>) {
        g.ellipse(rx, B - 2, 3.2, 1.8).fill({ color: STONE[2] });
        g.rect(rx - 0.8, B - 2.6, 1.6, 1.2).fill({ color: symCol });
      }
      // L2: faceted crystal clusters on left & right edges
      for (const [cx0, dir] of [[L + 8, 1], [R - 8, -1]] as Array<[number, number]>) {
        g.poly([cx0, B - 2, cx0 + dir * 4, B - 2, cx0 + dir * 2, B - 16, cx0 - dir * 1.5, B - 11]).fill({ color: 0x9c86e0 });
        g.poly([cx0 + dir * 3, B - 2, cx0 + dir * 7, B - 2, cx0 + dir * 6, B - 11]).fill({ color: 0xc9b7ff });
      }

      // L3: floating levitating geode + crystal spire brackets + crystal signature prop
      if (level >= 3) {
        const gy = T + 13;
        g.circle(cx, gy, 7).fill({ color: 0x9c86e0, alpha: 0.2 });
        g.ellipse(cx, gy, 5, 4).fill({ color: 0x4e4d57 });
        g.circle(cx, gy, 2.4).fill({ color: 0xc9b7ff });
        g.circle(cx - 0.8, gy - 0.8, 1).fill({ color: 0xffffff });
        for (const sx of [L + 6, R - 6]) {
          g.poly([sx - 2, T + 9, sx + 2, T + 9, sx, T + 2]).fill({ color: 0x9bd4ff });
        }
        drawSignatureProp(g, room.defId, R - 11, B - 7, tint);
      }
      break;
    }
  }
}
