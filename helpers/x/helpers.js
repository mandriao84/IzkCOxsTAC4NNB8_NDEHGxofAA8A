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