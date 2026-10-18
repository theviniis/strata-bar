/** CPU, temperature and RAM share a two-minute window at a two-second cadence. */
export const RESOURCE_HISTORY_MS = 120_000
export const RESOURCE_HISTORY_SECONDS = RESOURCE_HISTORY_MS / 1000
export const RESOURCE_HISTORY_MAX_POINTS = 61
