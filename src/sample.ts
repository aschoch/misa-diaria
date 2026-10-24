import type { Day, Estado } from './types'

const today = '2026-10-23'

function day(date: string, extra: Partial<Day> = {}): Day {
  return {
    date,
    covered: extra.covered ?? 4,
    couples: extra.couples ?? 3,
    went: extra.went ?? 0,
    couples_went: extra.couples_went ?? 0,
    committed: extra.committed ?? false,
    at_risk: extra.at_risk ?? false,
    sunday: extra.sunday ?? false,
    mine_commitment: extra.mine_commitment ?? false,
    mine_attendance: extra.mine_attendance ?? false,
  }
}

export function sampleEstado(): Estado {
  return {
    today,
    clock: '09:40',
    me: { id: 'm1', display_name: 'Persona 1', couple_id: 'c1', couple_label: 'Matrimonio 1' },
    members: [],
    streaks: { individual: 12, couple: 40, group: 80, six: 4, ten: 2, total: 318 },
    risk: 'empty',
    calendar: [
      day(today, { covered: 0, couples: 0, at_risk: true }),
      day('2026-10-24', { covered: 0, couples: 0, at_risk: true }),
      day('2026-10-25', { covered: 1, couples: 1, sunday: true, mine_commitment: true, committed: true }),
      day('2026-10-26', { covered: 3, couples: 2, committed: true }),
      day('2026-10-27', { covered: 12, couples: 6, went: 12, couples_went: 6, mine_commitment: true, committed: true }),
      day('2026-10-28', { covered: 9, couples: 6, went: 9, couples_went: 6 }),
      day('2026-10-29', { covered: 2, couples: 2 }),
      day('2026-10-30', { covered: 5, couples: 4 }),
      day('2026-10-31', { covered: 0, couples: 0, at_risk: true }),
      day('2026-11-01', { covered: 0, couples: 0, sunday: true }),
      day('2026-11-02', { covered: 1, couples: 1 }),
      day('2026-11-03', { covered: 6, couples: 4 }),
      day('2026-11-04', { covered: 4, couples: 3 }),
      day('2026-11-05', { covered: 2, couples: 2 }),
    ],
    past: [
      { date: '2026-10-22', sunday: false, mine_attendance: true, went: 11, couples_went: 6 },
      { date: '2026-10-21', sunday: false, mine_attendance: false, went: 6, couples_went: 4 },
      { date: '2026-10-20', sunday: false, mine_attendance: false, went: 12, couples_went: 6 },
      { date: '2026-10-19', sunday: false, mine_attendance: false, went: 0, couples_went: 0 },
      { date: '2026-10-18', sunday: true, mine_attendance: false, went: 0, couples_went: 0 },
      { date: '2026-10-17', sunday: false, mine_attendance: false, went: 0, couples_went: 0 },
    ],
    intentions: [
      { id: 'i1', body: 'Por la familia de Persona 3.', display_name: 'Persona 2', mine: false, comments: [], reactions: [] },
      { id: 'i2', body: 'En acción de gracias.', display_name: 'Persona 1', mine: true, comments: [], reactions: [] },
    ],
    prefs: { empty_day: false, couple: false, locale: null },
    pending: [
      { key: 'celeb:hito:tuya:7', line: 'Tú · 7 días seguidos', motif: 'hito', rank: 20, date: today },
      { key: 'celeb:todos:' + today, line: '¡Hoy habéis ido los doce!', motif: 'todos', rank: 30, date: today },
      { key: 'celeb:diez:' + today, line: '10 misas hoy', motif: 'diez', rank: 40, date: today },
      { key: 'celeb:parejas:' + today, line: 'Los 6 matrimonios', motif: 'parejas', rank: 50, date: today },
    ],
    monday: null,
  }
}
