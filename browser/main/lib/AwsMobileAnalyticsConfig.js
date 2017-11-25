const AWS = require('aws-sdk')
const AMA = require('aws-sdk-mobile-analytics')
const ConfigManager = require('browser/main/lib/ConfigManager')

const remote = require('electron').remote
const os = require('os')
let mobileAnalyticsClient

AWS.config.region = 'us-east-1'
if (process.env.NODE_ENV === 'production' && ConfigManager.default.get().amaEnabled) {
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:xxxxxxxxxxxxxxxxxxxxxxxxx'
  })

  const validPlatformName = convertPlatformName(os.platform())

  mobileAnalyticsClient = new AMA.Manager({
    appId: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    appTitle: 'xxxxxxxxxx',
    appVersionName: remote.app.getVersion().toString(),
    platform: validPlatformName
  })
}

function convertPlatformName (platformName) {
  if (platformName === 'darwin') {
    return 'MacOS'
  } else if (platformName === 'win32') {
    return 'Windows'
  } else if (platformName === 'linux') {
    return 'Linux'
  } else {
    return ''
  }
}

function initAwsMobileAnalytics () {
  if (process.env.NODE_ENV !== 'production' || !ConfigManager.default.get().amaEnabled) return
  AWS.config.credentials.get((err) => {
    if (!err) {
      console.log('Cognito Identity ID: ' + AWS.config.credentials.identityId)
      recordDynamicCustomEvent('APP_STARTED')
      recordStaticCustomEvent()
    }
  })
}

function recordDynamicCustomEvent (type, options = {}) {
  if (process.env.NODE_ENV !== 'production' || !ConfigManager.default.get().amaEnabled) return
  try {
    mobileAnalyticsClient.recordEvent(type, options)
  } catch (analyticsError) {
    if (analyticsError instanceof ReferenceError) {
      console.log(analyticsError.name + ': ' + analyticsError.message)
    }
  }
}

function recordStaticCustomEvent () {
  if (process.env.NODE_ENV !== 'production' || !ConfigManager.default.get().amaEnabled) return
  try {
    mobileAnalyticsClient.recordEvent('UI_COLOR_THEME', {
      uiColorTheme: ConfigManager.default.get().ui.theme
    })
  } catch (analyticsError) {
    if (analyticsError instanceof ReferenceError) {
      console.log(analyticsError.name + ': ' + analyticsError.message)
    }
  }
}

module.exports = {
  initAwsMobileAnalytics,
  recordDynamicCustomEvent
}
