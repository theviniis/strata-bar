import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against `pnpm dev`. A fresh document keeps the lazy popup chunk cold.
const browser = await chromium.launch()
try {
  for (const strict of [false, true]) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      const text = message.text()
      // HMR sockets are unrelated to the editor and can be blocked by Chromium.
      if (
        message.type() === 'error' &&
        !text.startsWith('WebSocket connection to ') &&
        !text.startsWith('[vite] failed to connect to websocket.')
      )
        errors.push(text)
    })
    await page.route('http://127.0.0.1:1420/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div id="root"></div></body></html>'
      })
    )
    await page.goto('http://127.0.0.1:1420/')
    await page.evaluate(async (strict) => {
      const { default: RefreshRuntime } = await import('/@react-refresh')
      RefreshRuntime.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => (type) => type
      window.__vite_plugin_react_preamble_installed__ = true
      const reactModule = await import('/node_modules/.vite/deps/react.js')
      const React = reactModule.default ?? reactModule
      const domModule =
        await import('/node_modules/.vite/deps/react-dom_client.js')
      const { createRoot } = domModule.default ?? domModule
      const { PopupHost } = await import('/src/popups/PopupHost.tsx')
      const { QueryProvider } =
        await import('/src/components/QueryProvider.tsx')
      function Harness() {
        const [open, setOpen] = React.useState(true)
        return React.createElement(
          QueryProvider,
          null,
          React.createElement(
            'button',
            { onClick: () => setOpen(true) },
            'Open reminders'
          ),
          open &&
            React.createElement(PopupHost, {
              id: 'reminders',
              mode: 'demo',
              close: () => setOpen(false)
            })
        )
      }
      createRoot(document.getElementById('root')).render(
        React.createElement(
          strict ? React.StrictMode : React.Fragment,
          null,
          React.createElement(Harness)
        )
      )
    }, strict)
    for (let opening = 0; opening < 2; opening++) {
      if (opening > 0)
        await page.getByRole('button', { name: 'Open reminders' }).click()
      const textbox = page.getByRole('textbox', {
        name: 'Mensagem',
        exact: true
      })
      await textbox.waitFor({ timeout: 10000 })
      assert.equal(await textbox.getAttribute('aria-invalid'), 'false')
      await textbox.fill('Reminder regression')
      assert.equal(await textbox.innerText(), 'Reminder regression')
      await textbox.press('Escape')
      await textbox.waitFor({ state: 'detached' })
    }
    assert.deepEqual(errors, [], `StrictMode=${strict}: browser errors`)
    console.log(`PASS: cold opening and reopening, StrictMode=${strict}`)
    await page.close()
  }
} finally {
  await browser.close()
}
