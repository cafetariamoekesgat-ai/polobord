import type { FieldSize } from './rules'

export type Team = 'white' | 'blue'
export type Role = 'center' | 'wing' | 'point' | 'driver' | 'keeper' | 'flat' | 'none'

export interface Vec {
  x: number
  y: number
}

export interface Piece {
  id: string
  team: Team
  num: number
  name?: string
  role: Role
  keeper: boolean
  x: number
  y: number
  /** uitgesloten: tijdstip (ms, Date.now()) waarop de uitsluiting afloopt */
  excludedUntil?: number | null
  /** voor de man-man: welke aanvaller dekt deze verdediger */
  marks?: string | null
}

export interface BallState {
  x: number
  y: number
  holder: string | null
}

export type LineKind = 'swim' | 'pass' | 'shot' | 'screen' | 'free'

export interface Stroke {
  id: string
  kind: LineKind
  color: string
  /** [x, y, druk] in meters */
  points: [number, number, number][]
  /** stap waarin de lijn getekend is */
  step: number
  /** zwemlijn die bij een speler begint: route voor de animatie */
  pieceId?: string | null
}

export interface Frame {
  pos: Record<string, Vec>
  ball: BallState
  excluded: Record<string, boolean>
}

export interface ViewState {
  half: boolean
  rotated: boolean
  mirrored: boolean
}

export interface Board {
  field: FieldSize
  pieces: Piece[]
  ball: BallState
  strokes: Stroke[]
  /** team dat aanvalt (bepaalt aanvalshelft en opstellingen) */
  attacking: Team
  steps: Frame[]
  currentStep: number
}

export interface Play {
  id: string
  name: string
  category: string
  board: Board
  created: number
  updated: number
}

export interface SquadPlayer {
  num: number
  name: string
}

export interface Squad {
  id: string
  name: string
  players: SquadPlayer[]
}

export const PLAY_CATEGORIES = [
  'Aanval',
  'Verdediging',
  'Overtal',
  'Ondertal',
  'Spelhervatting',
  'Training',
  'Overig',
] as const
