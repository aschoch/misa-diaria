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
  went: number
  couples_went: number
  committed: boolean
  at_risk: boolean
  sunday: boolean
  mine_commitment: boolean
  mine_attendance: boolean
}

export type PastDay = {
  date: string
  sunday: boolean
  mine_attendance: boolean
  went: number
  couples_went: number
}

export type HistoryDay = {
  date: string
  went: number
  couples_went: number
  mine_attendance: boolean
  couple_attendance: boolean
}

export type Comment = {
  id: string
  body: string
  display_name: string
  mine: boolean
  created_at?: string
}

export type Reaction = {
  emoji: string
  mine: boolean
}

export type Intention = {
  id: string
  body: string
  display_name: string
  mine: boolean
  comments: Comment[]
  reactions: Reaction[]
}

export type Estado = {
  today: string
  clock: string
  me: { id: string; display_name: string; couple_id: string; couple_label: string }
  members: { id: string; display_name: string; couple_id: string }[]
  streaks: { individual: number; couple: number; group: number; six: number; ten: number; total: number }
  risk: 'empty' | null
  calendar: Day[]
  past: PastDay[]
  history: HistoryDay[]
  intentions: Intention[]
  prefs: { empty_day: boolean; couple: boolean; locale: 'es' | 'pt' | null }
  pending: Pending[]
  monday: { people: number; couples: number; empty_days: number } | null
}
