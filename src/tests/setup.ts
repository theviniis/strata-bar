import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Popup content is loaded through code-split chunks. When a full run transforms
// every file's jsdom environment on the same machine, a chunk can outlast the
// 1s default that `findBy*` polls with; a full run under load has been observed
// taking >5s, so leave headroom below the per-test timeout instead.
configure({ asyncUtilTimeout: 9000 })

afterEach(cleanup)
