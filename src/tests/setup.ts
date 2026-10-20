import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Popup content is loaded through code-split chunks. When a full run transforms
// every file's jsdom environment on the same machine, a chunk can outlast the
// 1s default that `findBy*` polls with.
configure({ asyncUtilTimeout: 5000 })

afterEach(cleanup)
