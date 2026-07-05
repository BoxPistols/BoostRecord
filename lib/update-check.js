// Version comparison for the GitHub release update check (see main-app.js).
// Extracted so the logic is unit-testable outside the Electron main process.
function isNewerVersion(latest, current) {
  const a = String(latest)
    .split('.')
    .map(Number)
  const b = String(current)
    .split('.')
    .map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

module.exports = { isNewerVersion }
