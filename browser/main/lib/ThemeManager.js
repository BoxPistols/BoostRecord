function choose (ui) {
  console.log(ui.enableScheduleTheme)
  if (!ui.enableScheduleTheme) {
    return
  }

  const start = parseInt(ui.scheduleStart)
  const end = parseInt(ui.scheduleEnd)

  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()

  console.log(ui.scheduleStart, minutes, ui.scheduleEnd)

  if ((end > start && minutes >= start && minutes <= end) ||
    (start > end && (minutes >= start || minutes <= end))) {
    console.log('SC', ui.theme, ui.scheduledTheme)
    if (ui.theme !== ui.scheduledTheme) {
      ui.defaultTheme = ui.theme
      ui.theme = ui.scheduledTheme
      apply(ui.theme)
    }

    console.log(ui.defaultTheme, ui.theme)
  } else {
    console.log('TH', ui.theme, ui.defaultTheme)
    if (ui.theme !== ui.defaultTheme) {
      ui.theme = ui.defaultTheme
      apply(ui.theme)
    }

    console.log(ui.theme)
  }
}

function apply (theme) {
  console.log('Apply ', theme)
  const supportedThemes = ['dark', 'white', 'solarized-dark', 'monokai', 'dracula']
  if (supportedThemes.indexOf(theme) !== -1) {
    document.body.setAttribute('data-theme', theme)
  } else {
    document.body.setAttribute('data-theme', 'default')
  }
}

export default {
  choose,
  apply
}
