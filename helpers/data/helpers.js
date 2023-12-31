const config = require(process.cwd() + '/playwright.config.js')
const dayjs = require(process.cwd() + '/plugins/index.js')
const fs = require('fs')
const { expect } = require('@playwright/test')

export const saveState = async (page) => {
  // const storageEmptyPath = "./.storage/empty.json"
  const storageStatePath = "./.storage/state.json"
  await page.context().storageState({ path: storageStatePath })
  const state = JSON.parse(fs.readFileSync(process.cwd() + storageStatePath))
  expect(state.cookies.length).toBeTruthy()
  expect(state.origins.length).toBeTruthy()
  state.cookies = []
  fs.writeFileSync(process.cwd() + storageStatePath, JSON.stringify(state))
}

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
  var items = JSON.parse(fs.readFileSync(process.cwd() + "/.data/restaurants.json"))
  items = items.filter(r => r["id"] == "356354" || r["id"] == "352524") // SEPTIME, CHEVAL D'OR

  const results = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    const ctxt = {}
    ctxt["dateStartUTC"] = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
    ctxt["dateStart"] = dayjs.utc(ctxt["dateStartUTC"]).startOf("day").format('YYYY-MM-DD')
    ctxt["dateEndUTC"] = dayjs.utc(ctxt["dateStartUTC"]).add(40, "days").format('YYYY-MM-DDTHH:mm:ss[Z]')
    ctxt["dateEnd"] = dayjs.utc(ctxt["dateEndUTC"]).format('YYYY-MM-DD')
    ctxt["id"] = item["id"]
    ctxt["name"] = item["name"]
    ctxt["spots"] = []
  
    const generalRaw = await _general(request, ctxt)
    const general = generalRaw["body"]
    const shifts = general.map(r => r["shifts"]).flat()
    // console.log(shifts)
  
    const spotsLength = shifts.filter(r => r["possible_guests"]).length
    const spotsEmptyLength = shifts.filter(r => r["possible_guests"].length == 0).length
    const spotsFreeLength = spotsLength - spotsEmptyLength
    ctxt["spotsFreeRatio"] = spotsFreeLength / spotsLength
  
    const spots = shifts.filter(r => {
      const guests = r["possible_guests"].filter(v => v > 0)
      if (guests.length) { return r["possible_guests"] }
    })
  
    if (items.length <= 3) {
      for (let j = 0; j < spots.length; j++) {
        const spot = spots[j]
        const date = dayjs(spot["bookable_to"]).format('YYYY-MM-DD')
        const guests = spot["possible_guests"]
        ctxt["date"] = date
        const detailsRaw = await _details(request, ctxt)
        const details = detailsRaw["body"]
        const shifts = details.map(r => r["shifts"]).flat()
        const times = shifts.map(r => r["open"]).flat()
        ctxt["spots"].push({
          "date": date,
          "times": times,
          "guests": guests
        })
      }
    }

    results.push(ctxt)
  }

  results.sort((a, b) => {
    return a.spotsFreeRatio - b.spotsFreeRatio
  })
  
  console.dir(results, { depth: null })
  return results
}

export const _tweet = async (request) => {
  const results = await _results(request)

  let x = ""

  // for (let i = 0; i < results.length; i++) {
  //   const result = results[i]
  //   const date = result["date"].replace(/-/g, '.')
  //   const times = result["times"]
  //   const guests = result["guests"]
  //   const returnLine = i == results.length - 1 ? "" : "\n"
  //   // url size = 23
  //   // max tweet size = 280
  //   if (i == 0) {
  //     x += `Septime - https://bookings.zenchef.com/results?rid=356354${returnLine}`
  //   }
  //   x += `${date} - [ ${times.join(", ")} ] - [ ${guests.join(", ")} ]${returnLine}`
  // }
  // console.log("tweetLength", x.length)
  return x
}