const dayjs = require('dayjs')
const dayjs_utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const dayjs_customParseFormat = require('dayjs/plugin/customParseFormat')
const dayjs_advancedFormat = require('dayjs/plugin/advancedFormat')
const dayjs_duration = require('dayjs/plugin/duration')
const dayjs_weekday = require('dayjs/plugin/weekday')
const dayjs_isBetween = require('dayjs/plugin/isBetween')
dayjs.extend(dayjs_utc)
dayjs.extend(timezone)
dayjs.extend(dayjs_customParseFormat)
dayjs.extend(dayjs_advancedFormat)
dayjs.extend(dayjs_duration)
dayjs.extend(dayjs_weekday)
dayjs.extend(dayjs_isBetween)
module.exports = dayjs