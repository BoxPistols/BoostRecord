import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './ConfigTab.styl'
import ConfigManager from 'browser/main/lib/ConfigManager'
import { store } from 'browser/main/store'
import consts from 'browser/lib/consts'
import ReactCodeMirror from 'react-codemirror'
import CodeMirror from 'codemirror'
import 'codemirror-mode-elixir'
// 見本のシンタックスハイライト用。ここで読み込まないとトークンが作られず、
// テーマを変えても背景しか変わらない（選ぶ画面として成立しない）
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/css/css'
import _ from 'lodash'
import i18n from 'browser/lib/i18n'
import VimKeyReference from 'browser/components/VimKeyReference'
import { getLanguages } from 'browser/lib/Languages'
import normalizeEditorFontFamily from 'browser/lib/normalizeEditorFontFamily'
import uiThemes from 'browser/lib/ui-themes'
import {
  applyEditorThemeChoice,
  resolveEditorTheme,
  CURATED_EDITOR_THEMES,
  CURATED_EDITOR_THEME_NAMES
} from 'browser/lib/editorThemes'
const { curateEditorThemes } = require('browser/lib/editorThemeFiles')
import { chooseTheme, applyTheme } from 'browser/main/lib/ThemeManager'
import {
  CUSTOM_CSS_TEMPLATES,
  findCustomCSSTemplate,
  appendCustomCSSTemplate
} from 'browser/lib/customCSSTemplates'
import {
  CUSTOM_CSS_SYSTEM_PROMPT,
  buildCustomCSSPrompt,
  validateGeneratedCSS,
  appendGeneratedCSS
} from 'browser/lib/customCSSGenerator'
import { runAiPrompt } from 'browser/main/lib/aiAssist'
import { getKeyStatus, isProviderUsable } from 'browser/main/lib/aiKeys'

const OSX = global.process.platform === 'darwin'

// 明暗の表と既定値は browser/lib/editorThemes.js が単一の出どころ

const electron = require('electron')
const ipc = electron.ipcRenderer

class UiTab extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      config: props.config,
      // 表示中のまとまり。中身は常に描かれていて、display だけ切り替える
      activeSection: 'theme',
      codemirrorTheme: props.config.editor.theme,
      codeBlockTheme: resolveEditorTheme(props.config.preview.codeBlockTheme),
      customCSSTemplateId: CUSTOM_CSS_TEMPLATES[0].id,
      // AI 生成の導線。キーが無いときは出さないので、状態が分かるまで null
      aiKeyStatus: null,
      cssPrompt: '',
      cssGenerating: false,
      cssPreview: null,
      cssError: null,
      cssUndo: null
    }
  }

  sectionStyle(name) {
    return { display: this.state.activeSection === name ? 'block' : 'none' }
  }

  renderSectionNav() {
    const sections = [
      { key: 'theme', label: i18n.__('Theme') },
      { key: 'general', label: i18n.__('General') },
      { key: 'editor', label: i18n.__('Editor') },
      { key: 'preview', label: i18n.__('Preview') }
    ]
    return sections.map(section => (
      <button
        key={section.key}
        type='button'
        role='tab'
        aria-selected={this.state.activeSection === section.key}
        styleName={
          this.state.activeSection === section.key
            ? 'section-nav-item--active'
            : 'section-nav-item'
        }
        onClick={() => this.setState({ activeSection: section.key })}
      >
        {section.label}
      </button>
    ))
  }

  /**
   * コードブロックのテーマの見本。
   *
   * エディタの見本と並べて置く。テーマを選んでも、実際に何が変わるかが
   * 見えないと選びようがない。読み込む CSS はエディタの見本とは別の link に
   * する（2 つのテーマが同時に必要なため）
   */
  renderCodeBlockSample() {
    // 見本の中身はエディタ側と揃える。同じコードが 2 つのテーマで
    // 並ぶので、どこが変わるかが分かる
    const sample = [
      '// プレビューのコードブロック',
      "const amp = { model: 'Bassman', gain: 7.5 }",
      'export function play (track) {',
      '  if (!track) return null',
      '}'
    ].join('\n')
    return (
      <div styleName='group-section'>
        <div styleName='group-section-label'>
          {i18n.__('Code block sample')}
        </div>
        <div styleName='group-section-control'>
          <div styleName='code-mirror'>
            <ReactCodeMirror
              ref={e => (this.codeBlockSampleInstance = e)}
              value={sample}
              options={{
                lineNumbers: true,
                readOnly: true,
                mode: 'javascript',
                theme: this.state.codeBlockTheme
              }}
            />
          </div>
        </div>
        <div styleName='group-section-hint'>
          {i18n.__(
            'The same code shown with the code block theme above, so the two themes can be compared side by side.'
          )}
        </div>
      </div>
    )
  }

  /**
   * 見本用のテーマ CSS を <head> に足す。id ごとに 1 枚。
   */
  applySampleThemeLink(id, themeName) {
    let link = document.getElementById(id)
    if (link === null) {
      link = document.createElement('link')
      link.setAttribute('id', id)
      link.setAttribute('rel', 'stylesheet')
      document.head.appendChild(link)
    }
    const theme = consts.THEMES.find(t => t.name === themeName)
    if (theme && theme.path) {
      link.setAttribute('href', theme.path)
    } else {
      // default は追加の CSS を持たない。href を空にすると存在しない URL を
      // 取りに行くので属性ごと外す
      link.removeAttribute('href')
    }
  }

  componentDidMount() {
    // コードブロックの見本は、エディタとは別のテーマになりうる。
    // 開いた時点の分をここで読み込む
    this.applySampleThemeLink('codeBlockHighLight', this.state.codeBlockTheme)
    CodeMirror.autoLoadMode(
      this.codeMirrorInstance.getCodeMirror(),
      'javascript'
    )
    CodeMirror.autoLoadMode(this.customCSSCM.getCodeMirror(), 'css')
    // 「押しても必ず失敗する導線を出さない」ため、キーの有無を実行時に見る。
    // アンマウント後の setState を避けるため生存フラグを持つ
    this.mounted = true
    getKeyStatus().then(status => {
      if (this.mounted) this.setState({ aiKeyStatus: status })
    })
    CodeMirror.autoLoadMode(
      this.customMarkdownLintConfigCM.getCodeMirror(),
      'javascript'
    )
    CodeMirror.autoLoadMode(this.prettierConfigCM.getCodeMirror(), 'javascript')
    // Set CM editor Sizes
    this.customCSSCM.getCodeMirror().setSize('400px', '400px')
    this.prettierConfigCM.getCodeMirror().setSize('400px', '400px')
    this.customMarkdownLintConfigCM.getCodeMirror().setSize('400px', '200px')

    this.handleSettingDone = () => {
      this.setState({
        UiAlert: {
          type: 'success',
          message: i18n.__('Successfully applied!')
        }
      })
    }
    this.handleSettingError = err => {
      this.setState({
        UiAlert: {
          type: 'error',
          message:
            err.message != null ? err.message : i18n.__('An error occurred!')
        }
      })
    }
    ipc.addListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.addListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  componentWillUnmount() {
    this.mounted = false
    ipc.removeListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.removeListener('APP_SETTING_ERROR', this.handleSettingError)
  }

  // 拒否の理由をそのまま出しても伝わらないので、何が起きたかを1行で言う
  describeCSSRefusal(reasons) {
    const known = {
      empty: 'The model returned nothing.',
      'too-long': 'The generated CSS was too long to accept.',
      'at-import':
        'The generated CSS used @import, which loads a remote stylesheet.',
      'remote-url': 'The generated CSS referenced a remote URL.',
      'javascript-url': 'The generated CSS contained a javascript: URL.',
      expression: 'The generated CSS contained expression(), which runs code.',
      binding: 'The generated CSS tried to bind behaviour to an element.',
      markup: 'The answer contained HTML, not CSS.',
      'not-css': 'The answer was not CSS.',
      unbalanced: 'The generated CSS had unbalanced braces.'
    }
    const lines = (reasons || [])
      .map(reason => known[reason])
      .filter(line => line !== undefined)
      .map(line => i18n.__(line))
    if (lines.length === 0) lines.push(i18n.__('The answer was not usable.'))
    lines.push(i18n.__('Nothing was changed.'))
    return lines.join(' ')
  }

  renderAiCustomCSS() {
    const {
      aiKeyStatus,
      config,
      cssPrompt,
      cssGenerating,
      cssPreview,
      cssError,
      cssUndo
    } = this.state
    // キーの状態が分かるまでは何も出さない。設定済みでなければ出さない
    const ai = config.ai || {}
    const provider = ai.provider || 'openai'
    if (aiKeyStatus === null || !isProviderUsable(aiKeyStatus, provider, ai)) {
      return null
    }
    return (
      <div styleName='ai-css'>
        {/* 自由記述なので 1 行の input では書ききれない。複数行で書けて、
            改行は改行として入り、送信は Cmd/Ctrl + Enter に分ける */}
        <div styleName='ai-css-prompt'>
          <label htmlFor='customCSSPrompt' styleName='ai-css-prompt-label'>
            {i18n.__('Ask AI')}
          </label>
          <textarea
            id='customCSSPrompt'
            styleName='ai-css-input'
            rows={4}
            value={cssPrompt}
            placeholder={i18n.__(
              'e.g. tighten up the headings, and make block quotes stand out more'
            )}
            onChange={e => this.setState({ cssPrompt: e.target.value })}
            onKeyDown={e => this.handleAiPromptKeyDown(e)}
          />
          <div styleName='ai-css-prompt-control'>
            <span styleName='ai-css-prompt-hint'>
              {i18n.__(
                'Enter for a new line, %s to generate',
                this.generateShortcutLabel()
              )}
            </span>
            <button
              type='button'
              styleName='template-picker-button'
              disabled={cssGenerating || cssPrompt.trim() === ''}
              onClick={() => this.handleGenerateCustomCSS()}
            >
              {cssGenerating ? i18n.__('Generating…') : i18n.__('Generate')}
            </button>
          </div>
        </div>
        {cssError === null ? null : (
          <div styleName='ai-css-error'>{cssError}</div>
        )}
        {cssPreview === null
          ? null
          : this.renderGeneratedCSSPreview(cssPreview)}
        {cssUndo === null ? null : (
          <div styleName='template-picker'>
            <button
              type='button'
              styleName='template-picker-button'
              onClick={() => this.handleUndoGeneratedCSS()}
            >
              {i18n.__('Undo the last AI change')}
            </button>
          </div>
        )}
      </div>
    )
  }

  renderGeneratedCSSPreview(preview) {
    const warnsAboutImportant = preview.notes.indexOf('uses-important') !== -1
    return (
      <div styleName='ai-css-preview'>
        <p>
          {i18n.__(
            'Check the result before applying. It is added below what is already in the box.'
          )}
        </p>
        {warnsAboutImportant ? (
          <p styleName='ai-css-note'>
            {i18n.__(
              'This uses !important. Custom CSS is applied last, so it is rarely needed and will beat rules you write later.'
            )}
          </p>
        ) : null}
        <pre styleName='ai-css-code'>{preview.css}</pre>
        <div styleName='template-picker'>
          <button
            type='button'
            styleName='template-picker-button'
            onClick={() => this.handleApplyGeneratedCSS()}
          >
            {i18n.__('Apply')}
          </button>
          <button
            type='button'
            styleName='template-picker-button'
            onClick={() => this.setState({ cssPreview: null })}
          >
            {i18n.__('Discard')}
          </button>
        </div>
      </div>
    )
  }

  generateShortcutLabel() {
    const isMac = /Mac|iPhone|iPad|iPod/.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    )
    return isMac ? '\u2318 + Enter' : 'Ctrl + Enter'
  }

  handleAiPromptKeyDown(e) {
    // 日本語 IME の確定 Enter で送信しない
    if (e.nativeEvent && e.nativeEvent.isComposing) return
    // textarea になったので Enter は改行。送信は Cmd/Ctrl + Enter に分ける
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      this.handleGenerateCustomCSS()
    }
  }

  handleGenerateCustomCSS() {
    const instruction = this.state.cssPrompt.trim()
    if (instruction === '' || this.state.cssGenerating) return
    const currentCSS = this.customCSSCM.getCodeMirror().getValue()
    const themeName = (this.state.config.ui || {}).theme
    this.setState({ cssGenerating: true, cssError: null, cssPreview: null })
    runAiPrompt({
      system: CUSTOM_CSS_SYSTEM_PROMPT,
      prompt: buildCustomCSSPrompt({ instruction, currentCSS, themeName })
    }).then(
      raw => {
        if (!this.mounted) return
        const verdict = validateGeneratedCSS(raw)
        if (!verdict.ok) {
          this.setState({
            cssGenerating: false,
            cssError: this.describeCSSRefusal(verdict.reasons)
          })
          return
        }
        // 検証を通っても、まだエディタには入れない。反映は利用者が決める
        this.setState({ cssGenerating: false, cssPreview: verdict })
      },
      err => {
        if (!this.mounted) return
        this.setState({
          cssGenerating: false,
          cssError:
            (err && err.message) || i18n.__('The answer was not usable.')
        })
      }
    )
  }

  handleApplyGeneratedCSS() {
    const preview = this.state.cssPreview
    if (preview === null) return
    const editor = this.customCSSCM.getCodeMirror()
    const before = editor.getValue()
    const header =
      i18n.__('Generated by AI') + ': ' + this.state.cssPrompt.trim()
    editor.setValue(appendGeneratedCSS(before, preview.css, header))
    editor.setCursor(editor.lineCount(), 0)
    // 直前の内容を持っておく。生成物が気に入らなくても1手で戻せる
    this.setState({ cssPreview: null, cssUndo: before })
    this.handleUIChange()
  }

  handleUndoGeneratedCSS() {
    if (this.state.cssUndo === null) return
    this.customCSSCM.getCodeMirror().setValue(this.state.cssUndo)
    this.setState({ cssUndo: null })
    this.handleUIChange()
  }

  renderCustomCSSTemplateNotes(template) {
    if (template === null) return null
    return template.noteKeys.map(noteKey => (
      <li key={noteKey}>{i18n.__(noteKey)}</li>
    ))
  }

  handleInsertCustomCSSTemplate() {
    const template = findCustomCSSTemplate(this.state.customCSSTemplateId)
    if (template === null) return
    const editor = this.customCSSCM.getCodeMirror()
    const next = appendCustomCSSTemplate(editor.getValue(), template, key =>
      i18n.__(key)
    )
    editor.setValue(next)
    // 挿入された分が見えるところまで送る
    editor.setCursor(editor.lineCount(), 0)
    // react-codemirror は origin === 'setValue' の変更で onChange を呼ばない
    // ので、ここで明示的に拾わないと設定に反映されない
    this.handleUIChange()
  }

  handleUIChange(e) {
    const { codemirrorTheme } = this.state
    let checkHighLight = document.getElementById('checkHighLight')

    if (checkHighLight === null) {
      checkHighLight = document.createElement('link')
      checkHighLight.setAttribute('id', 'checkHighLight')
      checkHighLight.setAttribute('rel', 'stylesheet')
      document.head.appendChild(checkHighLight)
    }

    // Apply UI theme immediately on select change (persisted only on Save)
    const selectedTheme = this.refs.uiTheme.value
    if (selectedTheme !== this.state.config.ui.defaultTheme) {
      applyTheme(selectedTheme)
    }

    // UI とエディタの明暗を揃える。ただし揃えるのは UI テーマだけを変えた時で、
    // エディタのテーマを選び直した時はその選択をそのまま通す
    // （そうしないと暗い UI のまま明るいテーマを選んでも書き戻される）
    const uiIsDark = uiThemes.some(t => t.name === selectedTheme && t.isDark)
    const rawEditorTheme = this.refs.editorTheme.value
    const coupledEditorTheme = applyEditorThemeChoice(
      uiIsDark,
      rawEditorTheme,
      resolveEditorTheme(this.state.config.editor.theme)
    )

    // プレビューのコードブロックも同じ規則で揃える。エディタだけ連動させて
    // いたので、ダークにするとプレビューのコードブロックだけが白く残っていた
    const coupledCodeBlockTheme = applyEditorThemeChoice(
      uiIsDark,
      this.refs.previewCodeBlockTheme.value,
      resolveEditorTheme(this.state.config.preview.codeBlockTheme)
    )

    const newConfig = {
      ui: {
        theme: selectedTheme,
        defaultTheme: selectedTheme,
        // The scheduled-theme UI was removed, so there are no refs to read for
        // these fields. Reading them (this.refs.enableScheduleTheme.checked …)
        // threw "Cannot read properties of undefined" and aborted the whole
        // handler before setState — so NO Interface setting (theme included)
        // ever applied. Preserve the existing config values instead.
        enableScheduleTheme: this.state.config.ui.enableScheduleTheme,
        scheduledTheme: this.state.config.ui.scheduledTheme,
        scheduleStart: this.state.config.ui.scheduleStart,
        scheduleEnd: this.state.config.ui.scheduleEnd,
        language: this.refs.uiLanguage.value,
        defaultNote: this.refs.defaultNote.value,
        tagNewNoteWithFilteringTags: this.refs.tagNewNoteWithFilteringTags
          .checked,
        showCopyNotification: this.refs.showCopyNotification.checked,
        confirmDeletion: this.refs.confirmDeletion.checked,
        showOnlyRelatedTags: this.refs.showOnlyRelatedTags.checked,
        showTagsAlphabetically: this.refs.showTagsAlphabetically.checked,
        saveTagsAlphabetically: this.refs.saveTagsAlphabetically.checked,
        enableLiveNoteCounts: this.refs.enableLiveNoteCounts.checked,
        showScrollBar: this.refs.showScrollBar.checked,
        showMenuBar: this.refs.showMenuBar
          ? this.refs.showMenuBar.checked
          : this.state.config.ui.showMenuBar,
        disableDirectWrite:
          this.refs.uiD2w != null ? this.refs.uiD2w.checked : false
      },
      editor: {
        theme: coupledEditorTheme,
        fontSize: this.refs.editorFontSize.value,
        fontFamily: this.refs.editorFontFamily.value,
        indentType: this.refs.editorIndentType.value,
        indentSize: this.refs.editorIndentSize.value,
        enableRulers: this.refs.enableEditorRulers.value === 'true',
        rulers: this.refs.editorRulers.value.replace(/[^0-9,]/g, '').split(','),
        displayLineNumbers: this.refs.editorDisplayLineNumbers.checked,
        lineWrapping: this.refs.editorLineWrapping.checked,
        switchPreview: this.refs.editorSwitchPreview.value,
        keyMap: this.refs.editorKeyMap.value,
        snippetDefaultLanguage: this.refs.editorSnippetDefaultLanguage.value,
        scrollPastEnd: this.refs.scrollPastEnd.checked,
        fetchUrlTitle: this.refs.editorFetchUrlTitle.checked,
        pasteUrlAction: this.refs.editorPasteUrlAction.value,
        enableTableEditor: this.refs.enableTableEditor.checked,
        enableFrontMatterTitle: this.refs.enableFrontMatterTitle.checked,
        frontMatterTitleField: this.refs.frontMatterTitleField.value,
        matchingPairs: this.refs.matchingPairs.value,
        matchingCloseBefore: this.refs.matchingCloseBefore.value,
        matchingTriples: this.refs.matchingTriples.value,
        explodingPairs: this.refs.explodingPairs.value,
        codeBlockMatchingPairs: this.refs.codeBlockMatchingPairs.value,
        codeBlockMatchingCloseBefore: this.refs.codeBlockMatchingCloseBefore
          .value,
        codeBlockMatchingTriples: this.refs.codeBlockMatchingTriples.value,
        codeBlockExplodingPairs: this.refs.codeBlockExplodingPairs.value,
        spellcheck: this.refs.spellcheck.checked,
        enableSmartPaste: this.refs.enableSmartPaste.checked,
        enableMarkdownLint: this.refs.enableMarkdownLint.checked,
        customMarkdownLintConfig: this.customMarkdownLintConfigCM
          .getCodeMirror()
          .getValue(),
        dateFormatISO8601: this.refs.dateFormatISO8601.checked,
        prettierConfig: this.prettierConfigCM.getCodeMirror().getValue(),
        deleteUnusedAttachments: this.refs.deleteUnusedAttachments.checked,
        rtlEnabled: this.refs.rtlEnabled.checked
      },
      preview: {
        fontSize: this.refs.previewFontSize.value,
        fontFamily: this.refs.previewFontFamily.value,
        codeBlockTheme: coupledCodeBlockTheme,
        lineNumber: this.refs.previewLineNumber.checked,
        showToc: this.refs.previewShowToc.checked,
        tocMinLevel: parseInt(this.refs.previewTocMinLevel.value, 10),
        tocMaxLevel: parseInt(this.refs.previewTocMaxLevel.value, 10),
        latexInlineOpen: this.refs.previewLatexInlineOpen.value,
        latexInlineClose: this.refs.previewLatexInlineClose.value,
        latexBlockOpen: this.refs.previewLatexBlockOpen.value,
        latexBlockClose: this.refs.previewLatexBlockClose.value,
        scrollPastEnd: this.refs.previewScrollPastEnd.checked,
        scrollSync: this.refs.previewScrollSync.checked,
        smartQuotes: this.refs.previewSmartQuotes.checked,
        urlPreview: this.refs.previewUrlPreview.checked,
        breaks: this.refs.previewBreaks.checked,
        smartArrows: this.refs.previewSmartArrows.checked,
        sanitize: this.refs.previewSanitize.value,
        mermaidHTMLLabel: this.refs.previewMermaidHTMLLabel.checked,
        allowCustomCSS: this.refs.previewAllowCustomCSS.checked,
        lineThroughCheckbox: this.refs.lineThroughCheckbox.checked,
        customCSS: this.customCSSCM.getCodeMirror().getValue()
      }
    }

    const newCodemirrorTheme = coupledEditorTheme

    if (newCodemirrorTheme !== codemirrorTheme) {
      const theme = consts.THEMES.find(
        theme => theme.name === newCodemirrorTheme
      )

      if (theme) {
        checkHighLight.setAttribute('href', theme.path)
      }
    }

    // コードブロックの見本も、選び直したその場で切り替える
    const newCodeBlockTheme = resolveEditorTheme(coupledCodeBlockTheme)
    if (newCodeBlockTheme !== this.state.codeBlockTheme) {
      this.applySampleThemeLink('codeBlockHighLight', newCodeBlockTheme)
    }

    this.setState(
      {
        config: newConfig,
        codemirrorTheme: newCodemirrorTheme,
        codeBlockTheme: newCodeBlockTheme
      },
      () => {
        const { ui, editor, preview } = this.props.config
        this.currentConfig = { ui, editor, preview }
        if (_.isEqual(this.currentConfig, this.state.config)) {
          this.props.haveToSave()
        } else {
          this.props.haveToSave({
            tab: 'UI',
            type: 'warning',
            message: i18n.__('Unsaved Changes!')
          })
        }
      }
    )
  }

  handleSaveUIClick(e) {
    const newConfig = {
      ui: this.state.config.ui,
      editor: this.state.config.editor,
      preview: this.state.config.preview
    }

    chooseTheme(newConfig)
    applyTheme(newConfig.ui.theme)

    ConfigManager.set(newConfig)

    store.dispatch({
      type: 'SET_UI',
      config: newConfig
    })
    this.clearMessage()
    this.props.haveToSave()
  }

  clearMessage() {
    _.debounce(() => {
      this.setState({
        UiAlert: null
      })
    }, 2000)()
  }

  formatTime(time) {
    let hour = Math.floor(time / 60)
    let minute = time % 60

    if (hour < 10) {
      hour = '0' + hour
    }

    if (minute < 10) {
      minute = '0' + minute
    }

    return `${hour}:${minute}`
  }

  // エディタテーマの選択肢。色の系統ごとに代表を 1 つだけ出す。
  // 一覧に無いものが保存されていても select が空欄にならないよう、
  // 表示する値は resolveEditorTheme() を通したものにする
  renderEditorThemeOptions(themes) {
    const curated = curateEditorThemes(themes, CURATED_EDITOR_THEME_NAMES)
    const noteOf = name => {
      const entry = CURATED_EDITOR_THEMES.find(t => t.name === name)
      return entry ? entry.label + ' — ' + i18n.__(entry.note) : name
    }
    const groups = [
      { key: 'dark', label: i18n.__('Dark Themes') },
      { key: 'light', label: i18n.__('Light Themes') }
    ]
    return groups.map(group => {
      const names = CURATED_EDITOR_THEMES.filter(
        t => t.group === group.key
      ).map(t => t.name)
      const items = curated.filter(theme => names.indexOf(theme.name) !== -1)
      if (items.length === 0) return null
      return (
        <optgroup label={group.label} key={group.key}>
          {items.map(theme => (
            <option value={theme.name} key={theme.name}>
              {noteOf(theme.name)}
            </option>
          ))}
        </optgroup>
      )
    })
  }

  render() {
    const UiAlert = this.state.UiAlert
    const UiAlertElement =
      UiAlert != null ? (
        <p className={`alert ${UiAlert.type}`}>{UiAlert.message}</p>
      ) : null

    const themes = consts.THEMES
    const { config, codemirrorTheme } = this.state
    // テーマの違いが出る要素を一通り含める（コメント・キーワード・関数名・
    // プロパティ・文字列・数値・演算子）。1 種類しか出ない見本だと選べない
    const codemirrorSampleCode = [
      '// テーマの見本',
      "const amp = { model: 'Bassman', gain: 7.5 }",
      'export function play (track) {',
      '  if (!track) return null',
      "  return amp.model + ' / ' + track.title",
      '}'
    ].join('\n')
    const selectedCustomCSSTemplate = findCustomCSSTemplate(
      this.state.customCSSTemplateId
    )
    const customCSSTemplateNotes = this.renderCustomCSSTemplateNotes(
      selectedCustomCSSTemplate
    )
    const enableEditRulersStyle = config.editor.enableRulers ? 'block' : 'none'
    const fontFamily = normalizeEditorFontFamily(config.editor.fontFamily)
    return (
      <div styleName='root'>
        {/* 縦に一続きだと目的の設定に辿り着けないので、意味の
            まとまりごとに切り替える。テーマは UI・エディタ・
            コードブロックの 3 つが離れていると違いが分からないので
            1 箇所にまとめる。**表示を切り替えるだけで、外しては
            いけない**。保存は this.refs で全項目をまとめて読むため、
            アンマウントすると保存が丸ごと失敗する */}
        <div styleName='section-nav' role='tablist'>
          {this.renderSectionNav()}
        </div>
        <div styleName='group'>
          <div style={this.sectionStyle('theme')}>
            <div styleName='group-header'>{i18n.__('Theme')}</div>
            <div styleName='group-hint'>
              <p>
                {i18n.__(
                  'Three surfaces are themed separately. They are set together here so the differences are visible side by side.'
                )}
              </p>
              <ul>
                <li>
                  {i18n.__(
                    'Interface — the window itself: sidebar, note list, dialogs'
                  )}
                </li>
                <li>{i18n.__('Editor — the pane you type Markdown into')}</li>
                <li>
                  {i18n.__('Code blocks — fenced code inside the preview pane')}
                </li>
              </ul>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Interface Theme')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.ui.defaultTheme}
                  onChange={e => this.handleUIChange(e)}
                  ref='uiTheme'
                >
                  <optgroup label='Light Themes'>
                    {uiThemes
                      .filter(theme => !theme.isDark)
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map(theme => {
                        return (
                          <option value={theme.name} key={theme.name}>
                            {theme.label}
                          </option>
                        )
                      })}
                  </optgroup>
                  <optgroup label='Dark Themes'>
                    {uiThemes
                      .filter(theme => theme.isDark)
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map(theme => {
                        return (
                          <option value={theme.name} key={theme.name}>
                            {theme.label}
                          </option>
                        )
                      })}
                  </optgroup>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Colors of the window itself: sidebar, note list and dialogs.'
              )}
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Theme')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={resolveEditorTheme(config.editor.theme)}
                  ref='editorTheme'
                  onChange={e => this.handleUIChange(e)}
                >
                  {this.renderEditorThemeOptions(themes)}
                </select>
                <div
                  styleName='code-mirror'
                  style={{
                    fontFamily,
                    fontSize: `${parseInt(config.editor.fontSize, 10) || 14}px`
                  }}
                >
                  <ReactCodeMirror
                    ref={e => (this.codeMirrorInstance = e)}
                    value={codemirrorSampleCode}
                    options={{
                      lineNumbers: true,
                      readOnly: true,
                      mode: 'javascript',
                      theme: codemirrorTheme
                    }}
                  />
                </div>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Colors of the pane you type in. It is set apart from the interface theme, so a dark window can hold a light editor.'
              )}
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Code Block Theme')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={resolveEditorTheme(config.preview.codeBlockTheme)}
                  ref='previewCodeBlockTheme'
                  onChange={e => this.handleUIChange(e)}
                >
                  {this.renderEditorThemeOptions(themes)}
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__('Colors of fenced code shown in the preview pane.')}
            </div>
            {this.renderCodeBlockSample()}
          </div>
          <div style={this.sectionStyle('general')}>
            <div styleName='group-header'>{i18n.__('General')}</div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>{i18n.__('Language')}</div>
              <div styleName='group-section-control'>
                <select
                  value={config.ui.language}
                  onChange={e => this.handleUIChange(e)}
                  ref='uiLanguage'
                >
                  {getLanguages().map(language => (
                    <option value={language.locale} key={language.locale}>
                      {i18n.__(language.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Default New Note')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.ui.defaultNote}
                  onChange={e => this.handleUIChange(e)}
                  ref='defaultNote'
                >
                  <option value='ALWAYS_ASK'>{i18n.__('Always Ask')}</option>
                  <option value='MARKDOWN_NOTE'>
                    {i18n.__('Markdown Note')}
                  </option>
                  <option value='SNIPPET_NOTE'>
                    {i18n.__('Snippet Note')}
                  </option>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Which kind of note the new-note button creates. "Ask every time" shows a chooser instead.'
              )}
            </div>

            {/* macOS のメニューバーはシステム側のもので、
                BrowserWindow.setMenuBarVisibility() が効かない。
                押しても何も起きないので出さない（ホットキー側も同じ理由で
                Mac では隠している。HotkeyTab の showMenuBarHotkey 参照） */}
            {!OSX && (
              <div styleName='group-checkBoxSection'>
                <label>
                  <input
                    onChange={e => this.handleUIChange(e)}
                    checked={this.state.config.ui.showMenuBar}
                    ref='showMenuBar'
                    type='checkbox'
                  />
                  &nbsp;
                  {i18n.__('Show menu bar')}
                </label>
              </div>
            )}
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.showCopyNotification}
                  ref='showCopyNotification'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show "Saved to Clipboard" notification when copying')}
              </label>
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.confirmDeletion}
                  ref='confirmDeletion'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show a confirmation dialog when deleting notes')}
              </label>
            </div>
            {global.process.platform === 'win32' ? (
              <div styleName='group-checkBoxSection'>
                <label>
                  <input
                    onChange={e => this.handleUIChange(e)}
                    checked={this.state.config.ui.disableDirectWrite}
                    ref='uiD2w'
                    disabled={OSX}
                    type='checkbox'
                  />
                  &nbsp;
                  {i18n.__(
                    'Disable Direct Write (It will be applied after restarting)'
                  )}
                </label>
              </div>
            ) : null}
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.showScrollBar}
                  ref='showScrollBar'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__(
                  'Show the scroll bars in the editor and in the markdown preview (It will be applied after restarting)'
                )}
              </label>
            </div>
            <div styleName='group-header2'>{i18n.__('Tags')}</div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.saveTagsAlphabetically}
                  ref='saveTagsAlphabetically'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Save tags of a note in alphabetical order')}
              </label>
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.showTagsAlphabetically}
                  ref='showTagsAlphabetically'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show tags of a note in alphabetical order')}
              </label>
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.showOnlyRelatedTags}
                  ref='showOnlyRelatedTags'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show only related tags')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'The tag list only shows tags that appear on the notes currently listed.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.enableLiveNoteCounts}
                  ref='enableLiveNoteCounts'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable live count of notes')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Recounts the number of notes per folder and tag as you edit. Turn it off if the list feels slow with many notes.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.ui.tagNewNoteWithFilteringTags}
                  ref='tagNewNoteWithFilteringTags'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('New notes are tagged with the filtering tags')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'A note created while filtering by tags starts with those tags attached.'
              )}
            </div>
          </div>
          <div style={this.sectionStyle('editor')}>
            <div styleName='group-header'>{i18n.__('Editor')}</div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Font Size')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='editorFontSize'
                  value={config.editor.fontSize}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Font Family')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='editorFontFamily'
                  value={config.editor.fontFamily}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Indent Style')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.editor.indentSize}
                  ref='editorIndentSize'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='1'>1</option>
                  <option value='2'>2</option>
                  <option value='4'>4</option>
                  <option value='8'>8</option>
                </select>
                &nbsp;
                <select
                  value={config.editor.indentType}
                  ref='editorIndentType'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='space'>{i18n.__('Spaces')}</option>
                  <option value='tab'>{i18n.__('Tabs')}</option>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Whether Tab inserts spaces or a tab character, and how wide one level is.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Rulers')}
              </div>
              <div styleName='group-section-control'>
                <div>
                  <select
                    value={config.editor.enableRulers}
                    ref='enableEditorRulers'
                    onChange={e => this.handleUIChange(e)}
                  >
                    <option value='true'>{i18n.__('Enable')}</option>
                    <option value='false'>{i18n.__('Disable')}</option>
                  </select>
                </div>
                <input
                  styleName='group-section-control-input'
                  style={{ display: enableEditRulersStyle }}
                  ref='editorRulers'
                  value={config.editor.rulers}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Vertical guide lines drawn at the given columns. Separate the numbers with commas.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Switch to Preview')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.editor.switchPreview}
                  ref='editorSwitchPreview'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='BLUR'>{i18n.__('When Editor Blurred')}</option>
                  <option value='DBL_CLICK'>
                    {i18n.__('When Editor Blurred, Edit On Double Click')}
                  </option>
                  <option value='RIGHTCLICK'>
                    {i18n.__('On Right Click')}
                  </option>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'When the editor pane hands over to the rendered preview.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Editor Keymap')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.editor.keyMap}
                  ref='editorKeyMap'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='sublime'>{i18n.__('default')}</option>
                  <option value='vim'>{i18n.__('vim')}</option>
                  <option value='emacs'>{i18n.__('emacs')}</option>
                </select>
                <p styleName='note-for-keymap'>
                  {i18n.__(
                    '⚠️ Please restart BoostRecord after you change the keymap'
                  )}
                </p>
                {/* vim はノーマルモードで始まるため、知らないと「文字が
                    打てない」と受け取られる。選んだその場で要点を示す */}
                {config.editor.keyMap === 'vim' && (
                  <div styleName='note-for-keymap'>
                    <VimKeyReference compact />
                  </div>
                )}
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Key bindings inside the editor. Vim and Emacs change most keys, so the shortcuts listed elsewhere may not apply.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Snippet Default Language')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.editor.snippetDefaultLanguage}
                  ref='editorSnippetDefaultLanguage'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option key='Auto Detect' value='Auto Detect'>
                    {i18n.__('Auto Detect')}
                  </option>
                  {_.sortBy(CodeMirror.modeInfo.map(mode => mode.name)).map(
                    name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'The language a new snippet starts in. "Auto detect" guesses from the content.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Front matter title field')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='frontMatterTitleField'
                  value={config.editor.frontMatterTitleField}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'The YAML key read as the note title when a note starts with front matter.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Matching character pairs')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.matchingPairs}
                  ref='matchingPairs'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Typing the left character inserts the right one as well. Written as pairs, in order.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label-right'>
                {i18n.__('in code blocks')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.codeBlockMatchingPairs}
                  ref='codeBlockMatchingPairs'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Close pairs before')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.matchingCloseBefore}
                  ref='matchingCloseBefore'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Auto-closing happens only when the character after the cursor is one of these.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label-right'>
                {i18n.__('in code blocks')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.codeBlockMatchingCloseBefore}
                  ref='codeBlockMatchingCloseBefore'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Matching character triples')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.matchingTriples}
                  ref='matchingTriples'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Same as pairs, for characters that come in threes, such as code fences.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label-right'>
                {i18n.__('in code blocks')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.codeBlockMatchingTriples}
                  ref='codeBlockMatchingTriples'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Exploding character pairs')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.explodingPairs}
                  ref='explodingPairs'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Pressing Enter between these leaves a blank line and puts the cursor on it.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label-right'>
                {i18n.__('in code blocks')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={this.state.config.editor.codeBlockExplodingPairs}
                  ref='codeBlockExplodingPairs'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.enableFrontMatterTitle}
                  ref='enableFrontMatterTitle'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Extract title from front matter')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'When a note starts with YAML front matter, the title comes from the field above instead of the first heading.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.displayLineNumbers}
                  ref='editorDisplayLineNumbers'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show line numbers in the editor')}
              </label>
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.lineWrapping}
                  ref='editorLineWrapping'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Wrap line in Snippet Note')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Long lines fold at the right edge instead of scrolling sideways. Snippet notes only.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.scrollPastEnd}
                  ref='scrollPastEnd'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Allow editor to scroll past the last line')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Lets the last line scroll up to the middle of the pane, so writing does not sit at the bottom edge.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.fetchUrlTitle}
                  ref='editorFetchUrlTitle'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Bring in web page title when pasting URL on editor')}
              </label>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('When pasting URL')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={this.state.config.editor.pasteUrlAction}
                  ref='editorPasteUrlAction'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='LINK'>{i18n.__('Link with title')}</option>
                  <option value='BOOKMARK'>{i18n.__('Bookmark card')}</option>
                  <option value='ASK'>{i18n.__('Ask every time')}</option>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'What a pasted URL turns into: a plain link, a bookmark card, or a question each time.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.enableTableEditor}
                  ref='enableTableEditor'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable smart table editor')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Tab and Enter move between table cells, and the column widths are kept aligned as you type.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.enableSmartPaste}
                  ref='enableSmartPaste'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable HTML paste')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Pasted rich text is converted to Markdown. Off means the plain text is pasted as-is.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.spellcheck}
                  ref='spellcheck'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable spellcheck - Experimental feature!! :)')}
              </label>
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.deleteUnusedAttachments}
                  ref='deleteUnusedAttachments'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__(
                  'Delete attachments, that are not referenced in the text anymore'
                )}
              </label>
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.rtlEnabled}
                  ref='rtlEnabled'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable right to left direction(RTL)')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'For languages written right to left, such as Arabic and Hebrew.'
              )}
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.dateFormatISO8601}
                  ref='dateFormatISO8601'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Date shortcut use iso 8601 format')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'The date shortcut inserts 2026-08-31T12:00:00.000Z instead of the format used in your region.'
              )}
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Custom MarkdownLint Rules')}
              </div>
              <div styleName='group-section-control'>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.editor.enableMarkdownLint}
                  ref='enableMarkdownLint'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable MarkdownLint')}
                <div
                  style={{
                    fontFamily,
                    display: this.state.config.editor.enableMarkdownLint
                      ? 'block'
                      : 'none'
                  }}
                >
                  <ReactCodeMirror
                    width='400px'
                    height='200px'
                    onChange={e => this.handleUIChange(e)}
                    ref={e => (this.customMarkdownLintConfigCM = e)}
                    value={config.editor.customMarkdownLintConfig}
                    options={{
                      lineNumbers: true,
                      mode: 'application/json',
                      theme: codemirrorTheme,
                      lint: true,
                      gutters: [
                        'CodeMirror-linenumbers',
                        'CodeMirror-foldgutter',
                        'CodeMirror-lint-markers'
                      ]
                    }}
                  />
                </div>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'markdownlint rules written as JSON. Applies only while the checkbox above is on.'
              )}
            </div>
          </div>
          <div style={this.sectionStyle('preview')}>
            <div styleName='group-header'>{i18n.__('Preview')}</div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Preview Font Size')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  value={config.preview.fontSize}
                  ref='previewFontSize'
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Preview Font Family')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewFontFamily'
                  value={config.preview.fontFamily}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>

            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.lineThroughCheckbox}
                  ref='lineThroughCheckbox'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Allow line through checkbox')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Text of a checked task is struck through in the preview.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.scrollPastEnd}
                  ref='previewScrollPastEnd'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Allow preview to scroll past the last line')}
              </label>
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.scrollSync}
                  ref='previewScrollSync'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('When scrolling, synchronize preview with editor')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Scrolling one pane moves the other to the matching place.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.lineNumber}
                  ref='previewLineNumber'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show line numbers for preview code blocks')}
              </label>
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.showToc !== false}
                  ref='previewShowToc'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show the outline pane')}
              </label>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Heading levels in the outline')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={this.state.config.preview.tocMinLevel || 1}
                  onChange={e => this.handleUIChange(e)}
                  ref='previewTocMinLevel'
                >
                  {[1, 2, 3, 4, 5, 6].map(level => (
                    <option key={level} value={level}>{`H${level}`}</option>
                  ))}
                </select>
                &nbsp;-&nbsp;
                <select
                  value={this.state.config.preview.tocMaxLevel || 3}
                  onChange={e => this.handleUIChange(e)}
                  ref='previewTocMaxLevel'
                >
                  {[1, 2, 3, 4, 5, 6].map(level => (
                    <option key={level} value={level}>{`H${level}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__('Which heading levels the outline pane lists.')}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.smartQuotes}
                  ref='previewSmartQuotes'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable smart quotes')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Straight quotes become typographic quotes in the preview.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.urlPreview}
                  ref='previewUrlPreview'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Show page preview popup when hovering links')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Hovering an external link fetches that page and shows its title and summary. It reaches the network.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.breaks}
                  ref='previewBreaks'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Render newlines in Markdown paragraphs as <br>')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'A single line break becomes a line break in the preview. Standard Markdown would join the lines instead.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.smartArrows}
                  ref='previewSmartArrows'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__(
                  'Convert textual arrows to beautiful signs. ⚠ This will interfere with using HTML comments in your Markdown.'
                )}
              </label>
            </div>

            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Sanitization')}
              </div>
              <div styleName='group-section-control'>
                <select
                  value={config.preview.sanitize}
                  ref='previewSanitize'
                  onChange={e => this.handleUIChange(e)}
                >
                  <option value='STRICT'>
                    ✅ {i18n.__('Only allow secure html tags (recommended)')}
                  </option>
                  <option value='ALLOW_STYLES'>
                    ⚠️ {i18n.__('Allow styles')}
                  </option>
                  <option value='NONE'>
                    ❌ {i18n.__('Allow dangerous html tags')}
                  </option>
                </select>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'How much raw HTML the preview is allowed to render. "Strict" removes it entirely.'
              )}
            </div>
            <div styleName='group-checkBoxSection'>
              <label>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={this.state.config.preview.mermaidHTMLLabel}
                  ref='previewMermaidHTMLLabel'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Enable HTML label in mermaid flowcharts')}
              </label>
            </div>
            <div styleName='group-checkBoxSection-hint'>
              {i18n.__(
                'Lets mermaid node labels contain HTML. Off renders them as plain text.'
              )}
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('LaTeX Inline Open Delimiter')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewLatexInlineOpen'
                  value={config.preview.latexInlineOpen}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('LaTeX Inline Close Delimiter')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewLatexInlineClose'
                  value={config.preview.latexInlineClose}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('LaTeX Block Open Delimiter')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewLatexBlockOpen'
                  value={config.preview.latexBlockOpen}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('LaTeX Block Close Delimiter')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewLatexBlockClose'
                  value={config.preview.latexBlockClose}
                  onChange={e => this.handleUIChange(e)}
                  type='text'
                />
              </div>
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>{i18n.__('Custom CSS')}</div>
              <div styleName='group-section-control'>
                <input
                  onChange={e => this.handleUIChange(e)}
                  checked={config.preview.allowCustomCSS}
                  ref='previewAllowCustomCSS'
                  type='checkbox'
                />
                &nbsp;
                {i18n.__('Allow custom CSS for preview')}
                <div styleName='template-picker'>
                  <label htmlFor='customCSSTemplate'>
                    {i18n.__('Template')}
                  </label>
                  <select
                    id='customCSSTemplate'
                    value={this.state.customCSSTemplateId}
                    onChange={e =>
                      this.setState({ customCSSTemplateId: e.target.value })
                    }
                  >
                    {CUSTOM_CSS_TEMPLATES.map(template => (
                      <option key={template.id} value={template.id}>
                        {i18n.__(template.labelKey)}
                      </option>
                    ))}
                  </select>
                  <button
                    type='button'
                    styleName='template-picker-button'
                    onClick={() => this.handleInsertCustomCSSTemplate()}
                  >
                    {i18n.__('Insert')}
                  </button>
                </div>
                <div styleName='template-picker-note'>
                  <p>
                    {i18n.__(
                      'Added below what is already in the box. Nothing is replaced.'
                    )}
                  </p>
                  <ul>{customCSSTemplateNotes}</ul>
                </div>
                {this.renderAiCustomCSS()}
                <div style={{ fontFamily }}>
                  <ReactCodeMirror
                    width='400px'
                    height='400px'
                    onChange={e => this.handleUIChange(e)}
                    ref={e => (this.customCSSCM = e)}
                    value={config.preview.customCSS}
                    options={{
                      lineNumbers: true,
                      mode: 'css',
                      theme: codemirrorTheme
                    }}
                  />
                </div>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Extra CSS applied to the preview pane. Applies only while the checkbox above is on.'
              )}
            </div>
            <div styleName='group-section'>
              <div styleName='group-section-label'>
                {i18n.__('Prettier Config')}
              </div>
              <div styleName='group-section-control'>
                <div style={{ fontFamily }}>
                  <ReactCodeMirror
                    width='400px'
                    height='400px'
                    onChange={e => this.handleUIChange(e)}
                    ref={e => (this.prettierConfigCM = e)}
                    value={config.editor.prettierConfig}
                    options={{
                      lineNumbers: true,
                      mode: 'application/json',
                      lint: true,
                      theme: codemirrorTheme
                    }}
                  />
                </div>
              </div>
            </div>
            <div styleName='group-section-hint'>
              {i18n.__(
                'Options for the Markdown formatter. Used by the "Prettify Markdown" shortcut.'
              )}
            </div>
          </div>
          <div styleName='group-control'>
            <button
              styleName='group-control-rightButton'
              onClick={e => this.handleSaveUIClick(e)}
            >
              {i18n.__('Save')}
            </button>
            {UiAlertElement}
          </div>
        </div>
      </div>
    )
  }
}

UiTab.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string
  }),
  dispatch: PropTypes.func,
  haveToSave: PropTypes.func
}

export default CSSModules(UiTab, styles)
