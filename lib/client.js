// dsh-mineru 的浏览器端 half（client bundle）。
//
// 手写 CJS + ModuleLoader 包装（同 dsh-annotation 模式，零构建步骤）：
// 纯 DOM 自渲染，cordis 服务经 exports.inject 的字符串名接入。
//
// 功能：
//   1. 右上角「MinerU」按钮 → 打开 better-sidebar 预览 tab（无 better-sidebar 时回退 modal）
//   2. 左侧列出已解析文档（/mineru/api/list）
//   3. 右侧 iframe 预览最终 HTML（/mineru/preview/<id>）
//   4. 在预览里划词 → 出现「引用到对话」按钮 → 把选中文本插入当前 DSH 草稿
//   5. 支持输入 PDF 路径并直接解析（/mineru/api/parse）
//   6. 每个条目可下载 MinerU 中间 zip（/mineru/download/<id>）
window.__ModuleLoader__.load({
  // 必须与 package.json "name" 完全一致。
  id: 'dsh-mineru',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    // React is external in the DSH client ModuleLoader (same pattern as
    // dsh-web-pty). It is only used for the native DSH Settings section; the
    // MinerU launcher/modal remain pure DOM.
    var React = require('react')

    // ============================== 样式 ==============================
    var STYLE_ID = 'dsh-mineru-style'
    if (document.getElementById(STYLE_ID) === null) {
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = [
        '[data-dsh-mineru] { all: initial; }',
        '[data-dsh-mineru] * { box-sizing: border-box; }',
        '.dsh-mineru-launcher { position: fixed; top: 3px; right: 224px; z-index: 45;',
        '  display: inline-flex; align-items: center; justify-content: center;',
        '  width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;',
        '  background: transparent; color: var(--dsw-alias-label-secondary, #9aa5b8);',
        '  font-size: 13px; font-weight: 700; line-height: 1; cursor: pointer;',
        '  -webkit-app-region: no-drag; }',
        '.dsh-mineru-launcher:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(125, 207, 255, 0.12));',
        '  color: var(--dsw-alias-label-primary, #d8dee9); }',
        '.dsh-mineru-overlay { position: fixed; inset: 0; z-index: 1000;',
        '  display: flex; align-items: center; justify-content: center;',
        '  background: rgba(6, 8, 12, 0.62); backdrop-filter: blur(2px); pointer-events: auto; }',
        '.dsh-mineru-panel { width: min(1200px, 95vw); height: min(780px, 90vh);',
        '  display: flex; flex-direction: column; background: var(--dsw-specific-tip, #10131a);',
        '  border: 1px solid var(--dsw-alias-border-l2, #2a3040); border-radius: 12px; overflow: hidden;',
        '  box-shadow: var(--dsw-shadow-lv3, 0 24px 60px rgba(0,0,0,.55)); }',
        '.dsh-mineru-panel-embedded { width: 100%; height: 100%; border: 0; border-radius: 0;',
        '  box-shadow: none; }',
        '.dsh-mineru-sidebar-host { display: flex; flex-direction: column; width: 100%;',
        '  height: 100%; min-height: 0; background: var(--dsw-alias-bg-layer-1, #0c0f16); }',
        '.dsh-mineru-head { display: flex; align-items: center; gap: 10px;',
        '  padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, #232936); background: var(--dsw-alias-bg-layer-2, #141822); }',
        '.dsh-mineru-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-text-accent, #9db7ff); white-space: nowrap; }',
        '.dsh-mineru-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8b93a7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-input { flex: 1 1 260px; min-width: 180px; background: var(--dsw-alias-bg-layer-1, #0c0f16);',
        '  border: 1px solid var(--dsw-alias-border-l2, #2a3040); border-radius: 6px; color: var(--dsw-alias-label-primary, #d8dee9);',
        '  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
        '  padding: 5px 8px; outline: none; }',
        '.dsh-mineru-input:focus { border-color: var(--dsw-alias-text-accent, #7aa2f7); }',
        '.dsh-mineru-btn { border: 1px solid var(--dsw-alias-border-l2, #2a3040); background: transparent; color: var(--dsw-alias-label-primary, #c0caf5);',
        '  border-radius: 6px; font-size: 12px; padding: 5px 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-btn:hover { background: var(--dsw-alias-interactive-bg-hover, #242c3d); border-color: var(--dsw-alias-text-accent, #7aa2f7); }',
        '.dsh-mineru-btn:disabled { opacity: 0.6; cursor: default; }',
        '.dsh-mineru-btn-primary { background: var(--dsw-alias-button-primary-fill, #2b3a67); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #dbe4ff); }',
        '.dsh-mineru-btn-close { color: var(--dsw-alias-error-primary, #f7768e); }',
        '.dsh-mineru-body { flex: 1; display: flex; min-height: 0; }',
        '.dsh-mineru-side { width: 280px; min-width: 220px; border-right: 1px solid var(--dsw-alias-border-l2, #232936);',
        '  overflow-y: auto; background: var(--dsw-alias-bg-layer-1, #11141d); padding: 8px; }',
        '.dsh-mineru-item { display: block; width: 100%; text-align: left; padding: 8px 10px;',
        '  border: 1px solid transparent; border-radius: 8px; background: transparent;',
        '  color: var(--dsw-alias-label-primary, #d8dee9); cursor: pointer; }',
        '.dsh-mineru-itemwrap { position: relative; display: flex; align-items: stretch;',
        '  gap: 2px; margin-bottom: 4px; }',
        '.dsh-mineru-itemwrap .dsh-mineru-item { flex: 1; min-width: 0; }',
        '.dsh-mineru-item-more { flex: none; width: 28px; border: 1px solid transparent;',
        '  border-radius: 8px; background: transparent; color: var(--dsw-alias-label-tertiary, #8b93a7); cursor: pointer;',
        '  font-size: 14px; line-height: 1; }',
        '.dsh-mineru-item-more:hover, .dsh-mineru-item-more.active { background: var(--dsw-alias-interactive-bg-hover, #1f2740);',
        '  border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #dbe4ff); }',
        '.dsh-mineru-item-menu { position: absolute; right: 0; top: calc(100% + 2px); z-index: 20;',
        '  min-width: 150px; padding: 4px; display: none; background: var(--dsw-specific-tip, #1c2230);',
        '  border: 1px solid var(--dsw-alias-border-l2, #2a3040); border-radius: 8px; box-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0,0,0,.5)); }',
        '.dsh-mineru-item-menu.open { display: block; }',
        '.dsh-mineru-item-menu-item { display: block; width: 100%; text-align: left; padding: 6px 10px;',
        '  border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary, #d8dee9);',
        '  font-size: 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-item-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, #242c3d); }',
        '.dsh-mineru-item-menu-danger { color: var(--dsw-alias-error-primary, #f7768e); }',
        '.dsh-mineru-item:hover { background: var(--dsw-alias-bg-layer-3, #1a1f2b); }',
        '.dsh-mineru-item.active { background: var(--dsw-alias-interactive-bg-active, #1f2740); border-color: var(--dsw-alias-button-primary-fill, #3a5091); }',
        '.dsh-mineru-item-title { font-size: 12px; font-weight: 600; line-height: 1.35; margin-bottom: 3px; word-break: break-word; }',
        '.dsh-mineru-item-meta { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8b93a7); line-height: 1.4; }',
        '.dsh-mineru-empty { padding: 20px 10px; color: var(--dsw-alias-label-caption, #6b7280); font-size: 12px; text-align: center; }',
        '.dsh-mineru-preview { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--dsw-alias-bg-layer-1, #0c0f16); position: relative; }',
        '.dsh-mineru-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px;',
        '  padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, #232936); background: var(--dsw-alias-bg-layer-2, #141822); }',
        '.dsh-mineru-status { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8b93a7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-progress { display: none; padding: 6px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, #232936);',
        '  background: var(--dsw-alias-bg-layer-1, #12161f); }',
        '.dsh-mineru-progress.visible { display: block; }',
        '.dsh-mineru-progress-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-3, #1a1f2b); overflow: hidden; }',
        '.dsh-mineru-progress-fill { height: 100%; width: 0%;',
        '  background: linear-gradient(90deg, var(--dsw-alias-text-accent, #7aa2f7), var(--dsw-alias-button-primary-fill, #2b3a67)); transition: width .3s; }',
        '.dsh-mineru-progress-label { font-size: 11px; color: var(--dsw-alias-label-tertiary, #8b93a7); margin-bottom: 4px;',
        '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-resizer { flex: none; width: 6px; cursor: col-resize; background: var(--dsw-alias-border-l2, #232936);',
        '  border-left: 1px solid var(--dsw-alias-border-l2, #2a3040); }',
        '.dsh-mineru-resizer:hover, .dsh-mineru-resizer.dragging { background: var(--dsw-alias-button-primary-fill, #3a5091); }',
        '.dsh-mineru-frame { flex: 1; width: 100%; border: 0; background: #fff; }',
        '.dsh-mineru-quotebtn { position: fixed; z-index: 1002; display: none; padding: 6px 12px;',
        '  border: 1px solid var(--dsw-alias-button-primary-fill, #3a5091); border-radius: 8px; background: var(--dsw-alias-button-primary-fill, #243354); color: var(--dsw-alias-label-primary-foreground, #dbe4ff);',
        '  font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.5); }',
        '.dsh-mineru-quotebtn:hover { background: var(--dsw-alias-button-primary-hover, #2c3f66); }',
        '.dsh-mineru-quote-dock { box-sizing: border-box; flex: none; margin: 0 auto;',
        '  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));',
        '  max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));',
        '  font-family: var(--dsw-font-family, system-ui);',
        '  color: var(--dsw-alias-label-primary, #d8dee9); background: var(--dsw-specific-tip, #1c2230);',
        '  border: 1px solid var(--dsw-alias-border-l2, #2a3040); border-radius: 10px;',
        '  padding: 6px 10px; }',
        '.dsh-mineru-quote-dock-head { display: flex; align-items: center; gap: 8px;',
        '  font-size: 12px; font-weight: 600; }',
        '.dsh-mineru-quote-dock-count { color: var(--dsw-alias-label-tertiary, #8b93a7); font-weight: 400; }',
        '.dsh-mineru-quote-dock-clear, .dsh-mineru-quote-dock-item-remove { border: 0; background: transparent;',
        '  color: var(--dsw-alias-label-tertiary, #8b93a7); cursor: pointer; font-size: 14px; line-height: 1;',
        '  padding: 2px 6px; border-radius: 6px; }',
        '.dsh-mineru-quote-dock-clear { margin-left: auto; }',
        '.dsh-mineru-quote-dock-clear:hover, .dsh-mineru-quote-dock-item-remove:hover { background: var(--dsw-alias-interactive-bg-hover, #242c3d); color: var(--dsw-alias-error-primary, #f7768e); }',
        '.dsh-mineru-quote-dock-list { margin: 6px 0 0; padding: 0; list-style: none; display: flex;',
        '  flex-direction: column; gap: 4px; }',
        '.dsh-mineru-quote-dock-item { display: flex; align-items: flex-start; gap: 6px;',
        '  padding: 4px 6px; border-radius: 6px; background: var(--dsw-alias-bg-layer-1, #11141d); }',
        '.dsh-mineru-quote-dock-item-title { font-size: 11px; font-weight: 600; white-space: nowrap; }',
        '.dsh-mineru-quote-dock-item-loc { font-size: 10px; color: var(--dsw-alias-label-tertiary, #8b93a7);',
        '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }',
        '.dsh-mineru-quote-dock-item-snippet { flex: 1; font-size: 11px; color: var(--dsw-alias-label-secondary, #c0caf5);',
        '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-toast { position: fixed; left: 50%; bottom: 48px; transform: translateX(-50%);',
        '  z-index: 1003; max-width: 80vw; padding: 8px 14px; border-radius: 8px;',
        '  background: var(--dsw-specific-tip, #1c2230); border: 1px solid var(--dsw-alias-border-l2, #2a3040); color: var(--dsw-alias-label-primary, #d8dee9); font-size: 12px;',
        '  box-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0,0,0,.5)); }',
        '.dsh-mineru-fade { opacity: 0; transition: opacity .25s; }',
        // Settings page (rendered inside the DSH Settings shell)
        '.dsh-mineru-settings { font-family: var(--dsw-font-family, system-ui); color: var(--dsw-alias-label-primary);',
        '  max-width: 640px; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }',
        '.dsh-mineru-settings h2 { font-size: 16px; font-weight: 600; margin: 0; }',
        '.dsh-mineru-settings p { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin: 0; line-height: 1.55; }',
        '.dsh-mineru-settings label { display: flex; flex-direction: column; gap: 5px; font-size: 12px;',
        '  color: var(--dsw-alias-label-secondary); }',
        '.dsh-mineru-settings input, .dsh-mineru-settings select { background: var(--dsw-alias-bg-layer-1, var(--dsw-specific-tip, #1c2230));',
        '  border: 1px solid var(--dsw-alias-border-l2, #2a3040); border-radius: 6px; color: var(--dsw-alias-label-primary, #d8dee9);',
        '  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 6px 8px; outline: none; }',
        '.dsh-mineru-settings input:focus, .dsh-mineru-settings select:focus { border-color: var(--dsw-alias-text-accent, #7aa2f7); }',
        '.dsh-mineru-settings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
        '.dsh-mineru-settings button { align-self: flex-start; border: 1px solid var(--dsw-alias-button-primary-fill, #3a5091); background: var(--dsw-alias-button-primary-fill, #243354);',
        '  color: var(--dsw-alias-label-primary-foreground, #dbe4ff); border-radius: 6px; font-size: 12px; padding: 6px 16px; cursor: pointer; }',
        '.dsh-mineru-settings button:hover { background: var(--dsw-alias-button-primary-hover, #2c3f66); }',
        '.dsh-mineru-settings button:disabled { opacity: .6; cursor: default; }',
        '.dsh-mineru-settings-msg { font-size: 12px; }',
        '.dsh-mineru-settings-msg.ok { color: var(--dsw-alias-state-success-primary, #7bd88f); }',
        '.dsh-mineru-settings-msg.err { color: var(--dsw-alias-error-primary, #f7768e); }',
        '.dsh-mineru-settings-pathrow { display: flex; gap: 8px; align-items: center; }',
        '.dsh-mineru-settings-pathrow input { flex: 1; min-width: 0; }',
        '.dsh-mineru-settings-pathrow button { flex: none; padding: 6px 10px; }',
        '.dsh-mineru-pick-btn { border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill, #243354); color: var(--dsw-alias-label-primary-foreground, #dbe4ff);',
        '  border-radius: 6px; font-size: 12px; padding: 6px 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-pick-btn:hover { background: var(--dsw-alias-button-primary-hover, #2c3f66); }',
        '.dsh-mineru-pick-btn:disabled { opacity: .6; cursor: default; }',
      ].join('\n')
      document.head.appendChild(style)
    }

    // ============================== 状态 ==============================
    var ui = {
      open: false,
      entries: [],
      currentId: null,
      iframe: null,
      selectedText: '',
      selectedDoc: null,
      selectedRange: null,
      quoteBtn: null,
      toastTimer: null,
      parseRunning: false,
      quotes: [],
      quoteSeq: 0,
    }

    var sessions = null
    var conversation = null
    var currentLang = 'zh'
    var itemMenuWrap = null
    var itemMenuDocClick = null
    var scrollSaveTimer = null

    function t(obj) {
      return currentLang === 'en' ? obj.en : obj.zh
    }

    function setLang(lang) {
      currentLang = lang === 'en' ? 'en' : 'zh'
    }

    // ============================== 工具函数 ==============================
    function el(tag, className, text) {
      var node = document.createElement(tag)
      if (className) node.className = className
      if (text !== undefined) node.textContent = text
      return node
    }

    function fetchJson(url, opts) {
      return fetch(url, opts).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {} }).then(function (body) {
            throw new Error((body && body.error) || ('HTTP ' + res.status))
          })
        }
        return res.json()
      })
    }

    function pickPath(mode) {
      return fetchJson('/mineru/api/pick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: mode }),
      }).then(function (data) {
        if (data && data.ok) return data.path
        throw new Error((data && data.error) || 'pick failed')
      })
    }

    function formatSize(n) {
      if (!n) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
      return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB'
    }

    function formatTime(iso) {
      try {
        var d = new Date(iso)
        var p = function (n) { return String(n).padStart(2, '0') }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
      } catch (_) {
        return String(iso || '')
      }
    }

    // ============================== DSH Settings 页 ==============================
    // The native DSH Settings page renders this section through the
    // `settings.section` slot. It reads/writes the same preferences as the
    // host via /mineru/api/settings.
    function SettingsInputField(props) {
      var input = React.createElement('input', {
        value: props.value,
        placeholder: props.placeholder || '',
        onChange: function (e) { props.onChange(e.target.value) },
      })
      if (!props.picker) {
        return React.createElement('label', null, props.label, input)
      }
      var pickBtn = React.createElement('button', {
        type: 'button',
        disabled: props.pickerBusy,
        onClick: props.onPick,
      }, props.pickerBusy ? t({ zh: '选择中…', en: 'Choosing…' }) : t({ zh: '选择…', en: 'Choose…' }))
      return React.createElement('label', null,
        props.label,
        React.createElement('span', { className: 'dsh-mineru-settings-pathrow' },
          input,
          pickBtn
        )
      )
    }

    function SettingsSelectField(props) {
      return React.createElement('label', null,
        props.label,
        React.createElement('select', {
          value: props.value,
          onChange: function (e) { props.onChange(e.target.value) },
        },
          props.options.map(function (option) {
            return React.createElement('option', { key: option, value: option }, option === '' ? '(auto)' : option)
          })
        )
      )
    }

    function SettingsSection() {
      var initial = React.useState({
        loading: true,
        value: null,
        revision: undefined,
        saving: false,
        pickBusy: '',
        message: '',
        error: '',
      })
      var snap = initial[0]
      var setSnap = initial[1]

      React.useEffect(function () {
        var cancelled = false
        fetchJson('/mineru/api/settings', { method: 'GET' })
          .then(function (data) {
            if (cancelled) return
            if (data && data.ok) {
              setSnap({
                loading: false,
                value: data.value || {},
                revision: data.revision,
                saving: false,
                message: '',
                error: '',
              })
            } else {
              setSnap({
                loading: false,
                value: null,
                revision: undefined,
                saving: false,
                message: '',
                error: (data && data.error) || 'load failed',
              })
            }
          })
          .catch(function (err) {
            if (!cancelled) {
              setSnap({
                loading: false,
                value: null,
                revision: undefined,
                saving: false,
                message: '',
                error: err.message,
              })
            }
          })
        return function () { cancelled = true }
      }, [])

      function fieldValue(key) {
        var raw = snap.value || {}
        return raw[key] === undefined || raw[key] === null ? '' : String(raw[key])
      }

      function patch(key, val) {
        var next = Object.assign({}, snap.value || {})
        next[key] = val
        setSnap(Object.assign({}, snap, { value: next, message: '', error: '' }))
      }

      function pickAndPatch(key, mode) {
        if (snap.pickBusy !== '') return
        setSnap(Object.assign({}, snap, { pickBusy: key, error: '' }))
        pickPath(mode)
          .then(function (picked) {
            if (picked !== null && picked !== '') {
              var next = Object.assign({}, snap.value || {})
              next[key] = picked
              setSnap(Object.assign({}, snap, {
                value: next,
                pickBusy: '',
                message: '',
                error: '',
              }))
            } else {
              setSnap(Object.assign({}, snap, { pickBusy: '' }))
            }
          })
          .catch(function (err) {
            setSnap(Object.assign({}, snap, {
              pickBusy: '',
              error: err.message,
            }))
          })
      }

      function save() {
        if (snap.saving) return
        setSnap(Object.assign({}, snap, { saving: true, message: '', error: '' }))
        fetchJson('/mineru/api/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            patch: snap.value || {},
            expectedRevision: snap.revision,
          }),
        })
          .then(function (data) {
            if (data && data.ok) {
              setSnap({
                loading: false,
                value: data.value || {},
                revision: data.revision,
                saving: false,
                message: t({ zh: '已保存', en: 'Saved' }),
                error: '',
              })
            } else {
              setSnap(Object.assign({}, snap, {
                saving: false,
                error: (data && data.error) || 'save failed',
              }))
            }
          })
          .catch(function (err) {
            setSnap(Object.assign({}, snap, { saving: false, error: err.message }))
          })
      }

      var children = [
        React.createElement('h2', null, t({ zh: 'MinerU 设置', en: 'MinerU Settings' })),
        React.createElement('p', null, t({
          zh: '配置解析产出的保存目录、索引路径、MinerU 可执行文件以及默认解析参数。保存后立即生效（无需重启）。',
          en: 'Configure the output directory, index path, MinerU binary and default parse options. Changes apply immediately (no restart needed).',
        })),
      ]

      if (snap.loading) {
        children.push(React.createElement('p', { key: 'loading' }, t({ zh: '加载中…', en: 'Loading…' })))
      } else {
        if (snap.error !== '') {
          children.push(React.createElement('p', { key: 'error', className: 'dsh-mineru-settings-msg err' }, snap.error))
        }
        children.push(
          React.createElement('div', { key: 'field-library', className: 'dsh-mineru-settings-row' },
            React.createElement(SettingsInputField, {
              label: t({ zh: '解析产出目录 (libraryRoot)', en: 'Output library root (libraryRoot)' }),
              value: fieldValue('libraryRoot'),
              placeholder: '~/Downloads/mineru-outputs',
              onChange: function (v) { patch('libraryRoot', v) },
              picker: true,
              pickerBusy: snap.pickBusy === 'libraryRoot',
              onPick: function () { pickAndPatch('libraryRoot', 'directory') },
            }),
            React.createElement(SettingsInputField, {
              label: t({ zh: '索引文件 (indexFile)', en: 'Index file (indexFile)' }),
              value: fieldValue('indexFile'),
              placeholder: '~/.dsh/mineru-library.json',
              onChange: function (v) { patch('indexFile', v) },
              picker: true,
              pickerBusy: snap.pickBusy === 'indexFile',
              onPick: function () { pickAndPatch('indexFile', 'file') },
            })
          ),
          React.createElement('div', { key: 'field-bin', className: 'dsh-mineru-settings-row' },
            React.createElement(SettingsInputField, {
              label: t({ zh: 'MinerU 可执行文件 (mineruBin)', en: 'MinerU binary (mineruBin)' }),
              value: fieldValue('mineruBin'),
              placeholder: '~/.local/bin/mineru',
              onChange: function (v) { patch('mineruBin', v) },
              picker: true,
              pickerBusy: snap.pickBusy === 'mineruBin',
              onPick: function () { pickAndPatch('mineruBin', 'file') },
            }),
            React.createElement(SettingsSelectField, {
              label: t({ zh: '默认 backend', en: 'Default backend' }),
              value: fieldValue('defaultBackend') || 'pipeline',
              options: ['pipeline', 'vlm-engine', 'hybrid-engine', 'vlm-http-client', 'hybrid-http-client'],
              onChange: function (v) { patch('defaultBackend', v) },
            })
          ),
          React.createElement('div', { key: 'field-3', className: 'dsh-mineru-settings-row' },
            React.createElement(SettingsSelectField, {
              label: t({ zh: '默认 method', en: 'Default method' }),
              value: fieldValue('defaultMethod') || 'auto',
              options: ['auto', 'txt', 'ocr'],
              onChange: function (v) { patch('defaultMethod', v) },
            }),
            React.createElement(SettingsSelectField, {
              label: t({ zh: '默认 effort', en: 'Default effort' }),
              value: fieldValue('defaultEffort') || '',
              options: ['', 'medium', 'high'],
              onChange: function (v) { patch('defaultEffort', v) },
            })
          ),
          React.createElement('div', { key: 'field-lang', className: 'dsh-mineru-settings-row' },
            React.createElement(SettingsInputField, {
              label: t({ zh: '默认语言 (lang，可空)', en: 'Default language (lang, optional)' }),
              value: fieldValue('defaultLang'),
              placeholder: 'ch',
              onChange: function (v) { patch('defaultLang', v) },
            })
          ),
          React.createElement('button', {
            key: 'save',
            disabled: snap.saving,
            onClick: save,
          }, snap.saving ? t({ zh: '保存中…', en: 'Saving…' }) : t({ zh: '保存设置', en: 'Save settings' }))
        )
      }

      if (snap.message !== '') {
        children.push(React.createElement('p', { key: 'message', className: 'dsh-mineru-settings-msg ok' }, snap.message))
      }

      return React.createElement('div', { className: 'dsh-mineru-settings' }, children)
    }

    function toast(msg) {
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) return
      var old = host.querySelector('.dsh-mineru-toast')
      if (old !== null) old.remove()
      var node = el('div', 'dsh-mineru-toast', msg)
      host.appendChild(node)
      ui.toastTimer = setTimeout(function () {
        node.classList.add('dsh-mineru-fade')
        setTimeout(function () { node.remove() }, 300)
      }, 2600)
    }

    function apiList() {
      return fetchJson('/mineru/api/list').then(function (data) {
        ui.entries = (data && data.entries) || []
        return ui.entries
      })
    }

    function getMineruFrame() {
      return document.querySelector('.dsh-mineru-frame')
    }

    function getFrameDoc(frame) {
      if (frame === null) return null
      try {
        return frame.contentDocument
      } catch (_) {
        return null
      }
    }

    function getScrollTop() {
      var frame = getMineruFrame()
      var doc = getFrameDoc(frame)
      if (doc === null) return 0
      var el = doc.scrollingElement || doc.documentElement || doc.body
      if (el === null) return 0
      return el.scrollTop || 0
    }

    function saveScrollPos(id, top) {
      if (!id || typeof top !== 'number' || !isFinite(top)) return
      try { localStorage.setItem('dsh-mineru-scroll:' + id, String(Math.max(0, Math.round(top)))) } catch (_) { /* ignore */ }
    }

    function loadScrollPos(id) {
      if (!id) return null
      try {
        var raw = localStorage.getItem('dsh-mineru-scroll:' + id)
        if (raw === null || raw === '') return null
        var n = parseFloat(raw)
        return isNaN(n) ? null : n
      } catch (_) { return null }
    }

    function saveLastDocId(id) {
      try {
        if (id) localStorage.setItem('dsh-mineru-current-doc', id)
        else localStorage.removeItem('dsh-mineru-current-doc')
      } catch (_) { /* ignore */ }
    }

    function loadLastDocId() {
      try { return localStorage.getItem('dsh-mineru-current-doc') || null } catch (_) { return null }
    }

    function saveCurrentScroll() {
      if (!ui.currentId) return
      saveScrollPos(ui.currentId, getScrollTop())
    }

    function scheduleSaveCurrentScroll() {
      if (scrollSaveTimer !== null) clearTimeout(scrollSaveTimer)
      scrollSaveTimer = setTimeout(function () {
        scrollSaveTimer = null
        saveCurrentScroll()
      }, 350)
    }

    function restoreScrollPosition(id) {
      if (!id) return
      var frame = getMineruFrame()
      var doc = getFrameDoc(frame)
      if (doc === null) return
      var top = loadScrollPos(id)
      if (top === null) return
      var apply = function () {
        if (ui.currentId !== id) return
        var win = null
        try { win = frame.contentWindow } catch (_) { win = null }
        if (win !== null) { try { win.scrollTo(0, top) } catch (_) { /* ignore */ } }
        var el = doc.scrollingElement || doc.documentElement || doc.body
        if (el !== null) { try { el.scrollTop = top } catch (_) { /* ignore */ } }
      }
      // Apply after load and a couple of reflow ticks (images/fonts can shift layout).
      apply()
      setTimeout(apply, 60)
      setTimeout(apply, 350)
    }

    function refreshList() {
      return apiList().then(function (entries) {
        renderList()
        var lastId = loadLastDocId()
        if (ui.currentId === null) {
          if (lastId !== null && entries.some(function (e) { return e.id === lastId })) {
            openDoc(lastId)
          } else if (entries.length > 0) {
            openDoc(entries[0].id)
          }
        } else if (!entries.some(function (e) { return e.id === ui.currentId })) {
          if (lastId !== null && entries.some(function (e) { return e.id === lastId })) {
            openDoc(lastId)
          } else if (entries.length > 0) {
            openDoc(entries[0].id)
          } else {
            clearPreview()
          }
        } else {
          var frame = getMineruFrame()
          var expected = '/mineru/preview/' + encodeURIComponent(ui.currentId)
          if (frame !== null && frame.getAttribute('src') !== expected) {
            // A freshly built panel starts with an empty iframe; make sure the
            // current/last document is actually loaded, not just listed.
            openDoc(ui.currentId)
          } else {
            renderPreviewBar()
          }
        }
      }).catch(function (err) {
        toast(t({ zh: '无法加载列表：' + err.message, en: 'Failed to load list: ' + err.message }))
      })
    }

    // ============================== 渲染 ==============================
    function renderList() {
      var listEl = document.querySelector('.dsh-mineru-list')
      if (listEl === null) return
      listEl.textContent = ''
      if (ui.entries.length === 0) {
        listEl.appendChild(el('div', 'dsh-mineru-empty', t({
          zh: '还没有解析记录。用上方输入框输入 PDF 路径，或让我（agent）调用 mineru_parse_pdf 工具。',
          en: 'No parsed documents yet. Type a PDF path above, or ask the agent to call mineru_parse_pdf.',
        })))
        return
      }
      ui.entries.forEach(function (entry) {
        var wrap = el('div', 'dsh-mineru-itemwrap')
        var item = el('button', 'dsh-mineru-item' + (entry.id === ui.currentId ? ' active' : ''))
        item.appendChild(el('div', 'dsh-mineru-item-title', entry.title || entry.id))
        var meta = [formatTime(entry.createdAt), formatSize(entry.sizes && entry.sizes.html)]
          .filter(Boolean).join(' · ')
        item.appendChild(el('div', 'dsh-mineru-item-meta', meta))
        item.addEventListener('click', function () { closeItemMenus(); openDoc(entry.id) })
        wrap.appendChild(item)
        var moreBtn = el('button', 'dsh-mineru-item-more', '⋯')
        moreBtn.setAttribute('title', t({ zh: '更多操作', en: 'More actions' }))
        moreBtn.addEventListener('click', function (e) {
          e.stopPropagation()
          toggleItemMenu(entry, wrap, moreBtn)
        })
        wrap.appendChild(moreBtn)
        listEl.appendChild(wrap)
      })
    }

    function closeItemMenus() {
      var menus = document.querySelectorAll('.dsh-mineru-item-menu.open')
      for (var i = 0; i < menus.length; i++) menus[i].classList.remove('open')
      var actives = document.querySelectorAll('.dsh-mineru-item-more.active')
      for (var j = 0; j < actives.length; j++) actives[j].classList.remove('active')
      if (itemMenuDocClick !== null) {
        document.removeEventListener('click', itemMenuDocClick)
        itemMenuDocClick = null
        itemMenuWrap = null
      }
    }

    function toggleItemMenu(entry, wrap, moreBtn) {
      var menu = wrap.querySelector('.dsh-mineru-item-menu')
      if (menu !== null && menu.classList.contains('open')) {
        closeItemMenus()
        return
      }
      closeItemMenus()
      if (menu === null) {
        menu = el('div', 'dsh-mineru-item-menu')
        var openNew = el('button', 'dsh-mineru-item-menu-item', t({ zh: '新窗口打开', en: 'Open in new tab' }))
        openNew.addEventListener('click', function () {
          closeItemMenus()
          window.open('/mineru/preview/' + encodeURIComponent(entry.id), '_blank')
        })
        menu.appendChild(openNew)
        if (entry.zip) {
          var download = el('button', 'dsh-mineru-item-menu-item', t({ zh: '下载 zip', en: 'Download zip' }))
          download.addEventListener('click', function () {
            closeItemMenus()
            window.open('/mineru/download/' + encodeURIComponent(entry.id), '_blank')
          })
          menu.appendChild(download)
        }
        var rename = el('button', 'dsh-mineru-item-menu-item', t({ zh: '重命名', en: 'Rename' }))
        rename.addEventListener('click', function () {
          closeItemMenus()
          var title = window.prompt(t({ zh: '输入新标题：', en: 'Enter new title:' }), entry.title || entry.id)
          if (title === null || title.trim() === '') return
          fetchJson('/mineru/api/rename', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: entry.id, title: title.trim() }),
          }).then(function () {
            toast(t({ zh: '已重命名', en: 'Renamed' }))
            return refreshList()
          }).catch(function (err) {
            toast(t({ zh: '重命名失败：' + err.message, en: 'Rename failed: ' + err.message }))
          })
        })
        menu.appendChild(rename)
        var remove = el('button', 'dsh-mineru-item-menu-item dsh-mineru-item-menu-danger', t({ zh: '删除', en: 'Delete' }))
        remove.addEventListener('click', function () {
          closeItemMenus()
          var ok = window.confirm(t({
            zh: '确定删除「' + (entry.title || entry.id) + '」吗？\n会同时删除该文档的输出目录。',
            en: 'Delete "' + (entry.title || entry.id) + '"?\nIts output directory will also be removed.',
          }))
          if (!ok) return
          fetchJson('/mineru/api/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: entry.id }),
          }).then(function () {
            if (ui.currentId === entry.id) clearPreview()
            toast(t({ zh: '已删除', en: 'Deleted' }))
            return refreshList()
          }).catch(function (err) {
            toast(t({ zh: '删除失败：' + err.message, en: 'Delete failed: ' + err.message }))
          })
        })
        menu.appendChild(remove)
        wrap.appendChild(menu)
      }
      menu.classList.add('open')
      moreBtn.classList.add('active')
      itemMenuWrap = wrap
      if (itemMenuDocClick === null) {
        itemMenuDocClick = function (e) {
          if (itemMenuWrap !== null && !itemMenuWrap.contains(e.target)) closeItemMenus()
        }
        document.addEventListener('click', itemMenuDocClick)
      }
    }

    function isSideCollapsed() {
      try { return localStorage.getItem('dsh-mineru-side-collapsed') === '1' } catch (_) { return false }
    }

    function applySideCollapsed(collapsed) {
      var side = document.querySelector('.dsh-mineru-side')
      var resizer = document.querySelector('.dsh-mineru-resizer')
      if (side !== null) side.style.display = collapsed ? 'none' : ''
      if (resizer !== null) resizer.style.display = collapsed ? 'none' : ''
      try { localStorage.setItem('dsh-mineru-side-collapsed', collapsed ? '1' : '0') } catch (_) { /* ignore */ }
    }

    function toggleSidebarCollapsed() {
      applySideCollapsed(!isSideCollapsed())
      renderPreviewBar()
    }

    function renderPreviewBar() {
      var bar = document.querySelector('.dsh-mineru-preview-bar')
      if (bar === null) return
      var entry = ui.entries.find(function (e) { return e.id === ui.currentId }) || null
      bar.textContent = ''
      var collapseBtn = el('button', 'dsh-mineru-btn dsh-mineru-collapse-btn', isSideCollapsed() ? '⟩' : '⟨')
      collapseBtn.title = isSideCollapsed()
        ? t({ zh: '显示文档列表', en: 'Show document list' })
        : t({ zh: '隐藏文档列表', en: 'Hide document list' })
      collapseBtn.addEventListener('click', toggleSidebarCollapsed)
      bar.appendChild(collapseBtn)
      var left = el('div', 'dsh-mineru-status')
      left.textContent = entry
        ? (entry.title + ' · ' + (entry.zip ? 'zip ' + formatSize(entry.sizes && entry.sizes.zip) : '') + ' · ' + (entry.html ? 'html ' + formatSize(entry.sizes && entry.sizes.html) : ''))
        : t({ zh: '未选择文档', en: 'No document selected' })
      bar.appendChild(left)
      var right = el('div', 'dsh-mineru-status')
      right.style.display = 'flex'
      right.style.gap = '8px'
      if (entry && entry.zip) {
        var dl = el('a', 'dsh-mineru-btn', t({ zh: '下载 zip', en: 'Download zip' }))
        dl.href = '/mineru/download/' + encodeURIComponent(entry.id)
        dl.style.textDecoration = 'none'
        dl.style.display = 'inline-flex'
        dl.style.alignItems = 'center'
        right.appendChild(dl)
      }
      if (entry && entry.html) {
        var openNew = el('a', 'dsh-mineru-btn', t({ zh: '新窗口打开', en: 'Open in new tab' }))
        openNew.href = '/mineru/preview/' + encodeURIComponent(entry.id)
        openNew.target = '_blank'
        openNew.style.textDecoration = 'none'
        openNew.style.display = 'inline-flex'
        openNew.style.alignItems = 'center'
        right.appendChild(openNew)
      }
      bar.appendChild(right)
    }

    function clearPreview() {
      ui.currentId = null
      var frame = document.querySelector('.dsh-mineru-frame')
      if (frame !== null) frame.src = 'about:blank'
      renderPreviewBar()
    }

    function openDoc(id) {
      if (ui.currentId !== null && ui.currentId !== id) {
        // Save the previous document's scroll position before leaving it.
        saveCurrentScroll()
      }
      ui.currentId = id
      saveLastDocId(id)
      renderList()
      renderPreviewBar()
      var frame = getMineruFrame()
      if (frame === null) return
      frame.src = '/mineru/preview/' + encodeURIComponent(id)
    }

    function attachSelection() {
      var frame = document.querySelector('.dsh-mineru-frame')
      if (frame === null) return
      var doc
      try {
        doc = frame.contentDocument
      } catch (_) {
        doc = null
      }
      if (doc === null) return
      applyThemeToFrame(frame, doc)
      if (doc.__dshMineruSelectionAttached) return
      doc.__dshMineruSelectionAttached = true
      doc.addEventListener('mouseup', onSelection)
      doc.addEventListener('keyup', onSelection)
      doc.addEventListener('selectionchange', onSelection)
      doc.addEventListener('scroll', hideQuote, true)
      doc.addEventListener('scroll', scheduleSaveCurrentScroll, true)
    }

    function onSelection() {
      var frame = document.querySelector('.dsh-mineru-frame')
      if (frame === null) { hideQuote(); return }
      var doc
      try {
        doc = frame.contentDocument
      } catch (_) {
        doc = null
      }
      if (doc === null) { hideQuote(); return }
      var sel = doc.getSelection()
      if (sel === null || sel.rangeCount === 0 || sel.isCollapsed) {
        hideQuote()
        return
      }
      var text = sel.toString().replace(/\s+/g, ' ').trim()
      if (text.length === 0) { hideQuote(); return }
      ui.selectedText = text
      ui.selectedDoc = doc
      try { ui.selectedRange = sel.getRangeAt(0) } catch (_) { ui.selectedRange = null }
      var ifrRect = frame.getBoundingClientRect()
      try {
        var rect = sel.getRangeAt(0).getBoundingClientRect()
        var x = ifrRect.left + rect.left + Math.min(rect.width / 2, 120) - 70
        var y = ifrRect.top + rect.top - 38
        showQuoteBtn(Math.max(8, Math.min(x, window.innerWidth - 160)), Math.max(8, Math.min(y, window.innerHeight - 40)))
      } catch (_) {
        showQuoteBtn(ifrRect.left + 12, ifrRect.top + 46)
      }
    }

    function showQuoteBtn(x, y) {
      var btn = ui.quoteBtn
      if (btn === null) return
      btn.style.display = 'block'
      btn.style.left = x + 'px'
      btn.style.top = y + 'px'
    }

    function hideQuote() {
      if (ui.quoteBtn !== null) ui.quoteBtn.style.display = 'none'
      ui.selectedText = ''
      ui.selectedDoc = null
      ui.selectedRange = null
    }

    function readCssVar(name) {
      try {
        // DSH's ThemePresenter writes token variables as inline styles on
        // <body>, so read from there first (documentElement only holds
        // `color-scheme`, not the alias token palette).
        var el = document.body || document.documentElement
        return getComputedStyle(el).getPropertyValue(name).trim()
      } catch (_) { return '' }
    }

    function applyThemeToFrame(frame, doc) {
      if (frame === null || doc === null) return
      try {
        var bg = readCssVar('--dsw-alias-bg-layer-1') || 'var(--dsw-alias-bg-layer-1, #0c0f16)'
        var bg2 = readCssVar('--dsw-alias-bg-layer-2') || 'var(--dsw-alias-bg-layer-2, #141822)'
        var bg3 = readCssVar('--dsw-alias-bg-layer-3') || 'var(--dsw-alias-bg-layer-3, #1a1f2b)'
        var label = readCssVar('--dsw-alias-label-primary') || 'var(--dsw-alias-label-primary, #d8dee9)'
        var label2 = readCssVar('--dsw-alias-label-secondary') || 'var(--dsw-alias-label-secondary, #c0caf5)'
        var label3 = readCssVar('--dsw-alias-label-tertiary') || 'var(--dsw-alias-label-tertiary, #8b93a7)'
        var border = readCssVar('--dsw-alias-border-l2') || 'var(--dsw-alias-border-l2, #2a3040)'
        var accent = readCssVar('--dsw-alias-text-accent') || readCssVar('--dsw-alias-accent') || 'var(--dsw-alias-text-accent, #7aa2f7)'
        var font = readCssVar('--dsw-font-family') || 'system-ui'
        var style = doc.getElementById('dsh-mineru-theme-style')
        if (style === null) {
          style = doc.createElement('style')
          style.id = 'dsh-mineru-theme-style'
          ;(doc.head || doc.documentElement).appendChild(style)
        }
        style.textContent = [
          ':root { color-scheme: dark; --dsh-bg:' + bg + '; --dsh-bg2:' + bg2 + '; --dsh-bg3:' + bg3 + ';',
          '  --dsh-label:' + label + '; --dsh-label2:' + label2 + '; --dsh-label3:' + label3 + ';',
          '  --dsh-border:' + border + '; --dsh-accent:' + accent + '; --dsh-font:' + font + '; }',
          'html, body { font-family: var(--dsh-font); background: var(--dsh-bg); color: var(--dsh-label); }',
          'body { margin: 0; padding: 1.25rem 1.5rem; line-height: 1.7; }',
          'h1, h2, h3, h4, h5, h6 { color: var(--dsh-label); border-color: var(--dsh-border); }',
          'a { color: var(--dsh-accent); }',
          'blockquote { color: var(--dsh-label2); border-left-color: var(--dsh-accent); background: var(--dsh-bg2); }',
          'code, pre { background: var(--dsh-bg3); color: var(--dsh-label2); border-color: var(--dsh-border); }',
          'table { border-collapse: collapse; border: 1px solid var(--dsh-border); width: 100%; }',
          'th, td { border: 1px solid var(--dsh-border); padding: 6px 8px; text-align: left; vertical-align: top; }',
          'th { background: var(--dsh-bg2); font-weight: 600; }',
          'tr:nth-child(even) td { background: var(--dsh-bg2); }',
          'img { max-width: 100%; height: auto; }',
          'hr { border-color: var(--dsh-border); }',
        ].join('\n')
      } catch (_) { /* iframe may be cross-origin or mid-navigation */ }
    }

    function isHeadingElement(el) {
      return el !== null && el.nodeType === 1 && /^h[1-6]$/i.test(el.tagName || '')
    }

    function headingLevel(el) {
      return Number(el.tagName.charAt(1))
    }

    function headingText(el, max) {
      return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, max || 80)
    }

    // Return a human-readable section path for the selection. Unlike the old
    // ancestor-only walk, this also finds the nearest preceding headings, so
    // text selected inside a table/paragraph still gets the surrounding
    // chapter/section location (e.g. “第二节 > 四、主要会计数据和财务指标”).
    function selectionLocation(doc, range) {
      if (doc === null || range === null) return ''
      var start = range.startContainer
      var stack = []
      var walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (n) {
          return isHeadingElement(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        },
      })
      var n
      while ((n = walker.nextNode())) {
        var containsStart = n === start || n.contains(start)
        var beforeStart = false
        if (!containsStart) {
          var rel = n.compareDocumentPosition(start)
          beforeStart = (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          if (!beforeStart) break
        }
        var level = headingLevel(n)
        while (stack.length > 0 && headingLevel(stack[stack.length - 1]) >= level) stack.pop()
        stack.push(n)
      }
      var path = []
      while (stack.length > 0) {
        var h = stack.pop()
        var text = headingText(h, 80)
        if (text !== '') path.unshift(text)
      }
      return path.join(' > ').slice(0, 260)
    }

    // Nearest heading that contains or immediately precedes the selection.
    // Returns the HTML id when available (pandoc headings usually have ids),
    // otherwise a slug generated from the heading text.
    function selectionAnchor(doc, range) {
      if (doc === null || range === null) return ''
      var start = range.startContainer
      var best = null
      var stack = []
      var walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (n) {
          return isHeadingElement(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        },
      })
      var n
      while ((n = walker.nextNode())) {
        var containsStart = n === start || n.contains(start)
        var beforeStart = false
        if (!containsStart) {
          var rel = n.compareDocumentPosition(start)
          beforeStart = (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          if (!beforeStart) break
        }
        best = n
        if (!containsStart) {
          var level = headingLevel(n)
          while (stack.length > 0 && headingLevel(stack[stack.length - 1]) >= level) stack.pop()
          stack.push(n)
        }
      }
      if (best === null) return ''
      var id = best.getAttribute('id') || ''
      if (id !== '') return id
      var text = headingText(best, 80)
      var slug = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
      if (slug !== '') return slug
      return 'sec-' + Math.abs(headingText(best, 80).length || 0)
    }

    function collectSelectionImages(doc, range) {
      if (doc === null || range === null) return []
      var node = range.commonAncestorContainer
      var rootEl = node.nodeType === 1 ? node : node.parentElement
      if (rootEl === null || typeof rootEl.querySelectorAll !== 'function') return []
      var imgs = rootEl.querySelectorAll('img')
      var out = []
      for (var i = 0; i < imgs.length && out.length < 3; i++) {
        var img = imgs[i]
        var alt = (img.getAttribute('alt') || '').trim()
        out.push({
          alt: alt.length > 0 ? alt : null,
          data: (img.getAttribute('src') || '').indexOf('data:') === 0,
        })
      }
      return out
    }

    function notifyQuoteDock() {
      try {
        window.dispatchEvent(new window.CustomEvent('dsh-mineru-quotes-changed'))
      } catch (_) { /* cross-frame strictness */ }
    }

    function buildQuoteBlock(quotes) {
      if (quotes === null || quotes.length === 0) return ''
      var first = quotes[0]
      var entry = (first && first.entry) || {}
      var lines = []
      lines.push(t({
        zh: '【MinerU 引用 · 文档：' + (entry.title || entry.id || '') + '】',
        en: '【MinerU quote · Document: ' + (entry.title || entry.id || '') + '】',
      }))
      lines.push(t({ zh: '文档 ID：' + (entry.id || '未知'), en: 'Document ID: ' + (entry.id || 'unknown') }))
      lines.push(t({ zh: 'PDF 路径：' + (entry.pdf || '未知'), en: 'PDF path: ' + (entry.pdf || 'unknown') }))
      lines.push(t({ zh: 'HTML 文件：' + (entry.html || '未知'), en: 'HTML file: ' + (entry.html || 'unknown') }))
      lines.push(t({ zh: 'ZIP 文件：' + (entry.zip || '未知'), en: 'ZIP file: ' + (entry.zip || 'unknown') }))
      lines.push(t({ zh: '预览链接：/mineru/preview/' + encodeURIComponent(entry.id || ''), en: 'Preview link: /mineru/preview/' + encodeURIComponent(entry.id || '') }))
      quotes.forEach(function (q, i) {
        lines.push('')
        lines.push(t({ zh: '【引用 ' + (i + 1) + '】', en: '【Quote ' + (i + 1) + '】' }))
        if (q.location !== undefined && q.location !== '') {
          lines.push(t({ zh: '位置：' + q.location, en: 'Location: ' + q.location }))
        }
        if (q.anchor !== undefined && q.anchor !== '') {
          var htmlLoc = '/mineru/preview/' + encodeURIComponent(entry.id || '') + '#' + encodeURIComponent(q.anchor)
          lines.push(t({
            zh: 'HTML 位置：' + htmlLoc + '（锚点 #' + q.anchor + '）',
            en: 'HTML location: ' + htmlLoc + ' (anchor #' + q.anchor + ')',
          }))
        }
        if (q.images !== undefined && q.images.length > 0) {
          var parts = q.images.map(function (im) {
            if (im.alt) return 'alt=' + im.alt
            return im.data ? t({ zh: '内嵌图片', en: 'embedded image' }) : t({ zh: '图片', en: 'image' })
          }).join(', ')
          lines.push(t({ zh: '图片：' + q.images.length + ' 张（' + parts + '）', en: 'Images: ' + q.images.length + ' (' + parts + ')' }))
        }
        lines.push(t({ zh: '内容：', en: 'Content:' }))
        lines.push('> ' + q.text.replace(/\n+/g, '\n> '))
      })
      lines.push('')
      lines.push(t({
        zh: '请结合这份 MinerU 解析文档来回答我的问题；如果需要，可读取上面的 HTML/PDF 路径或打开预览链接核对原文。',
        en: 'Please answer using this MinerU parsed document; you can read the HTML/PDF paths above or open the preview link to verify the source.',
      }))
      return lines.join('\n')
    }

    function hasQuoteBlock(draft) {
      return typeof draft === 'string' && draft.indexOf('【MinerU 引用') !== -1
    }

    function addQuoteFromSelection() {
      var text = ui.selectedText
      if (text === '') return
      try {
        var entry = ui.entries.find(function (e) { return e.id === ui.currentId }) || null
        if (entry === null) {
          toast(t({ zh: '未找到当前文档信息', en: 'Current document info not found' }))
          return
        }
        var quote = {
          id: 'q' + (++ui.quoteSeq),
          entry: {
            id: entry.id,
            title: entry.title,
            pdf: entry.pdf,
            html: entry.html,
            zip: entry.zip,
          },
          text: text,
          location: selectionLocation(ui.selectedDoc, ui.selectedRange),
          anchor: selectionAnchor(ui.selectedDoc, ui.selectedRange),
          images: collectSelectionImages(ui.selectedDoc, ui.selectedRange),
        }
        ui.quotes.push(quote)
        notifyQuoteDock()
        toast(t({ zh: '已加入引用列表，发送时自动附带', en: 'Quote added; it will be attached when sending' }))
        hideQuote()
        // Patch the current shell so clicking the send button (not just Enter)
        // also attaches the quotes.
        patchCurrentShell()
      } catch (err) {
        toast(t({ zh: '引用失败：' + err.message, en: 'Quote failed: ' + err.message }))
      }
    }

    function removeQuote(id) {
      ui.quotes = ui.quotes.filter(function (q) { return q.id !== id })
      notifyQuoteDock()
    }

    function clearQuotes() {
      ui.quotes = []
      notifyQuoteDock()
    }

    function currentShell() {
      try {
        var current = sessions.list.getSnapshot().current
        if (current === undefined) return null
        var scoped = sessions.scope(current)
        if (scoped === undefined) return null
        return conversation.input.for(scoped)
      } catch (_) {
        return null
      }
    }

    function patchShellSubmit(shell) {
      if (shell === null || shell === undefined) return
      if (typeof shell.submit !== 'function') return
      if (shell.__dshMineruSubmitPatched === true) return
      shell.__dshMineruSubmitPatched = true
      var original = shell.submit
      shell.submit = function (mode) {
        var shouldClearAfterSend = false
        try {
          // Attach any pending MinerU quotes just before DSH's submit reads the
          // draft. This covers both the Enter path and the send button (the
          // composer button calls inputActions.submit() -> shell.submit()).
          if (ui.quotes.length > 0) {
            var st = shell.state.getSnapshot()
            var draft = (st && st.draft) || ''
            if (hasQuoteBlock(draft)) {
              // Already spliced by the Enter keydown handler; this submit will send it.
              shouldClearAfterSend = true
            } else if (draft.trimStart().charAt(0) !== '/') {
              var block = buildQuoteBlock(ui.quotes)
              if (block !== '') {
                shell.setDraft(draft.trim() === '' ? block : block + '\n' + draft)
                shouldClearAfterSend = true
              }
            }
          }
        } catch (err) {
          console.warn('[dsh-mineru] quote submit attach failed:', err)
        }
        var result
        try {
          result = original.call(this, mode)
        } finally {
          // DSH clears the draft as a send-commit for plain messages before
          // submit() returns. If the draft is empty and we actually sent a
          // MinerU quote block, remove it from the dock so it is not sent a
          // second time.
          try {
            var after = shell.state.getSnapshot()
            if (shouldClearAfterSend && after !== null && after !== undefined && after.draft === '' && ui.quotes.length > 0) {
              clearQuotes()
            }
          } catch (_) { /* ignore */ }
        }
        return result
      }
    }

    function patchCurrentShell() {
      patchShellSubmit(currentShell())
    }

    function attachQuoteSubmit() {
      function onKeyDown(e) {
        if (e.key !== 'Enter' || e.shiftKey || e.altKey) return
        if (ui.quotes.length === 0) return
        var ta = e.target
        if (!(ta instanceof HTMLTextAreaElement) || ta.closest === null || ta.closest('[data-composer-card]') === null) return
        if (ta.composing === true || e.keyCode === 229) return
        try {
          var current = sessions.list.getSnapshot().current
          if (current === undefined) return
          var scoped = sessions.scope(current)
          if (scoped === undefined) return
          var shell = conversation.input.for(scoped)
          patchShellSubmit(shell)
          var st = shell.state.getSnapshot()
          var draft = (st && st.draft) || ''
          if (hasQuoteBlock(draft)) return
          if (draft.trimStart().charAt(0) === '/') return
          var block = buildQuoteBlock(ui.quotes)
          if (block === '') return
          shell.setDraft(draft.trim() === '' ? block : block + '\n' + draft)
        } catch (err) {
          console.warn('[dsh-mineru] quote attach failed:', err)
        }
      }
      document.addEventListener('keydown', onKeyDown, true)
      return function () {
        document.removeEventListener('keydown', onKeyDown, true)
      }
    }

    function setParseProgressVisible(visible) {
      var prog = document.querySelector('.dsh-mineru-progress')
      if (prog !== null) {
        if (visible) prog.classList.add('visible')
        else prog.classList.remove('visible')
      }
    }

    function updateParseProgress(job) {
      if (!job) return
      var prog = document.querySelector('.dsh-mineru-progress')
      if (prog !== null) {
        prog.classList.add('visible')
        var label = prog.querySelector('.dsh-mineru-progress-label')
        var fill = prog.querySelector('.dsh-mineru-progress-fill')
        var percent = Math.max(0, Math.min(100, Number(job.percent) || 0))
        if (label !== null) {
          label.textContent = (job.message || job.stage || '解析中') + ' · ' + percent + '%'
        }
        if (fill !== null) {
          fill.style.width = percent + '%'
          if (job.status === 'error') fill.style.background = 'var(--dsw-alias-error-primary, #f7768e)'
          else if (job.status === 'done') fill.style.background = 'var(--dsw-alias-state-success-primary, #7bd88f)'
          else fill.style.background = 'linear-gradient(90deg, var(--dsw-alias-text-accent, #7aa2f7), var(--dsw-alias-button-primary-fill, #2b3a67))'
        }
      }
    }

    function pollParseJob(jobId) {
      return new Promise(function (resolve, reject) {
        var attempts = 0
        function tick() {
          attempts++
          fetchJson('/mineru/api/jobs/' + encodeURIComponent(jobId), {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
          }).then(function (data) {
            if (!data || !data.ok || !data.job) {
              throw new Error((data && data.error) || 'job not found')
            }
            var job = data.job
            updateParseProgress(job)
            if (job.status === 'done') {
              resolve(job.resultId || null)
              return
            }
            if (job.status === 'error') {
              reject(new Error(job.error || job.message || 'parse failed'))
              return
            }
            setTimeout(tick, 1000)
          }).catch(function (err) {
            if (attempts >= 30) {
              reject(new Error('轮询超时：' + err.message))
              return
            }
            setTimeout(tick, 1500)
          })
        }
        tick()
      })
    }

    function startParse() {
      var input = document.querySelector('.dsh-mineru-parse-input')
      if (input === null) return
      var pdf = input.value.trim()
      if (pdf === '') {
        toast(t({ zh: '请输入 PDF 路径', en: 'Please enter a PDF path' }))
        return
      }
      if (ui.parseRunning) return
      ui.parseRunning = true
      var btn = document.querySelector('.dsh-mineru-parse-btn')
      if (btn !== null) { btn.disabled = true; btn.textContent = t({ zh: '解析中…', en: 'Parsing…' }) }
      var statusEl = document.querySelector('.dsh-mineru-status')
      if (statusEl !== null) statusEl.textContent = t({ zh: 'MinerU 解析中，首次运行可能要下载模型…', en: 'MinerU parsing... first run may download models...' })
      setParseProgressVisible(true)
      updateParseProgress({ status: 'running', stage: 'starting', percent: 0, message: t({ zh: '启动任务…', en: 'Starting task...' }) })
      fetchJson('/mineru/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdf: pdf }),
      }).then(function (data) {
        if (!data || !data.ok || !data.job) {
          throw new Error((data && data.error) || 'parse failed')
        }
        return pollParseJob(data.job.id)
      }).then(function (entryId) {
        ui.parseRunning = false
        if (btn !== null) { btn.disabled = false; btn.textContent = t({ zh: '解析', en: 'Parse' }) }
        if (statusEl !== null) statusEl.textContent = ''
        if (entryId !== null) {
          toast(t({ zh: '解析完成：' + entryId, en: 'Parsed: ' + entryId }))
          return refreshList().then(function () {
            openDoc(entryId)
          })
        }
        return refreshList()
      }).then(function () {
        setParseProgressVisible(false)
      }).catch(function (err) {
        ui.parseRunning = false
        if (btn !== null) { btn.disabled = false; btn.textContent = t({ zh: '解析', en: 'Parse' }) }
        if (statusEl !== null) statusEl.textContent = ''
        setParseProgressVisible(false)
        toast(t({ zh: '解析失败：' + err.message, en: 'Parse failed: ' + err.message }))
      })
    }

    // ============================== 面板 ==============================
    function buildPanelBody(panel, embedded) {
      // header
      var head = el('div', 'dsh-mineru-head')
      panel.appendChild(head)
      head.appendChild(el('div', 'dsh-mineru-title', t({ zh: 'MinerU 文档解析', en: 'MinerU Document Parser' })))
      var sub = el('div', 'dsh-mineru-sub', t({ zh: 'PDF → Markdown(zip) → HTML 预览', en: 'PDF → Markdown(zip) → HTML preview' }))
      sub.style.maxWidth = '320px'
      head.appendChild(sub)
      var parseInput = el('input', 'dsh-mineru-input dsh-mineru-parse-input')
      parseInput.placeholder = t({ zh: 'PDF 绝对路径，如 ~/Downloads/foo.pdf', en: 'Absolute PDF path, e.g. ~/Downloads/foo.pdf' })
      parseInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') startParse()
      })
      head.appendChild(parseInput)
      var pickBtn = el('button', 'dsh-mineru-btn dsh-mineru-pick-btn', t({ zh: '选文件', en: 'Choose file' }))
      pickBtn.addEventListener('click', function () {
        if (ui.parseRunning) return
        pickBtn.disabled = true
        pickPath('file')
          .then(function (picked) {
            if (picked !== null && picked !== '') parseInput.value = picked
          })
          .catch(function (err) {
            toast(t({ zh: '选择文件失败：' + err.message, en: 'Pick file failed: ' + err.message }))
          })
          .finally(function () { pickBtn.disabled = false })
      })
      head.appendChild(pickBtn)
      var parseBtn = el('button', 'dsh-mineru-btn dsh-mineru-btn-primary dsh-mineru-parse-btn', t({ zh: '解析', en: 'Parse' }))
      parseBtn.addEventListener('click', startParse)
      head.appendChild(parseBtn)
      var refreshBtn = el('button', 'dsh-mineru-btn', t({ zh: '刷新', en: 'Refresh' }))
      refreshBtn.addEventListener('click', refreshList)
      head.appendChild(refreshBtn)
      if (!embedded) {
        var closeBtn = el('button', 'dsh-mineru-btn dsh-mineru-btn-close', '×')
        closeBtn.addEventListener('click', closeModal)
        head.appendChild(closeBtn)
      }

      // progress bar (hidden until a parse starts; shared by modal and sidebar)
      var progress = el('div', 'dsh-mineru-progress')
      var progressLabel = el('div', 'dsh-mineru-progress-label', '')
      var progressTrack = el('div', 'dsh-mineru-progress-track')
      var progressFill = el('div', 'dsh-mineru-progress-fill')
      progressTrack.appendChild(progressFill)
      progress.appendChild(progressLabel)
      progress.appendChild(progressTrack)
      panel.appendChild(progress)

      // body
      var body = el('div', 'dsh-mineru-body')
      panel.appendChild(body)
      var side = el('div', 'dsh-mineru-side')
      var list = el('div', 'dsh-mineru-list')
      side.appendChild(list)
      body.appendChild(side)

      // draggable divider between the document list and the HTML preview pane
      var resizer = el('div', 'dsh-mineru-resizer')
      resizer.title = t({ zh: '拖动调节预览宽度', en: 'Drag to resize preview width' })
      body.appendChild(resizer)

      var preview = el('div', 'dsh-mineru-preview')
      var bar = el('div', 'dsh-mineru-preview-bar')
      preview.appendChild(bar)
      var frame = el('iframe', 'dsh-mineru-frame')
      frame.setAttribute('sandbox', 'allow-same-origin allow-scripts')
      frame.addEventListener('load', function () {
        attachSelection()
        restoreScrollPosition(ui.currentId)
      })
      preview.appendChild(frame)
      body.appendChild(preview)

      // Restore the previous list/preview split width from localStorage.
      try {
        var savedWidth = parseInt(localStorage.getItem('dsh-mineru-side-width') || '280', 10)
        if (!isNaN(savedWidth) && savedWidth >= 140) side.style.width = savedWidth + 'px'
        if (localStorage.getItem('dsh-mineru-side-collapsed') === '1') {
          side.style.display = 'none'
          resizer.style.display = 'none'
        }
      } catch (_) { /* localStorage may be unavailable in strict contexts */ }

      // Drag-to-resize the HTML preview pane (the list pane width changes too).
      // Use pointer capture + disable iframe pointer-events while dragging so
      // the parent page keeps receiving pointermove even over the preview iframe.
      var dragging = false
      var startX = 0
      var startSideWidth = 0
      var activePointerId = null
      function onResizeMove(ev) {
        if (!dragging || ev.pointerId !== activePointerId) return
        var bodyWidth = body.clientWidth
        var minSide = Math.min(180, Math.max(120, bodyWidth - 280))
        var maxSide = Math.max(minSide, Math.min(520, bodyWidth - 220))
        var next = Math.max(minSide, Math.min(maxSide, startSideWidth + (ev.clientX - startX)))
        side.style.width = next + 'px'
        try { localStorage.setItem('dsh-mineru-side-width', String(Math.round(next))) } catch (_) { /* ignore */ }
      }
      function onResizeEnd(ev) {
        var pid = ev && ev.pointerId
        if (pid !== undefined && pid !== activePointerId) return
        dragging = false
        activePointerId = null
        resizer.classList.remove('dragging')
        resizer.removeEventListener('pointermove', onResizeMove)
        resizer.removeEventListener('pointerup', onResizeEnd)
        resizer.removeEventListener('pointercancel', onResizeEnd)
        resizer.removeEventListener('lostpointercapture', onResizeEnd)
        window.removeEventListener('pointermove', onResizeMove, true)
        window.removeEventListener('pointerup', onResizeEnd, true)
        window.removeEventListener('pointercancel', onResizeEnd, true)
        window.removeEventListener('blur', onResizeEnd)
      }
      resizer.addEventListener('pointerdown', function (e) {
        dragging = true
        activePointerId = e.pointerId
        startX = e.clientX
        startSideWidth = side.getBoundingClientRect().width
        resizer.classList.add('dragging')
        try { resizer.setPointerCapture(e.pointerId) } catch (_) { /* older browsers */ }
        resizer.addEventListener('pointermove', onResizeMove)
        resizer.addEventListener('pointerup', onResizeEnd)
        resizer.addEventListener('pointercancel', onResizeEnd)
        resizer.addEventListener('lostpointercapture', onResizeEnd)
        // Window-level capture fallback: if pointer capture fails or the
        // pointerup lands in an edge case, these still restore the iframe.
        window.addEventListener('pointermove', onResizeMove, true)
        window.addEventListener('pointerup', onResizeEnd, true)
        window.addEventListener('pointercancel', onResizeEnd, true)
        window.addEventListener('blur', onResizeEnd)
        e.preventDefault()
      })

      return { list: list, bar: bar, frame: frame }
    }

    function buildModal() {
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) return
      // Clear any stale modal/quote/toast nodes but keep the launcher button.
      var old = host.querySelectorAll('.dsh-mineru-overlay, .dsh-mineru-quotebtn, .dsh-mineru-toast')
      for (var i = 0; i < old.length; i++) old[i].remove()

      var overlay = el('div', 'dsh-mineru-overlay')
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal()
      })
      var panel = el('div', 'dsh-mineru-panel')
      overlay.appendChild(panel)
      buildPanelBody(panel, false)

      // quote button (float)
      var quoteBtn = el('button', 'dsh-mineru-quotebtn', t({ zh: '引用到对话', en: 'Quote to chat' }))
      quoteBtn.addEventListener('click', addQuoteFromSelection)
      ui.quoteBtn = quoteBtn
      host.appendChild(quoteBtn)

      host.appendChild(overlay)
    }

    function mountSidebarPanel(container) {
      // Clear any previous embedded MinerU UI inside this container.
      container.textContent = ''
      var panel = el('div', 'dsh-mineru-panel dsh-mineru-panel-embedded')
      container.appendChild(panel)
      buildPanelBody(panel, true)

      // Quote button floats at viewport level while the iframe is visible.
      var quoteBtn = el('button', 'dsh-mineru-quotebtn', t({ zh: '引用到对话', en: 'Quote to chat' }))
      quoteBtn.addEventListener('click', addQuoteFromSelection)
      ui.quoteBtn = quoteBtn
      document.body.appendChild(quoteBtn)

      refreshList()

      return function () {
        hideQuote()
        if (ui.quoteBtn === quoteBtn) ui.quoteBtn = null
        if (quoteBtn.parentNode !== null) quoteBtn.parentNode.removeChild(quoteBtn)
        saveCurrentScroll()
        var frame = container.querySelector('.dsh-mineru-frame')
        if (frame !== null) frame.src = 'about:blank'
        container.textContent = ''
      }
    }

    function QuotesDock() {
      var quoteState = React.useState(ui.quotes.slice())
      var quotes = quoteState[0]
      var setQuotes = quoteState[1]
      React.useEffect(function () {
        function onChange() { setQuotes(ui.quotes.slice()) }
        window.addEventListener('dsh-mineru-quotes-changed', onChange)
        return function () { window.removeEventListener('dsh-mineru-quotes-changed', onChange) }
      }, [])
      if (quotes.length === 0) return null
      var children = []
      children.push(React.createElement('div', { className: 'dsh-mineru-quote-dock-head' },
        React.createElement('span', { className: 'dsh-mineru-quote-dock-title' }, t({ zh: 'MinerU 引用', en: 'MinerU quotes' })),
        React.createElement('span', { className: 'dsh-mineru-quote-dock-count' }, '· ' + quotes.length),
        React.createElement('button', {
          className: 'dsh-mineru-quote-dock-clear',
          title: t({ zh: '清空引用', en: 'Clear quotes' }),
          onClick: clearQuotes,
        }, '×')
      ))
      children.push(React.createElement('ul', { className: 'dsh-mineru-quote-dock-list' },
        quotes.map(function (q) {
          return React.createElement('li', { key: q.id, className: 'dsh-mineru-quote-dock-item' },
            React.createElement('div', { className: 'dsh-mineru-quote-dock-item-title' }, (q.entry && q.entry.title) || q.entry.id || 'MinerU'),
            (q.location !== null && q.location !== undefined && q.location !== '')
              ? React.createElement('div', { className: 'dsh-mineru-quote-dock-item-loc' }, '📍 ' + q.location + (q.anchor ? ' · #' + q.anchor : ''))
              : null,
            React.createElement('div', { className: 'dsh-mineru-quote-dock-item-snippet' },
              q.text.length > 90 ? q.text.slice(0, 90) + '…' : q.text
            ),
            React.createElement('button', {
              className: 'dsh-mineru-quote-dock-item-remove',
              title: t({ zh: '移除引用', en: 'Remove quote' }),
              onClick: function () { removeQuote(q.id) },
            }, '×')
          )
        })
      ))
      return React.createElement('section', { className: 'dsh-mineru-quote-dock' }, children)
    }

    function MineruSidebarView() {
      var containerRef = React.useRef(null)
      React.useEffect(function () {
        var container = containerRef.current
        if (container === null) return undefined
        return mountSidebarPanel(container)
      }, [])
      return React.createElement('div', {
        className: 'dsh-mineru-sidebar-host',
        ref: containerRef,
      })
    }

    function openModal() {
      if (ui.open) return
      ui.open = true
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) return
      buildModal()
      refreshList()
    }

    function closeModal() {
      if (!ui.open) return
      ui.open = false
      saveCurrentScroll()
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) return
      hideQuote()
      // Keep the launcher button; remove only the modal overlay and the
      // floating quote button.
      var toRemove = host.querySelectorAll('.dsh-mineru-overlay, .dsh-mineru-quotebtn')
      for (var i = 0; i < toRemove.length; i++) toRemove[i].remove()
    }

    function hideLauncher() {
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) return
      var buttons = host.querySelectorAll('.dsh-mineru-launcher')
      for (var i = 0; i < buttons.length; i++) buttons[i].remove()
      if (host.querySelectorAll('*').length === 0) host.remove()
    }

    function mountLauncher() {
      var host = document.querySelector('[data-dsh-mineru]')
      if (host === null) {
        host = el('div')
        host.setAttribute('data-dsh-mineru', '')
        document.body.appendChild(host)
      }
      var btn = el('button', 'dsh-mineru-launcher', 'M')
      btn.title = 'MinerU'
      btn.addEventListener('click', function () {
        var bs = null
        try { bs = ctx.get('betterSidebar') } catch (_) { bs = null }
        if (bs !== null && bs !== undefined && typeof bs.openTab === 'function') {
          // Make sure the tab is registered even if the service appeared after
          // this plugin's apply() ran.
          maybeRegisterSidebar()
          if (sidebarRegistered) {
            // Pass a url seed: better-sidebar only auto-expands a collapsed panel for content opens (path/url); a plain type-only open would land in a collapsed sidebar invisible to the user.
            bs.openTab({ type: 'dsh-mineru:preview', title: 'MinerU', url: '/mineru/preview/' })
            hideLauncher()
          } else {
            console.warn('[dsh-mineru] betterSidebar service found but MinerU tab not registered; opening modal fallback')
            openModal()
          }
        } else {
          openModal()
        }
      })
      host.appendChild(btn)
      return function () {
        btn.remove()
        if (host.querySelectorAll('*').length === 0) host.remove()
      }
    }

    function applyLocale() {
      var next = 'zh'
      try {
        if (typeof ctx.locale !== 'undefined' && ctx.locale !== null && typeof ctx.locale.getSnapshot === 'function') {
          var snap = ctx.locale.getSnapshot()
          if (snap !== undefined && snap !== null && snap.active) next = String(snap.active)
        }
      } catch (_) { /* keep zh */ }
      if (next !== currentLang) {
        setLang(next)
        if (ui.open) {
          var open = ui.open
          closeModal()
          openModal()
        } else if (document.querySelector('.dsh-mineru-launcher') !== null) {
          document.querySelector('.dsh-mineru-launcher').title = next === 'en' ? 'MinerU' : 'MinerU'
        }
      }
    }

    // ============================== 入口 ==============================
    var ctx = null
    var localeUnsub = null
    var sidebarRegistered = false
    var sidebarTimer = null
    var sidebarDisposed = false
    var themeObserver = null

    function maybeRegisterSidebar() {
      if (sidebarRegistered || sidebarDisposed) return
      var bs = null
      try { bs = ctx.get('betterSidebar') } catch (_) { bs = null }
      if (bs !== null && bs !== undefined && typeof bs.registerTab === 'function') {
        try {
          ctx.effect(function () {
            return bs.registerTab({
              id: 'dsh-mineru:preview',
              title: function () { return t({ zh: 'MinerU', en: 'MinerU' }) },
              icon: function (size) {
                // Match the built-in sidebar icon style: 16px outline SVG,
                // currentColor, 1.5px stroke. A document frame with an 'M'
                // inside (MinerU: PDF -> Markdown -> HTML).
                var s = size || 16
                return React.createElement('svg', {
                  width: s,
                  height: s,
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  xmlns: 'http://www.w3.org/2000/svg',
                },
                  React.createElement('path', {
                    d: 'M3.5 1.5h6.5L13.5 5v9.5h-10z',
                    stroke: 'currentColor',
                    strokeWidth: 1.5,
                    strokeLinejoin: 'round',
                  }),
                  React.createElement('path', {
                    d: 'M9.5 1.5V5h4',
                    stroke: 'currentColor',
                    strokeWidth: 1.5,
                    strokeLinejoin: 'round',
                  }),
                  React.createElement('path', {
                    d: 'M5.6 10.5V6.2l2 2.4 2-2.4v4.3',
                    stroke: 'currentColor',
                    strokeWidth: 1.5,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  })
                )
              },
              order: 55,
              dedupeKey: function () { return 'dsh-mineru:preview' },
              component: function () { return React.createElement(MineruSidebarView) },
            })
          }, 'dsh-mineru: better-sidebar tab')
          sidebarRegistered = true
          hideLauncher()
          if (sidebarTimer !== null) {
            clearInterval(sidebarTimer)
            sidebarTimer = null
          }
          console.info('[dsh-mineru] betterSidebar MinerU tab registered')
        } catch (err) {
          // Registration failed (e.g. already registered or API mismatch);
          // keep the modal fallback alive.
          sidebarRegistered = false
          console.warn('[dsh-mineru] betterSidebar tab registration failed:', err)
        }
      }
    }

    function apply(core) {
      ctx = core
      sessions = ctx.sessions
      conversation = ctx.conversation

      ctx.effect(function () {
        return mountLauncher()
      }, 'dsh-mineru: launcher')

      var quoteSubmitCleanup = attachQuoteSubmit()

      function refreshFrameThemes() {
        var frames = document.querySelectorAll('.dsh-mineru-frame')
        for (var i = 0; i < frames.length; i++) {
          var frame = frames[i]
          var doc = null
          try { doc = frame.contentDocument } catch (_) { /* ignore */ }
          applyThemeToFrame(frame, doc)
        }
      }
      var themeObserver = new MutationObserver(refreshFrameThemes)
      try {
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
        })
        if (document.body !== null) {
          themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-ds-dark-theme', 'style', 'class'],
          })
        }
      } catch (_) {
        // Older browser or non-DOM target; the per-load apply still covers most cases.
      }

      // Native DSH Settings page section. `settings.section` is declared by the
      // DSH settings domain; the same pattern is used by dsh-better-sidebar.
      if (ctx.slots !== undefined && ctx.slots !== null) {
        ctx.effect(function () {
          return ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'dsh-mineru',
              order: 120,
              label: function () { return t({ zh: 'MinerU', en: 'MinerU' }) },
            }, SettingsSection)
          })
        }, 'dsh-mineru: settings.section')

        // Quote dock: mirrors the official TODO/plan strip above the composer.
        ctx.effect(function () {
          return ctx.slots.inject('conversation.input.dock', function () {
            return ctx.slots.register({
              name: 'conversation.input.dock',
              id: 'dsh-mineru-quotes',
              order: 10,
            }, QuotesDock)
          })
        }, 'dsh-mineru: quote dock')
      }

      // Better-sidebar tab: render the MinerU parser/preview in the sidebar so
      // the user can read the document while continuing to chat. If the
      // better-sidebar plugin is not installed we fall back to the modal.
      // We deliberately do NOT inject 'betterSidebar': the service is optional,
      // and `ctx.get()` lets us keep the modal fallback working. The retry loop
      // covers the case where the better-sidebar client loads after this plugin.
      maybeRegisterSidebar()
      if (!sidebarRegistered) {
        sidebarTimer = setInterval(maybeRegisterSidebar, 300)
        setTimeout(function () {
          if (sidebarTimer !== null) {
            clearInterval(sidebarTimer)
            sidebarTimer = null
          }
        }, 10000)
      }

      applyLocale()
      if (ctx.locale !== undefined && ctx.locale !== null && typeof ctx.locale.subscribe === 'function') {
        try {
          localeUnsub = ctx.locale.subscribe(applyLocale)
        } catch (_) {
          localeUnsub = null
        }
      }

      return function () {
        sidebarDisposed = true
        if (sidebarTimer !== null) clearInterval(sidebarTimer)
        if (typeof localeUnsub === 'function') localeUnsub()
        if (typeof quoteSubmitCleanup === 'function') quoteSubmitCleanup()
        if (themeObserver !== null) {
          try { themeObserver.disconnect() } catch (_) { /* ignore */ }
          themeObserver = null
        }
        var host = document.querySelector('[data-dsh-mineru]')
        if (host !== null) host.textContent = ''
      }
    }

    exports.name = 'dsh-mineru'
    exports.inject = ['sessions', 'conversation', 'locale', 'slots']
    exports.apply = apply

    return module.exports
  },
})
