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
import _ from 'lodash'
import i18n from 'browser/lib/i18n'
import VimKeyReference from 'browser/components/VimKeyReference'
import { getLanguages } from 'browser/lib/Languages'
import normalizeEditorFontFamily from 'browser/lib/normalizeEditorFontFamily'
import uiThemes from 'browser/lib/ui-themes'
import { groupThemes, displayName } from 'browser/lib/themeCatalog'
import {
  getPresets,
  applyPreset,
  detectPreset
} from 'browser/lib/settingPresets'
import { coupleEditorTheme } from 'browser/lib/editorThemes'
import { chooseTheme, applyTheme } from 'browser/main/lib/ThemeManager'

const OSX = global.process.platform === 'darwin'

// 明暗の表と既定値は browser/lib/editorThemes.js が単一の出どころ

const electron = require('electron')
const ipc = electron.ipcRenderer

class UiTab extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      config: props.config,
      codemirrorTheme: props.config.editor.theme,
      // テーマ一覧は既定で「推奨」だけを出す。54件を一度に並べると、
      // 名前から中身が想像できないぶん選べない（利用者からの指摘）
      showAllThemes: false
    }
  }

  componentDidMount() {
    CodeMirror.autoLoadMode(
      this.codeMirrorInstance.getCodeMirror(),
      'javascript'
    )
    CodeMirror.autoLoadMode(this.customCSSCM.getCodeMirror(), 'css')
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
    ipc.removeListener('APP_SETTING_DONE', this.handleSettingDone)
    ipc.removeListener('APP_SETTING_ERROR', this.handleSettingError)
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

    // Keep the editor (CodeMirror) theme in the same light/dark mode as the
    // interface. Only switch on a mismatch, so a deliberate same-mode editor
    // theme (e.g. dracula under a dark UI) is preserved.
    const uiIsDark = uiThemes.some(t => t.name === selectedTheme && t.isDark)
    const rawEditorTheme = this.refs.editorTheme.value
    const coupledEditorTheme = coupleEditorTheme(uiIsDark, rawEditorTheme)

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
        showMenuBar: this.refs.showMenuBar.checked,
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
        codeBlockTheme: this.refs.previewCodeBlockTheme.value,
        lineNumber: this.refs.previewLineNumber.checked,
        showToc: this.refs.previewShowToc.checked,
        tocMinLevel: parseInt(this.refs.previewTocMinLevel.value, 10),
        tocMaxLevel: parseInt(this.refs.previewTocMaxLevel.value, 10),
        latexInlineOpen: this.refs.previewLatexInlineOpen.value,
        latexInlineClose: this.refs.previewLatexInlineClose.value,
        latexBlockOpen: this.refs.previewLatexBlockOpen.value,
        latexBlockClose: this.refs.previewLatexBlockClose.value,
        plantUMLServerAddress: this.refs.previewPlantUMLServerAddress.value,
        scrollPastEnd: this.refs.previewScrollPastEnd.checked,
        scrollSync: this.refs.previewScrollSync.checked,
        smartQuotes: this.refs.previewSmartQuotes.checked,
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

    this.setState(
      { config: newConfig, codemirrorTheme: newCodemirrorTheme },
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

  /**
   * テーマの選択肢。**推奨（実測でコントラスト合格）を先に出す。**
   * 54 個を名前順に並べても、どれが読めるのか利用者には判断材料が無い
   */
  renderThemeOptions(themes, currentValue) {
    const { recommended, others } = groupThemes(themes)
    const { showAllThemes } = this.state
    const groups = [
      <optgroup key='recommended' label={i18n.__('Recommended (readable)')}>
        {recommended.map(theme => (
          <option value={theme.name} key={theme.name}>
            {displayName(theme.name)}
          </option>
        ))}
      </optgroup>
    ]

    // 畳んでいる時でも、いま選ばれているものは必ず選択肢に残す。
    // 消すと value が一覧に無い状態になり、選択が黙って別物へ飛ぶ
    const currentIsHidden =
      !showAllThemes &&
      others.some(theme => theme.name === currentValue) &&
      !recommended.some(theme => theme.name === currentValue)
    if (currentIsHidden) {
      groups.push(
        <optgroup key='current' label={i18n.__('Current setting')}>
          <option value={currentValue}>{displayName(currentValue)}</option>
        </optgroup>
      )
    }

    if (showAllThemes) {
      groups.push(
        <optgroup key='others' label={i18n.__('Others')}>
          {others.map(theme => (
            <option value={theme.name} key={theme.name}>
              {displayName(theme.name)}
            </option>
          ))}
        </optgroup>
      )
    }
    return groups
  }

  /** 全件表示の切替。設定には保存しない（その場の探し物のためのもの） */
  renderShowAllThemes(themes) {
    const { others } = groupThemes(themes)
    return (
      <label styleName='theme-toggle'>
        <input
          type='checkbox'
          checked={this.state.showAllThemes}
          onChange={e => this.setState({ showAllThemes: e.target.checked })}
        />
        &nbsp;
        {i18n.__('Show all themes (%s more)', String(others.length))}
      </label>
    )
  }

  /**
   * 目的から選ぶプリセット。見え方の項目だけをまとめて設定する。
   * 個々の設定は残したままなので、後から自由に上書きできる
   */
  renderPresets() {
    const presets = getPresets()
    const current = detectPreset(this.state.config, presets)
    return (
      <div styleName='group-section'>
        <div styleName='group-section-label'>{i18n.__('Presets')}</div>
        <div styleName='group-section-control'>
          <div styleName='preset-list'>
            {presets.map(preset => (
              <button
                key={preset.id}
                styleName={current === preset.id ? 'preset--active' : 'preset'}
                onClick={() => this.handlePresetClick(preset)}
                title={preset.description}
                aria-pressed={current === preset.id ? 'true' : 'false'}
              >
                <span styleName='preset-label'>{preset.label}</span>
                <span styleName='preset-description'>{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /** プリセットは押した時点で適用・保存する（保存ボタンを探させない） */
  handlePresetClick(preset) {
    // applyPreset は ui/editor/preview しか返さない。state.config には
    // 他のキー（hotkey 等）も入っているので、**上書きではなく重ねる**
    const patch = applyPreset(this.state.config, preset)
    const newConfig = Object.assign({}, this.state.config, patch)
    this.setState(
      { config: newConfig, codemirrorTheme: newConfig.editor.theme },
      () => {
        applyTheme(newConfig.ui.theme)
        ConfigManager.set(patch)
        store.dispatch({ type: 'SET_UI', config: patch })
        // 押した時点で保存しているので、未保存バナーを残さない
        this.currentConfig = newConfig
        this.props.haveToSave()
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

  render() {
    const UiAlert = this.state.UiAlert
    const UiAlertElement =
      UiAlert != null ? (
        <p className={`alert ${UiAlert.type}`}>{UiAlert.message}</p>
      ) : null

    const themes = consts.THEMES
    const { config, codemirrorTheme } = this.state
    const codemirrorSampleCode =
      'function iamHappy (happy) {\n\tif (happy) {\n\t  console.log("I am Happy!")\n\t} else {\n\t  console.log("I am not Happy!")\n\t}\n};'
    const enableEditRulersStyle = config.editor.enableRulers ? 'block' : 'none'
    const fontFamily = normalizeEditorFontFamily(config.editor.fontFamily)
    return (
      <div styleName='root'>
        <div styleName='group'>
          <div styleName='group-header'>{i18n.__('Interface')}</div>

          {this.renderPresets()}

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
          <div styleName='group-section'>
            <div styleName='group-section-label'>{i18n.__('Editor Theme')}</div>
            <div styleName='group-section-control'>
              <select
                value={config.editor.theme}
                ref='editorTheme'
                onChange={e => this.handleUIChange(e)}
              >
                {this.renderThemeOptions(themes, config.editor.theme)}
              </select>
              {this.renderShowAllThemes(themes)}
              <div styleName='code-mirror' style={{ fontFamily }}>
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
          <div styleName='group-section'>
            <div styleName='group-section-label'>
              {i18n.__('Code Block Theme')}
            </div>
            <div styleName='group-section-control'>
              <select
                value={config.preview.codeBlockTheme}
                ref='previewCodeBlockTheme'
                onChange={e => this.handleUIChange(e)}
              >
                {this.renderThemeOptions(themes, config.preview.codeBlockTheme)}
              </select>
              {this.renderShowAllThemes(themes)}
            </div>
          </div>
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
                <option value='SNIPPET_NOTE'>{i18n.__('Snippet Note')}</option>
              </select>
            </div>
          </div>

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
          <div styleName='group-header2'>Tags</div>
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

          <div styleName='group-header2'>Editor</div>

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
                <option value='RIGHTCLICK'>{i18n.__('On Right Click')}</option>
              </select>
            </div>
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
                  '⚠️ Please restart The Boosters after you change the keymap'
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

          <details styleName='advanced'>
            <summary styleName='advanced-summary'>
              {i18n.__('Advanced editor options')}
            </summary>
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
          </details>
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

          <div styleName='group-header2'>{i18n.__('Preview')}</div>
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
            <div styleName='group-section-label'>{i18n.__('Sanitization')}</div>
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
          <details styleName='advanced'>
            <summary styleName='advanced-summary'>
              {i18n.__('Advanced preview options')}
            </summary>
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
              <div styleName='group-section-label'>
                {i18n.__('PlantUML Server')}
              </div>
              <div styleName='group-section-control'>
                <input
                  styleName='group-section-control-input'
                  ref='previewPlantUMLServerAddress'
                  value={config.preview.plantUMLServerAddress}
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
          </details>
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
