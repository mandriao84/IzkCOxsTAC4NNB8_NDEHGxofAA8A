const { test, expect } = require('@playwright/test')
const hlp = require(process.cwd() + '/helpers/general/helpers.js')

test('after ...', async ({ context, page, request }) => {
  const results = await hlp._results(request)
  console.log(results)
})