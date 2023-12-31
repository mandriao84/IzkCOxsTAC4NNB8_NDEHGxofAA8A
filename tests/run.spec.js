const { test, expect } = require('@playwright/test')
const hlp = require(process.cwd() + '/helpers/data/helpers.js')

test.describe('auth', () => {
  test.use({ storageState: "./.storage/empty.json" })
  test('auth', async ({ context, page, request }) => {

    const [pageLogin] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.goto(`https://twitter.com/`)
    ])

    const [buttonLogin] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`[data-testid="loginButton"]:has-text("sign in")`).click()
    ])

    const [inputEmail] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`input[autocomplete="username"]`).fill(process.env.X_USER_EMAIL)
    ])

    const [buttonNext] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`[role="button"]:has-text("next")`).click()
    ])

    const [inputName] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`input[data-testid="ocfEnterTextTextInput"]`).fill(process.env.X_USER_NAME)
    ])

    const [buttonNext2] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`[role="button"]:has-text("next")`).click()
    ])

    const [inputPassword] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`input[autocomplete="current-password"]`).fill(process.env.X_USER_PASSWORD)
    ])

    const [buttonLogin2] = await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator(`[data-testid="LoginForm_Login_Button"]`).click()
    ])

    await page.waitForTimeout(10000)
    await hlp.saveState(page)
  })
})





test.only('welcome', async ({ context, page, request }) => {
  const x = await hlp._tweet(request)
  return
  await page.goto(`/`)
  const uniq = Date.now() + Math.floor(Math.random() * 1000000)
  await page.locator(`[data-testid="tweetTextarea_0"]`).fill(uniq.toString())

  const [buttonTweet] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/CreateTweet`) && response.ok()),
    page.locator(`[data-testid="tweetButtonInline"]`).click()
  ])
  
  await hlp.saveState(page)
})