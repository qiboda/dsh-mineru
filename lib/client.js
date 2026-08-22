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
        '  display: flex; flex-direction: column; background: #10131a;',
        '  border: 1px solid #2a3040; border-radius: 12px; overflow: hidden;',
        '  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55); }',
        '.dsh-mineru-panel-embedded { width: 100%; height: 100%; border: 0; border-radius: 0;',
        '  box-shadow: none; }',
        '.dsh-mineru-sidebar-host { display: flex; flex-direction: column; width: 100%;',
        '  height: 100%; min-height: 0; background: #0c0f16; }',
        '.dsh-mineru-head { display: flex; align-items: center; gap: 10px;',
        '  padding: 10px 14px; border-bottom: 1px solid #232936; background: #141822; }',
        '.dsh-mineru-title { font-size: 14px; font-weight: 600; color: #9db7ff; white-space: nowrap; }',
        '.dsh-mineru-sub { font-size: 11px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-input { flex: 1 1 260px; min-width: 180px; background: #0c0f16;',
        '  border: 1px solid #2a3040; border-radius: 6px; color: #d8dee9;',
        '  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
        '  padding: 5px 8px; outline: none; }',
        '.dsh-mineru-input:focus { border-color: #7aa2f7; }',
        '.dsh-mineru-btn { border: 1px solid #2a3040; background: #1c2230; color: #c0caf5;',
        '  border-radius: 6px; font-size: 12px; padding: 5px 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-btn:hover { background: #242c3d; border-color: #7aa2f7; }',
        '.dsh-mineru-btn:disabled { opacity: 0.6; cursor: default; }',
        '.dsh-mineru-btn-primary { background: #2b3a67; border-color: #3a5091; color: #dbe4ff; }',
        '.dsh-mineru-btn-close { color: #f7768e; }',
        '.dsh-mineru-body { flex: 1; display: flex; min-height: 0; }',
        '.dsh-mineru-side { width: 280px; min-width: 220px; border-right: 1px solid #232936;',
        '  overflow-y: auto; background: #11141d; padding: 8px; }',
        '.dsh-mineru-item { display: block; width: 100%; text-align: left; padding: 8px 10px;',
        '  border: 1px solid transparent; border-radius: 8px; background: transparent;',
        '  color: #d8dee9; cursor: pointer; }',
        '.dsh-mineru-itemwrap { position: relative; display: flex; align-items: stretch;',
        '  gap: 2px; margin-bottom: 4px; }',
        '.dsh-mineru-itemwrap .dsh-mineru-item { flex: 1; min-width: 0; }',
        '.dsh-mineru-item-more { flex: none; width: 28px; border: 1px solid transparent;',
        '  border-radius: 8px; background: transparent; color: #8b93a7; cursor: pointer;',
        '  font-size: 14px; line-height: 1; }',
        '.dsh-mineru-item-more:hover, .dsh-mineru-item-more.active { background: #1f2740;',
        '  border-color: #3a5091; color: #dbe4ff; }',
        '.dsh-mineru-item-menu { position: absolute; right: 0; top: calc(100% + 2px); z-index: 20;',
        '  min-width: 150px; padding: 4px; display: none; background: #1c2230;',
        '  border: 1px solid #2a3040; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.5); }',
        '.dsh-mineru-item-menu.open { display: block; }',
        '.dsh-mineru-item-menu-item { display: block; width: 100%; text-align: left; padding: 6px 10px;',
        '  border: 0; border-radius: 6px; background: transparent; color: #d8dee9;',
        '  font-size: 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-item-menu-item:hover { background: #242c3d; }',
        '.dsh-mineru-item-menu-danger { color: #f7768e; }',
        '.dsh-mineru-item:hover { background: #1a1f2b; }',
        '.dsh-mineru-item.active { background: #1f2740; border-color: #3a5091; }',
        '.dsh-mineru-item-title { font-size: 12px; font-weight: 600; line-height: 1.35; margin-bottom: 3px; word-break: break-word; }',
        '.dsh-mineru-item-meta { font-size: 10px; color: #8b93a7; line-height: 1.4; }',
        '.dsh-mineru-empty { padding: 20px 10px; color: #6b7280; font-size: 12px; text-align: center; }',
        '.dsh-mineru-preview { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #0c0f16; position: relative; }',
        '.dsh-mineru-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px;',
        '  padding: 6px 10px; border-bottom: 1px solid #232936; background: #141822; }',
        '.dsh-mineru-status { font-size: 11px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-progress { display: none; padding: 6px 14px; border-bottom: 1px solid #232936;',
        '  background: #12161f; }',
        '.dsh-mineru-progress.visible { display: block; }',
        '.dsh-mineru-progress-track { height: 6px; border-radius: 3px; background: #1a1f2b; overflow: hidden; }',
        '.dsh-mineru-progress-fill { height: 100%; width: 0%;',
        '  background: linear-gradient(90deg, #7aa2f7, #2b3a67); transition: width .3s; }',
        '.dsh-mineru-progress-label { font-size: 11px; color: #8b93a7; margin-bottom: 4px;',
        '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.dsh-mineru-resizer { flex: none; width: 6px; cursor: col-resize; background: #232936;',
        '  border-left: 1px solid #2a3040; }',
        '.dsh-mineru-resizer:hover, .dsh-mineru-resizer.dragging { background: #3a5091; }',
        '.dsh-mineru-frame { flex: 1; width: 100%; border: 0; background: #fff; }',
        '.dsh-mineru-quotebtn { position: fixed; z-index: 1002; display: none; padding: 6px 12px;',
        '  border: 1px solid #3a5091; border-radius: 8px; background: #243354; color: #dbe4ff;',
        '  font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.5); }',
        '.dsh-mineru-quotebtn:hover { background: #2c3f66; }',
        '.dsh-mineru-quote-dock { box-sizing: border-box; flex: none; margin: 0 auto;',
        '  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));',
        '  max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));',
        '  font-family: var(--dsw-font-family, system-ui);',
        '  color: var(--dsw-alias-label-primary, #d8dee9); background: var(--dsw-specific-menu, #1c2230);',
        '  border: 1px solid var(--dsw-alias-border-inverted, #2a3040); border-radius: 10px;',
        '  padding: 6px 10px; }',
        '.dsh-mineru-quote-dock-head { display: flex; align-items: center; gap: 8px;',
        '  font-size: 12px; font-weight: 600; }',
        '.dsh-mineru-quote-dock-count { color: var(--dsw-alias-label-tertiary, #8b93a7); font-weight: 400; }',
        '.dsh-mineru-quote-dock-clear, .dsh-mineru-quote-dock-item-remove { border: 0; background: transparent;',
        '  color: var(--dsw-alias-label-tertiary, #8b93a7); cursor: pointer; font-size: 14px; line-height: 1;',
        '  padding: 2px 6px; border-radius: 6px; }',
        '.dsh-mineru-quote-dock-clear { margin-left: auto; }',
        '.dsh-mineru-quote-dock-clear:hover, .dsh-mineru-quote-dock-item-remove:hover { background: #242c3d; color: #f7768e; }',
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
        '  background: #1c2230; border: 1px solid #2a3040; color: #d8dee9; font-size: 12px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,.5); }',
        '.dsh-mineru-fade { opacity: 0; transition: opacity .25s; }',
        // Settings page (rendered inside the DSH Settings shell)
        '.dsh-mineru-settings { font-family: var(--dsw-font-family, system-ui); color: var(--dsw-alias-label-primary);',
        '  max-width: 640px; display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }',
        '.dsh-mineru-settings h2 { font-size: 16px; font-weight: 600; margin: 0; }',
        '.dsh-mineru-settings p { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin: 0; line-height: 1.55; }',
        '.dsh-mineru-settings label { display: flex; flex-direction: column; gap: 5px; font-size: 12px;',
        '  color: var(--dsw-alias-label-secondary); }',
        '.dsh-mineru-settings input, .dsh-mineru-settings select { background: var(--dsw-alias-bg-layer-1, #1c2230);',
        '  border: 1px solid var(--dsw-alias-border-inverted, #2a3040); border-radius: 6px; color: var(--dsw-alias-label-primary, #d8dee9);',
        '  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 6px 8px; outline: none; }',
        '.dsh-mineru-settings input:focus, .dsh-mineru-settings select:focus { border-color: #7aa2f7; }',
        '.dsh-mineru-settings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
        '.dsh-mineru-settings button { align-self: flex-start; border: 1px solid #3a5091; background: #243354;',
        '  color: #dbe4ff; border-radius: 6px; font-size: 12px; padding: 6px 16px; cursor: pointer; }',
        '.dsh-mineru-settings button:hover { background: #2c3f66; }',
        '.dsh-mineru-settings button:disabled { opacity: .6; cursor: default; }',
        '.dsh-mineru-settings-msg { font-size: 12px; }',
        '.dsh-mineru-settings-msg.ok { color: #7bd88f; }',
        '.dsh-mineru-settings-msg.err { color: #f7768e; }',
        '.dsh-mineru-settings-pathrow { display: flex; gap: 8px; align-items: center; }',
        '.dsh-mineru-settings-pathrow input { flex: 1; min-width: 0; }',
        '.dsh-mineru-settings-pathrow button { flex: none; padding: 6px 10px; }',
        '.dsh-mineru-pick-btn { border: 1px solid #3a5091; background: #243354; color: #dbe4ff;',
        '  border-radius: 6px; font-size: 12px; padding: 6px 12px; cursor: pointer; white-space: nowrap; }',
        '.dsh-mineru-pick-btn:hover { background: #2c3f66; }',
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

    function refreshList() {
      return apiList().then(function (entries) {
        renderList()
        if (ui.currentId === null && entries.length > 0) {
          openDoc(entries[0].id)
        } else if (ui.currentId !== null && !entries.some(function (e) { return e.id === ui.currentId })) {
          if (entries.length > 0) openDoc(entries[0].id)
          else clearPreview()
        } else {
          // keep current preview; just update meta bar
          renderPreviewBar()
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

    function renderPreviewBar() {
      var bar = document.querySelector('.dsh-mineru-preview-bar')
      if (bar === null) return
      var entry = ui.entries.find(function (e) { return e.id === ui.currentId }) || null
      bar.textContent = ''
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
      ui.currentId = id
      renderList()
      renderPreviewBar()
      var frame = document.querySelector('.dsh-mineru-frame')
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
      if (doc.__dshMineruSelectionAttached) return
      doc.__dshMineruSelectionAttached = true
      doc.addEventListener('mouseup', onSelection)
      doc.addEventListener('keyup', onSelection)
      doc.addEventListener('selectionchange', onSelection)
      doc.addEventListener('scroll', hideQuote, true)
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

    function selectionLocation(doc, range) {
      if (doc === null || range === null) return ''
      var node = range.commonAncestorContainer
      var el = node.nodeType === 3 ? node.parentElement : node.nodeType === 1 ? node : null
      if (el === null) return ''
      var headings = []
      var cur = el
      while (cur !== null && cur !== doc.body && cur !== doc.documentElement) {
        var tag = cur.tagName ? cur.tagName.toLowerCase() : ''
        if (/^h[1-6]$/.test(tag)) {
          var h = (cur.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
          if (h !== '') headings.unshift(h)
        }
        cur = cur.parentElement
      }
      return headings.join(' > ').slice(0, 220)
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
          images: collectSelectionImages(ui.selectedDoc, ui.selectedRange),
        }
        ui.quotes.push(quote)
        notifyQuoteDock()
        toast(t({ zh: '已加入引用列表，发送时自动附带', en: 'Quote added; it will be attached when sending' }))
        hideQuote()
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
          if (job.status === 'error') fill.style.background = '#f7768e'
          else if (job.status === 'done') fill.style.background = '#7bd88f'
          else fill.style.background = 'linear-gradient(90deg, #7aa2f7, #2b3a67)'
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
      })
      preview.appendChild(frame)
      body.appendChild(preview)

      // Restore the previous list/preview split width from localStorage.
      try {
        var savedWidth = parseInt(localStorage.getItem('dsh-mineru-side-width') || '280', 10)
        if (!isNaN(savedWidth) && savedWidth >= 140) side.style.width = savedWidth + 'px'
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
        frame.style.pointerEvents = ''
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
        frame.style.pointerEvents = 'none'
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
              ? React.createElement('div', { className: 'dsh-mineru-quote-dock-item-loc' }, '📍 ' + q.location)
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
