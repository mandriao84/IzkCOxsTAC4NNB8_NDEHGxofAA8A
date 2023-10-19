const { test, expect } = require('@playwright/test')
const hlp = require(process.cwd() + '/helpers/data/helpers.js')

test('run', async ({ context, page, request }) => {
  await hlp._x(request)
})