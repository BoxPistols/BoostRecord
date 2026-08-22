/**
 * @fileoverview Unit test for the SSRF guard in lib/screenshot/ipc.js —
 * private/loopback/link-local/metadata destinations must never reach
 * BrowserWindow.loadURL.
 */
jest.mock(
  'electron',
  () => {
    return {
      ipcMain: { handle: jest.fn() },
      BrowserWindow: function() {}
    }
  },
  { virtual: true }
)

const {
  isHttpUrl,
  isPrivateAddress,
  isForbiddenHostname,
  assertPublicDestination
} = require('../../lib/screenshot/ipc')

test('isHttpUrl accepts only http(s)', () => {
  expect(isHttpUrl('https://example.com')).toBe(true)
  expect(isHttpUrl('http://example.com')).toBe(true)
  expect(isHttpUrl('file:///etc/passwd')).toBe(false)
  expect(isHttpUrl('ftp://example.com')).toBe(false)
  expect(isHttpUrl(null)).toBe(false)
})

test('isPrivateAddress flags loopback / RFC1918 / link-local / metadata', () => {
  const privates = [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:192.168.0.10'
  ]
  privates.forEach(ip => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  const publics = [
    '93.184.216.34',
    '8.8.8.8',
    '2606:2800:220:1:248:1893:25c8:1946'
  ]
  publics.forEach(ip => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

test('isForbiddenHostname blocks localhost-style names', () => {
  expect(isForbiddenHostname('localhost')).toBe(true)
  expect(isForbiddenHostname('LOCALHOST')).toBe(true)
  expect(isForbiddenHostname('foo.localhost')).toBe(true)
  expect(isForbiddenHostname('printer.local')).toBe(true)
  expect(isForbiddenHostname('db.internal')).toBe(true)
  expect(isForbiddenHostname('')).toBe(true)
  expect(isForbiddenHostname('example.com')).toBe(false)
})

test('assertPublicDestination rejects private literals without DNS', () => {
  const rejected = url =>
    assertPublicDestination(url).then(
      () => false,
      () => true
    )

  return Promise.all([
    rejected('http://127.0.0.1/'),
    rejected('http://169.254.169.254/latest/meta-data/'),
    rejected('http://[::1]:8080/'),
    rejected('http://localhost:3000/'),
    rejected('not a url')
  ]).then(results => {
    expect(results).toEqual([true, true, true, true, true])
  })
})
