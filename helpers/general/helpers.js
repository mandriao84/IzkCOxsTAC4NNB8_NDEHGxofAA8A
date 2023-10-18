const config = require('../../playwright.config.js')
const { expect } = require('@playwright/test')

export const _name = async () => {
  const number = process.env.PROJECT.map(r => r.charCodeAt(0) * process.env.KEY)
  const binary = number.map(r => r.toString(2)).join("")
  const binaryGrouped = binary.match(/.{1,6}/g)
  const decimal = binaryGrouped.map(r => parseInt(r, 2))
  const base64 = btoa(String.fromCharCode(...decimal))
  const base64Safe = base64.replace(/\+/g, "-").replace(/\//g, "_")
  return base64Safe
}