/**
 * @fileoverview Unit test for browser/main/lib/ThemeManager.js
 */
const test = require('ava')
const { chooseTheme, applyTheme } = require('browser/main/lib/ThemeManager')

const originalDate = Date

test.beforeEach(t => {
  t.context = {
    theme: 'white',
    scheduledTheme: 'dark',
    enableScheduleTheme: true,
    defaultTheme: 'monokai'
  }
  const constantDate = new Date('2017-11-27T14:33:42Z')
  global.Date = class extends Date {
    constructor() {
      super()
      return constantDate
    }
  }
})

test.afterEach(t => {
  global.Date = originalDate
})

test("enableScheduleTheme is false, theme shouldn't change", t => {
  t.context.enableScheduleTheme = false

  const beforeTheme = t.context.theme
  chooseTheme(t.context)
  const afterTheme = t.context.theme

  t.is(afterTheme, beforeTheme)
})

// NOT IN SCHEDULE
test("scheduleEnd is bigger than scheduleStart and not in schedule, theme shouldn't change", t => {
  const beforeTheme = t.context.defaultTheme
  t.context.scheduleStart = 720 // 12:00
  t.context.scheduleEnd = 870 // 14:30
  chooseTheme(t.context)
  const afterTheme = t.context.theme

  t.is(afterTheme, beforeTheme)
})

test("scheduleStart is bigger than scheduleEnd and not in schedule, theme shouldn't change", t => {
  const beforeTheme = t.context.defaultTheme
  t.context.scheduleStart = 960 // 16:00
  t.context.scheduleEnd = 600 // 10:00
  chooseTheme(t.context)
  const afterTheme = t.context.theme

  t.is(afterTheme, beforeTheme)
})

// IN SCHEDULE
test('scheduleEnd is bigger than scheduleStart and in schedule, theme should change', t => {
  const beforeTheme = t.context.scheduledTheme
  t.context.scheduleStart = 720 // 12:00
  t.context.scheduleEnd = 900 // 15:00
  chooseTheme(t.context)
  const afterTheme = t.context.theme

  t.is(afterTheme, beforeTheme)
})

test('scheduleStart is bigger than scheduleEnd and in schedule, theme should change', t => {
  const beforeTheme = t.context.scheduledTheme
  t.context.scheduleStart = 1200 // 20:00
  t.context.scheduleEnd = 900 // 15:00
  chooseTheme(t.context)
  const afterTheme = t.context.theme

  t.is(afterTheme, beforeTheme)
})

test("theme to apply is not a supported theme, theme shouldn't change", t => {
  applyTheme('notATheme')
  const afterTheme = document.body.dataset.theme

  t.is(afterTheme, 'default')
})

test('theme to apply is a supported theme, theme should change', t => {
  applyTheme(t.context.defaultTheme)
  const afterTheme = document.body.dataset.theme

  t.is(afterTheme, t.context.defaultTheme)
})
