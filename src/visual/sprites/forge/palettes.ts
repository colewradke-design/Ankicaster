/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Master Palette Ramps & Definitions
 * Appendix C of Visual Overhaul Addendum
 */

export const PALETTE = {
  // C.1 School Ramps
  schools: {
    arcane: {
      ramp: ['#2E2160', '#4B3796', '#6B4FBB', '#9C86E0'],
      accent: ['#5A5F69', '#8A909B', '#C9CED6', '#EEF1F5'],
      glyph: 'star8'
    },
    nature: {
      ramp: ['#24451C', '#3A6B2C', '#4E8B3A', '#7DB861'],
      accent: ['#6E4A14', '#9C6A1E', '#E0A33A', '#F5CE7A'],
      glyph: 'leaf'
    },
    light: {
      ramp: ['#8F7420', '#C4A233', '#E8C547', '#F6E08C'],
      accent: ['#C9B88A', '#E6D9B0', '#FFF6DC', '#FFFFFF'],
      glyph: 'sun'
    },
    shadow: {
      ramp: ['#151A38', '#222B57', '#2F3A73', '#4C5BA3'],
      accent: ['#123B3B', '#1C5757', '#2E8B8B', '#5FC2C2'],
      glyph: 'crescent'
    },
    alchemy: {
      ramp: ['#5E3410', '#8A4C17', '#B5651D', '#DB8C46'],
      accent: ['#5C1A0E', '#8F2A17', '#D9472B', '#F07A5C'],
      glyph: 'flask'
    }
  },

  // Veil Ramps
  veil: ['#3D2856', '#7D5BA6', '#B9A6FF', '#9BD4FF'],

  // Neutrals
  stone: ['#3B3A40', '#5E5D66', '#8A8994', '#B9B8C2'],
  plaster: ['#9E958A', '#C4BBAE', '#E3DBCE', '#F6F1E8'],
  wood: ['#4A2E1C', '#6E4529', '#96633B', '#C28E5C'],
  slate: ['#2A3340', '#3E4A5C', '#57677D', '#7C8DA3'],
  earth: ['#3A2A1E', '#5A4030', '#7A5A40', '#9C7A58'],
  grass: ['#2F5A2A', '#4A7D3A', '#6BA34F', '#9CCB72'],
  gold: ['#7A5A12', '#B08A22', '#DDB843', '#F7E39A'],

  // Skin tones (8 tones, key shades)
  skins: [
    '#F6D7C3', '#EDC0A0', '#D9A07A', '#C08560',
    '#A06A48', '#845236', '#643C26', '#4A2A1A'
  ],

  // Hair colours (10 key shades)
  hair: [
    '#1E1A1A', '#4A2E1E', '#7A4A2A', '#B07A3A', '#E0B860',
    '#F2E2B0', '#B8402A', '#D8D8D8', '#6B4FBB', '#2E8B8B'
  ],

  // Robe colours (12 choices)
  robes: [
    { name: 'Arcane', color: '#6B4FBB' },
    { name: 'Nature', color: '#4E8B3A' },
    { name: 'Light', color: '#E8C547' },
    { name: 'Shadow', color: '#2F3A73' },
    { name: 'Alchemy', color: '#B5651D' },
    { name: 'Crimson', color: '#9E2A3A' },
    { name: 'Rose', color: '#D97A9A' },
    { name: 'Sky', color: '#5A9AD6' },
    { name: 'Forest', color: '#2F5A3A' },
    { name: 'Charcoal', color: '#3B3A40' },
    { name: 'Cream', color: '#E9DDC7' },
    { name: 'Plum', color: '#5A2A5A' }
  ],

  // Tier wall colours
  tierColors: {
    bare: { wall: '#4B4A52', floor: '#36353B', border: '#252429' },
    plain: { wall: '#C4BBAE', floor: '#5E5D66', border: '#3B3A40' },
    cozy: { wall: '#E3DBCE', floor: '#6E4529', border: '#4A2E1C' },
    fine: { wall: '#96633B', floor: '#4A2E1C', border: '#3B3A40' },
    splendid: { wall: '#DDB843', floor: '#7A5A12', border: '#4A2E1C' }
  }
};
