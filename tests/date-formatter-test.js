/**
 * @fileoverview Unit test for browser/lib/date-formatter.js
 */
const test = require('ava')
const { formatDate } = require('browser/lib/date-formatter')

test('formatDate throws on an invalid argument', t => {
  t.throws(() => formatDate('invalid argument'), {
    message: 'Invalid argument.'
  })
})
