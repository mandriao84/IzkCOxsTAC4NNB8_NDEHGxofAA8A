const config = require(process.cwd() + '/playwright.config.js')
const dayjs = require(process.cwd() + '/plugins/index.js')
const { expect } = require('@playwright/test')

export const _name = async () => {
  const text = process.env.PROJECT
  const number = Array.from(text, char => char.charCodeAt("0") * process.env.KEY )
  const binary = number.map(r => r.toString(2)).join("")
  const binaryGrouped = binary.match(/.{1,6}/g)
  const decimal = binaryGrouped.map(r => parseInt(r, 2))
  const base64 = btoa(String.fromCharCode(...decimal))
  const base64Safe = base64.replace(/\+/g, "-").replace(/\//g, "_")
  return base64Safe
}

export const _data = async (request, data) => {
  const results = {}
  const url = `https://bookings-middleware.zenchef.com/getAvailabilitiesSummary?restaurantId=${data["id"]}&date_begin=${data["dateStart"]}&date_end=${data["dateEnd"]}`
  const response = await request.get(url, {
      headers: {
        "accept": "application/json, text/plain, */*",
      }
    })
  results["headers"] = await response.headers()
  results["status"] = await response.status()
  results["ok"] = await response.ok()
  results["url"] = await response.url()
  results["body"] = await response.text() == '' ? '' : await response.json()
  expect(results["ok"]).toBe(true)
  return results
}

export const _uniqData = async (request) => {
  const ctxt = {}
  ctxt["dateStartUTC"] = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
  ctxt["dateStart"] = dayjs.utc(ctxt["dateStartUTC"]).startOf("day").format('YYYY-MM-DD')
  ctxt["dateEndUTC"] = dayjs.utc(ctxt["dateStartUTC"]).add(40, "days").format('YYYY-MM-DDTHH:mm:ss[Z]')
  ctxt["dateEnd"] = dayjs.utc(ctxt["dateEndUTC"]).format('YYYY-MM-DD')
  ctxt["id"] = "356354"
  console.log(ctxt)

  const dataRaw = await _data(request, ctxt)
  const data = dataRaw["body"]
  const shifts = data.map(r => r["shifts"]).flat()
  const possible = shifts.filter(r => r["possible_guests"].length)
  console.log(possible)

}

// fetch("https://bookings-middleware.zenchef.com/getAvailabilitiesSummary?restaurantId=356354&date_begin=2023-10-01&date_end=2023-10-31", {
//   "headers": {
//     "accept": "application/json, text/plain, */*",
//     "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
//     "sec-ch-ua": "\"Chromium\";v=\"118\", \"Google Chrome\";v=\"118\", \"Not=A?Brand\";v=\"99\"",
//     "sec-ch-ua-mobile": "?0",
//     "sec-ch-ua-platform": "\"macOS\"",
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-site"
//   },
//   "referrer": "https://bookings.zenchef.com/",
//   "referrerPolicy": "strict-origin-when-cross-origin",
//   "body": null,
//   "method": "GET",
//   "mode": "cors",
//   "credentials": "omit"
// });