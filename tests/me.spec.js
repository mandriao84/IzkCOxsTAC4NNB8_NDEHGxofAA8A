const { test, expect } = require('@playwright/test')
const fs = require('fs')
const hlp = require(process.cwd() + '/helpers/general/helpers.js')

test('after ....', async ({ context, page, request }) => {
  await hlp._results(request)
})