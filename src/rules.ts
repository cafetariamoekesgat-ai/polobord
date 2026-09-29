/**
 * Alle spelregel- en veldwaarden op één plek (World Aquatics, seizoen 2025/26).
 * KNZB-competities en jeugd wijken soms af: pas de waarden hier aan, of via
 * Instellingen in de app (die overschrijven alleen wat daar instelbaar is).
 */

export interface FieldSize {
  id: string
  label: string
  /** doellijn tot doellijn, in meters */
  length: number
  /** zijkant tot zijkant, in meters */
  width: number
}

export const FIELD_PRESETS: FieldSize[] = [
  { id: '25x20', label: '25 × 20 m (standaard)', length: 25, width: 20 },
  { id: '30x20', label: '30 × 20 m', length: 30, width: 20 },
  { id: '25x15', label: '25 × 15 m', length: 25, width: 15 },
  { id: '20x10', label: '20 × 10 m', length: 20, width: 10 },
]

export const DEFAULT_FIELD: FieldSize = FIELD_PRESETS[0]

export const RULES = {
  goal: {
    /** binnenkant palen */
    width: 3.0,
    height: 0.9,
    /** diepte van het net achter de doellijn (alleen weergave) */
    netDepth: 0.6,
  },
  zones: {
    /** 0–2 m van de doellijn: rood */
    red: 2,
    /** 2–6 m: geel; daarna groen tot de middenlijn */
    yellow: 6,
  },
  /** gebied rond het doel: 2 m naast elke paal, tot de 2 m-lijn (gestippeld) */
  goalArea: { besidePost: 2, depth: 2 },
  /** strafworpmarkering */
  penaltyMark: 5,
  /** vrije worp buiten deze lijn mag direct op doel */
  directFreeThrow: 6,
  /** terugkeerzone in de hoek bij de doellijn, tegenover de jurytafel */
  reentry: { alongGoalLine: 2, intoField: 1 },
  players: {
    inWater: 7,
    squad: 14,
    keeperNumbers: [1, 13],
    fieldNumbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
  },
  shotClock: { full: 28, reset: 18 },
  /** uitsluitingstijd in seconden (oudere reglementen: 20) */
  exclusion: 18,
  periods: { count: 4, minutes: 8 },
  timeouts: 2,
  /** waarschuwingen van de klokken (seconden) */
  clockWarnings: [5, 0],

  defense: {
    /** man-man: verdediger ligt doelzijde, zo ver van zijn man */
    markDistance: 1.0,
    /** pressing: verdediger ligt vóór de man, balzijde */
    pressDistance: 0.8,
    /** terugzakken: verdedigers zakken naar deze band (afstand tot doel) */
    dropBand: [2, 5] as [number, number],
    /** keeper ligt zoveel meter vóór de doellijn */
    keeperDepth: 0.6,
  },

  analysis: {
    /** passlijn is onderschepbaar als een verdediger binnen deze afstand ligt */
    interceptDistance: 1.2,
    /** schaduw in de schothoek: halve breedte van een blokkerende arm/lichaam */
    blockRadiusField: 0.45,
    blockRadiusKeeper: 0.9,
  },

  /** kleinste cap-straal in meters; op het scherm minstens 28 pt (56 pt doorsnede) */
  capRadiusMin: 0.45,
  capMinScreenRadius: 28,
} as const

export type Rules = typeof RULES
