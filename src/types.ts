export type Pending = {
  key: string
  line: string
  motif: 'hito' | 'todos' | 'diez' | 'parejas'
  rank: number
  date: string
}

export type Day = {
  date: string
  covered: number
  couples: number
  at_risk: boolean
  sunday: boolean
  gaps?: string[]
  mine_commitment: boolean
  mine_attendance: boolean
}

export type Estado = {
  today: string
  clock: string
  me: { id: string; display_name: string; couple_id: string; couple_label: string }
  members: { id: string; display_name: string; couple_id: string }[]
  streaks: { individual: number; couple: number; group: number; ten: number; total: number }
  risk: 'empty' | 'couple' | null
  calendar: Day[]
  past: { date: string; sunday: boolean; mine_attendance: boolean }[]
  intentions: { id: string; body: string; display_name: string; mine: boolean }[]
  prefs: { empty_day: boolean; couple: boolean }
  pending: Pending[]
  monday: { people: number; couples: number; empty_days: number } | null
}
