(function (mod) {
  if (typeof exports === 'object' && typeof module === 'object') { // Common JS
    mod(require('../codemirror/lib/codemirror'))
  } else if (typeof define === 'function' && define.amd) { // AMD
    define(['../codemirror/lib/codemirror'], mod)
  } else { // Plain browser env
    mod(CodeMirror)
  }
})(function (CodeMirror) {
  'use strict'

  const shell = require('electron').shell

  class HyperLink {
    constructor(cm) {
      this.xOffset = 10
      this.yOffset = 2
      this.cm = cm
      this.lineDiv = cm.display.lineDiv

      this.onClick = this.onClick.bind(this)
      this.onMouseEnter = this.onMouseEnter.bind(this)
      this.onMouseLeave = this.onMouseLeave.bind(this)
      this.onMouseMove = this.onMouseMove.bind(this)

      this.tooltip = document.createElement('div')
      this.tooltipContent = document.createElement('div')
      this.tooltipIndicator = document.createElement('div')
      this.tooltip.setAttribute('class', 'CodeMirror-hover')
      this.tooltip.setAttribute('cm-ignore-events', 'true')
      this.tooltip.appendChild(this.tooltipContent)
      this.tooltip.appendChild(this.tooltipIndicator)
      this.tooltipContent.textContent = 'Cmd + click to follow link'

      this.lineDiv.addEventListener('click', this.onClick, true)
      this.lineDiv.addEventListener('mouseenter', this.onMouseEnter, true)
      this.lineDiv.addEventListener('mouseleave', this.onMouseLeave, true)
      this.lineDiv.addEventListener('mousemove', this.onMouseMove, true)
    }
    getUrl(el) {
      const className = el.className.split(' ')

      if (className.indexOf('cm-url') !== -1) {
        const match = /^\((.*)\)|\[(.*)\]|(.*)$/.exec(el.textContent)
        return match[1] || match[2] || match[3]
      }

      return null
    }
    onClick(e) {
      const { target, metaKey } = e
      if (!metaKey) {
        return
      }

      const url = this.getUrl(target)
      if (url) {
        e.preventDefault()
        e.stopPropagation()

        shell.openExternal(url)
      }
    }
    onMouseEnter(e) {
      const { target, metaKey } = e

      const url = this.getUrl(target)
      if (url) {
        if (metaKey) {
          target.classList.add('CodeMirror-hyperlink')
        }

        this.showInfo(target)
      }
    }
    onMouseLeave(e) {
      if (this.tooltip.parentElement === this.lineDiv) {
        e.target.classList.remove('CodeMirror-hyperlink')

        this.lineDiv.removeChild(this.tooltip)
      }
    }
    onMouseMove(e) {
      if (this.tooltip.parentElement === this.lineDiv) {
        if (e.metaKey) {
          e.target.classList.add('CodeMirror-hyperlink')
        }
        else {
          e.target.classList.remove('CodeMirror-hyperlink')
        }
      }
    }
    showInfo(relatedTo) {
      const b1 = relatedTo.getBoundingClientRect()
      const b2 = this.lineDiv.getBoundingClientRect()
      const tdiv = this.tooltip
      let xOffset = this.xOffset

      tdiv.style.left = (b1.left - b2.left - xOffset) + 'px'
      this.lineDiv.appendChild(tdiv)

      const b3 = tdiv.getBoundingClientRect()
      if (b3.right > b2.right) {
        xOffset = b3.right - b2.right
        tdiv.style.left = (b1.left - b2.left - xOffset) + 'px'
      }
      tdiv.style.top = (b1.top - b2.top - b3.height - this.yOffset) + 'px'

      this.tooltipIndicator.style.marginLeft = xOffset + 'px'
    }
  }

  CodeMirror.defineOption('hyperlink', true, (cm) => {
    const addon = new HyperLink(cm)
  })
})