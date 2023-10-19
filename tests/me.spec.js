const { test, expect } = require('@playwright/test')
const hlp = require(process.cwd() + '/helpers/general/helpers.js')

test('data', async ({ context, page, request }) => {
  const results = await hlp._results(request)
  console.log(results)
})

test('x', async ({ context, page, request }) => {
  const results = await hlp._results(request)
  console.log(results)
})