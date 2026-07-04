// Analytics is disabled: The Boosters sends nothing anywhere (the upstream
// Boostnote AWS Mobile Analytics pipeline is severed — aws-sdk removed).
// The no-op API is kept so legacy call sites need no changes.
function initAwsMobileAnalytics() {}

function recordDynamicCustomEvent() {}

module.exports = {
  initAwsMobileAnalytics,
  recordDynamicCustomEvent
}
