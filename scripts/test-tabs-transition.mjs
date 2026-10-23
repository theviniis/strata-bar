import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against `pnpm storybook` to catch layout flashes that jsdom cannot measure.
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(
    `${process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'}/iframe.html?id=reminders-popup--interactive&viewMode=story`,
    { waitUntil: 'domcontentloaded' }
  )
  for (const name of ['Data e hora', 'Duração', 'Data e hora']) {
    await page.getByRole('tab', { name, exact: true }).waitFor()
    await page.evaluate(() => {
      window.tabFrames = []
      document.querySelector('[role=tablist]').addEventListener(
        'click',
        () => {
          const sample = () => {
            window.tabFrames.push(
              [...document.querySelectorAll('[role=tabpanel]')].filter(
                (panel) =>
                  panel.getBoundingClientRect().height > 0 &&
                  getComputedStyle(panel).position !== 'absolute'
              ).length
            )
            if (window.tabFrames.length < 20) requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        },
        { once: true }
      )
    })
    await page.getByRole('tab', { name, exact: true }).click()
    await page.waitForFunction(() => window.tabFrames.length === 20)
    const frames = await page.evaluate(() => window.tabFrames)
    assert.ok(
      frames.every((count) => count === 1),
      `${name}: panels stacked during transition: ${frames.join(', ')}`
    )
  }
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    window.panelBeforeInput = document.querySelector('[role=tabpanel]')
    window.inputFrames = []
    document.querySelector('input[type=time]').addEventListener(
      'input',
      () => {
        const sample = () => {
          const panel = document.querySelector('[role=tabpanel]')
          window.inputFrames.push({
            same: panel === window.panelBeforeInput,
            opacity: Number(getComputedStyle(panel).opacity),
            transform: getComputedStyle(panel).transform
          })
          if (window.inputFrames.length < 20) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      },
      { once: true }
    )
  })
  await page.locator('input[type=time]').fill('12:34')
  await page.waitForFunction(() => window.inputFrames.length === 20)
  const inputFrames = await page.evaluate(() => window.inputFrames)
  assert.ok(
    inputFrames.every(
      (frame) => frame.same && frame.opacity === 1 && frame.transform === 'none'
    ),
    `Input edits restarted the panel animation: ${JSON.stringify(inputFrames)}`
  )
  console.log('PASS: reminder tabs never stack panels during transitions')
} finally {
  await browser.close()
}
