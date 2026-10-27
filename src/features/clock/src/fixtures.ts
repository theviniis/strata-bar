import { timePresentation } from './presentation'

export const CLOCK_FIXTURE_TIME = new Date(2026, 9, 23, 9, 41)
export const clockFixture = () =>
  timePresentation(new Date(CLOCK_FIXTURE_TIME), 'pt-BR')
