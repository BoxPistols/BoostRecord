import { hashHistory } from 'react-router'
import dataApi from 'browser/main/lib/dataApi'
import ee from 'browser/main/lib/eventEmitter'
import AwsMobileAnalyticsConfig from 'browser/main/lib/AwsMobileAnalyticsConfig'

export function createMarkdownNote (storage, folder, dispatch, location, params) {
  AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_MARKDOWN')
  AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_ALLNOTE')

  const tags = location.pathname.match(/\/tags/) ? params.tagname.split(' ') : []

  return dataApi
    .createNote(storage, {
      type: 'MARKDOWN_NOTE',
      folder: folder,
      title: '',
      tags,
      content: ''
    })
    .then(note => {
      const noteHash = note.key
      dispatch({
        type: 'UPDATE_NOTE',
        note: note
      })

      hashHistory.push({
        pathname: location.pathname,
        query: { key: noteHash }
      })
      ee.emit('list:jump', noteHash)
      ee.emit('detail:focus')
    })
}

export function createSnippetNote (storage, folder, dispatch, location, params, config) {
  AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_SNIPPET')
  AwsMobileAnalyticsConfig.recordDynamicCustomEvent('ADD_ALLNOTE')

  const tags = location.pathname.match(/\/tags/) ? params.tagname.split(' ') : []

  return dataApi
    .createNote(storage, {
      type: 'SNIPPET_NOTE',
      folder: folder,
      title: '',
      tags,
      description: '',
      snippets: [
        {
          name: '',
          mode: config.editor.snippetDefaultLanguage || 'text',
          content: ''
        }
      ]
    })
    .then(note => {
      const noteHash = note.key
      dispatch({
        type: 'UPDATE_NOTE',
        note: note
      })
      hashHistory.push({
        pathname: location.pathname,
        query: { key: noteHash }
      })
      ee.emit('list:jump', noteHash)
      ee.emit('detail:focus')
    })
}
