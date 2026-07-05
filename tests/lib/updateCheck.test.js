/**
 * Version comparison used by the GitHub release update check
 * (lib/main-app.js). The old electron-gh-releases updater pointed at the
 * dead upstream repo — these tests pin the replacement's decision logic.
 */
const { isNewerVersion } = require('../../lib/update-check')

it('detects a newer patch / minor / major version', () => {
  expect(isNewerVersion('0.16.3', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.17.0', '0.16.2')).toBe(true)
  expect(isNewerVersion('1.0.0', '0.16.2')).toBe(true)
})

it('returns false for the same or an older version', () => {
  expect(isNewerVersion('0.16.2', '0.16.2')).toBe(false)
  expect(isNewerVersion('0.16.1', '0.16.2')).toBe(false)
  expect(isNewerVersion('0.9.9', '0.16.2')).toBe(false)
})

it('compares numerically, not lexicographically', () => {
  expect(isNewerVersion('0.16.10', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.2.0', '0.16.0')).toBe(false)
})

it('handles version strings of different lengths', () => {
  expect(isNewerVersion('0.17', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.16.2.1', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.16', '0.16.0')).toBe(false)
})
