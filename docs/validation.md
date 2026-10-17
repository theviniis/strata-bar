# Foundation validation — 2026-10-17

Historical foundation checkpoint. Superseded by [native MVP validation](native-mvp-validation.md), which records the now-functional Windows bar and production build.

- Node 22.23.2; dependency versions pinned in package-lock.json.
- `npm test`: 3 files / 8 tests passed with Vitest 5.0.5.
- `npm run build`: Vite production assets generated. Upstream Zod pure-annotation comments generate nonfatal Rollup warnings.
- `npm audit`: 0 vulnerabilities following test-tool update.
- Browser screenshot inspected at http://127.0.0.1:1420: studio renders, three widget groups visible, GPU explicitly unavailable, browser preview label visible.
- No native build, native integration test, installer smoke test or YASB comparison performed. Rust/Cargo unavailable on PATH.

## Milestone status

M0 complete. Browser portion of M1 passes; Tauri compile gate pending. M2 prototype implemented and visually inspected at desktop size; broader accessibility/responsive validation still needed. M3–M9 are not completed. Native bridge is a contract/transport scaffold, not a functional Windows provider. shadcn configuration and local Radix popover primitive exist; remaining shadcn controls should be added only when their features land.

## Next concrete step

Provision official Windows Tauri prerequisites, compile the scaffold and add CPU/RAM collectors with native subscription ownership and real Windows comparisons. Then implement AppBar lifecycle before treating this as an installed bar. Do not advance native acceptance gates based on browser mocks.
