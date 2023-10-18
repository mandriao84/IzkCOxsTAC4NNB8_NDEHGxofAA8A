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

export const _general = async (request, data) => {
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

export const _details = async (request, data) => {
  const results = {}
  const url = `https://bookings-middleware.zenchef.com/getAvailabilities?restaurantId=${data["id"]}&date_begin=${data["date"]}&date_end=${data["date"]}`
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

export const _results = async (request) => {
  const ctxt = {}
  ctxt["dateStartUTC"] = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
  ctxt["dateStart"] = dayjs.utc(ctxt["dateStartUTC"]).startOf("day").format('YYYY-MM-DD')
  ctxt["dateEndUTC"] = dayjs.utc(ctxt["dateStartUTC"]).add(40, "days").format('YYYY-MM-DDTHH:mm:ss[Z]')
  ctxt["dateEnd"] = dayjs.utc(ctxt["dateEndUTC"]).format('YYYY-MM-DD')
  ctxt["id"] = "356354"

  const generalRaw = await _general(request, ctxt)
  const general = generalRaw["body"]
  const shifts = general.map(r => r["shifts"]).flat()
  const spots = shifts.filter(r => {
    const guests = r["possible_guests"].filter(v => v > 0)
    if (guests.length) { return r["possible_guests"] }
  })

  const results = []
  for(let i = 0; i < spots.length; i++) { 
    const spot = spots[i]
    const date = dayjs(spot["bookable_to"]).format('YYYY-MM-DD')
    const guests = spot["possible_guests"]
    ctxt["date"] = date
    const detailsRaw = await _details(request, ctxt)
    const details = detailsRaw["body"]
    const shifts = details.map(r => r["shifts"]).flat()
    const times = shifts.map(r => r["open"]).flat()
    results.push({
      "date": date,
      "times": times,
      "guests": guests
    })
  }

  return results
}