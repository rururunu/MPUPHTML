(function () {
  'use strict';

  function cssSafe(value) {
    return String(value == null ? '' : value).replace(/[<>]|[{}]|expression\s*\(|url\s*\(/gi, '');
  }

  function create(options) {
    const sampleTheme = options.sampleTheme;
    const listeners = {};
    let openFlag = false;
    let busy = false;
    let lastFocus = null;
    let locked = false;
    let prevOverflow = '';
    let toastTimer = null;

    const host = document.createElement('div');
    host.id = 'mpwx-html-root';
    host.setAttribute('data-mpwx-root', '1');
    const pin = {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      margin: '0',
      padding: '0',
      border: 'none',
      background: 'transparent',
      'z-index': '2147483000',
      'pointer-events': 'none',
      display: 'none'
    };
    host.style.setProperty('all', 'initial', 'important');
    Object.keys(pin).forEach((key) => {
      if (key === 'all') return;
      host.style.setProperty(key, pin[key], 'important');
    });

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host { color-scheme: light; }',
      '.mask { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.6); pointer-events: auto; }',
      '.mask.show { display: flex; }',
      '.dialog { width: min(600px, calc(100vw - 48px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; background: #fff; color: #1a1b1c; border-radius: 8px; box-shadow: 0 1px 20px rgba(0,0,0,.1); font-family: var(--mp-font, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif); font-size: 14px; font-weight: 400; line-height: 1.6; overflow: hidden; }',
      '.dialog.drag { outline: 1px solid var(--mp-green, #07c160); }',
      '.hd { position: relative; padding: 24px 48px 0 32px; flex-shrink: 0; }',
      '.title { margin: 0; font-size: 16px; font-weight: 400; line-height: 22px; color: #1a1b1c; }',
      '.sub { margin: 8px 0 0; font-size: 14px; line-height: 22px; color: #7e8081; }',
      '.close { position: absolute; top: 20px; right: 20px; width: 24px; height: 24px; border: none; border-radius: 4px; background: transparent; color: #7e8081; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }',
      '.close:hover { background: #f2f2f2; color: #1a1b1c; }',
      '.bd { padding: 20px 32px 8px; overflow: auto; flex: 1; }',
      '.label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }',
      '.label { font-size: 14px; line-height: 22px; color: #1a1b1c; }',
      '.hint, .file-label, .summary, .warn { font-size: 14px; line-height: 22px; color: #7e8081; }',
      '.file-label { color: #7e8081; margin-top: 6px; }',
      '.warn { color: #fa9d3b; margin-top: 6px; }',
      '.hint { margin-top: 8px; color: #7e8081; }',
      'textarea { width: 100%; min-height: 168px; box-sizing: border-box; resize: vertical; border: 1px solid #e3e4e5; border-radius: 4px; padding: 8px 12px; font-family: inherit; font-size: 14px; line-height: 1.6; color: #1a1b1c; background: #fff; }',
      'textarea::placeholder { color: #b1b2b3; }',
      'textarea:focus { outline: none; border-color: var(--mp-green, #07c160); }',
      'textarea:disabled { background: #f7f7f7; color: #7e8081; }',
      '.section { margin-top: 22px; }',
      '.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }',
      '.section-actions { display: flex; gap: 12px; flex-wrap: wrap; }',
      '.section-actions .btn { min-width: 0; }',
      '.label-row + textarea { margin-top: 0; }',
      '.file-label, .warn { margin-bottom: 0; }',
      '.summary { margin-top: 12px; }',
      '.summary { margin: 8px 0 4px; color: #7e8081; font-size: 13px; }',
      '.row { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 0; border-bottom: 1px solid #f2f2f2; }',
      '.thumb { width: 36px; height: 36px; border-radius: 2px; object-fit: cover; background: #f2f2f2; flex-shrink: 0; }',
      '.thumb-empty { background: #f2f2f2 center / 16px no-repeat url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23b1b2b3%27 stroke-width=%271.6%27%3E%3Crect x=%273%27 y=%273%27 width=%2718%27 height=%2718%27 rx=%272%27/%3E%3Ccircle cx=%278.5%27 cy=%278.5%27 r=%271.5%27/%3E%3Cpath d=%27M21 15l-5-5-11 11%27/%3E%3C/svg%3E"); }',
      '.meta { flex: 1; min-width: 0; }',
      '.name { font-size: 14px; color: #1a1b1c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.path { margin-top: 2px; font-size: 12px; color: #b1b2b3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.status { flex-shrink: 0; font-size: 12px; }',
      '.status.missing { color: #fa9d3b; }',
      '.status.matched, .status.done { color: var(--mp-green); }',
      '.status.pending { color: #7e8081; }',
      '.status.uploading { color: #576b95; }',
      '.status.failed, .status.unsupported { color: #fa5151; }',
      '.row-actions { display: flex; gap: 12px; flex-shrink: 0; }',
      '.link { border: none; background: transparent; padding: 0; color: #576b95; font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }',
      '.link:hover { text-decoration: underline; }',
      '.link:disabled { color: #b1b2b3; text-decoration: none; cursor: default; }',
      '.upload { display: inline-flex; align-items: center; gap: 4px; }',
      '.upload svg { display: block; flex: 0 0 auto; }',
      '.check { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 14px; color: #1a1b1c; cursor: pointer; }',
      '.check input { width: 16px; height: 16px; margin: 0; accent-color: var(--mp-green); }',
      '.ft { display: flex; align-items: center; gap: 16px; padding: 16px 32px 24px; border-top: 1px solid #e7e7eb; flex-shrink: 0; }',
      '.ft-msg { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; color: #7e8081; }',
      '.ft-msg.error { color: #fa5151; }',
      '.ft-btns { display: flex; gap: 12px; flex-shrink: 0; }',
      '.btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: var(--mp-btn-h, 32px); min-width: var(--mp-btn-min, 80px); padding: var(--mp-btn-pad, 0 16px); border-radius: var(--mp-radius, 4px); font-family: var(--mp-btn-font, inherit); font-size: var(--mp-btn-size, 14px); font-weight: var(--mp-btn-weight, 400); letter-spacing: normal; box-shadow: var(--mp-btn-shadow, none); line-height: 1; cursor: pointer; white-space: nowrap; }',
      '.btn:focus { outline: none; }',
      '.btn-primary { background: var(--mp-green, #07c160); color: var(--mp-on, #fff); border: 1px solid var(--mp-green, #07c160); }',
      '.btn-primary:hover:not(:disabled) { background: #06ae56; border-color: #06ae56; }',
      '.btn-primary:disabled { background: #e7e7eb; border-color: #e7e7eb; color: #b1b2b3; cursor: not-allowed; }',
      '.btn-primary.is-busy:disabled { background: var(--mp-green, #07c160); border-color: var(--mp-green, #07c160); color: var(--mp-on, #fff); opacity: .85; cursor: progress; }',
      '.btn-default { background: var(--mp-sec-bg, #fff); color: var(--mp-sec-color, #1a1b1c); border: var(--mp-sec-border, 1px solid #e3e4e5); border-radius: var(--mp-sec-radius, var(--mp-radius, 4px)); font-weight: var(--mp-sec-weight, 400); box-shadow: var(--mp-sec-shadow, none); min-width: var(--mp-sec-min, var(--mp-btn-min, 80px)); }',
      '.btn-default:hover:not(:disabled) { background: #f2f2f2; }',
      '.btn-default:disabled { color: #b1b2b3; cursor: not-allowed; filter: none; }',
      '.spin { width: 12px; height: 12px; margin-right: 6px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: mpwx-spin .7s linear infinite; }',
      '@keyframes mpwx-spin { to { transform: rotate(360deg); } }',
      '.toast { position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%); display: none; max-width: 320px; padding: 20px 28px; background: #fff; color: #1a1b1c; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.15); font-family: var(--mp-font); font-size: 14px; line-height: 1.5; text-align: center; pointer-events: none; }',
      '.toast.show { display: block; }',
      '.file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }',
      '@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }'
    ].join('\n');

    const mask = document.createElement('div');
    mask.className = 'mask';
    mask.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'mpwx-title');

    dialog.innerHTML = [
      '<div class="hd">',
      '<h2 class="title" id="mpwx-title">导入 HTML</h2>',
      '<p class="sub">粘贴或上传 HTML，确认后写入正文。图片会先上传到微信素材库。</p>',
      '<button type="button" class="close" aria-label="关闭">',
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      '</button></div>',
      '<div class="bd">',
      '<div class="label-row"><span class="label">HTML</span><button type="button" class="link upload" data-act="upload-html"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 10.5V3.2M8 3.2 5.4 5.8M8 3.2l2.6 2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10.2v1.6A1.4 1.4 0 0 0 4.4 13.2h7.2A1.4 1.4 0 0 0 13 11.8v-1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>上传文件</span></button></div>',
      '<textarea spellcheck="false" placeholder="粘贴 HTML…"></textarea>',
      '<div class="file-label"></div>',
      '<div class="warn"></div>',
      '<p class="hint">光标在正文里时插入到光标处，否则追加到文末。也可以把 .html 或图片拖到这里。</p>',
      '<p class="summary"></p>',
      '<section class="section" data-sec="local">',
      '<div class="section-head"><span class="label">本地图片</span><div class="section-actions">',
      '<button type="button" class="btn btn-default" data-act="pick-files">选择同名图片</button>',
      '<button type="button" class="btn btn-default" data-act="pick-folder">选择文件夹</button>',
      '</div></div>',
      '<div class="rows" data-rows="local"></div>',
      '<label class="check"><input type="checkbox"><span>跳过未匹配的本地图片，导入时移除它们</span></label>',
      '</section>',
      '<section class="section" data-sec="auto">',
      '<div class="label">自动上传</div>',
      '<div class="rows" data-rows="auto"></div>',
      '</section>',
      '<section class="section" data-sec="other">',
      '<div class="label">其他资源</div>',
      '<div class="rows" data-rows="other"></div>',
      '</section>',
      '</div>',
      '<div class="ft">',
      '<div class="ft-msg"></div>',
      '<div class="ft-btns">',
      '<button type="button" class="btn btn-default" data-act="cancel">取消</button>',
      '<button type="button" class="btn btn-primary" data-act="import">导入到正文</button>',
      '</div></div>'
    ].join('');

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    mask.appendChild(dialog);
    shadow.appendChild(style);
    shadow.appendChild(mask);
    shadow.appendChild(toast);
    document.documentElement.appendChild(host);

    const textarea = dialog.querySelector('textarea');
    const fileLabel = dialog.querySelector('.file-label');
    const warnBox = dialog.querySelector('.warn');
    const summary = dialog.querySelector('.summary');
    const localSec = dialog.querySelector('[data-sec="local"]');
    const autoSec = dialog.querySelector('[data-sec="auto"]');
    const otherSec = dialog.querySelector('[data-sec="other"]');
    const check = dialog.querySelector('.check input');
    const foot = dialog.querySelector('.ft-msg');
    const importBtn = dialog.querySelector('[data-act="import"]');
    const cancelBtn = dialog.querySelector('[data-act="cancel"]');
    const uploadBtn = dialog.querySelector('[data-act="upload-html"]');
    const pickBtn = dialog.querySelector('[data-act="pick-files"]');
    const folderBtn = dialog.querySelector('[data-act="pick-folder"]');

    const htmlInput = fileInput();
    htmlInput.accept = '.html,.htm,text/html';
    const filesInput = fileInput();
    filesInput.accept = 'image/*';
    filesInput.multiple = true;
    const folderInput = fileInput();
    folderInput.multiple = true;
    folderInput.webkitdirectory = true;
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    const oneInput = fileInput();
    oneInput.accept = 'image/*';
    dialog.appendChild(htmlInput);
    dialog.appendChild(filesInput);
    dialog.appendChild(folderInput);
    dialog.appendChild(oneInput);

    function fileInput() {
      const input = document.createElement('input');
      input.type = 'file';
      input.className = 'file-input';
      input.tabIndex = -1;
      return input;
    }

    function on(name, fn) {
      (listeners[name] || (listeners[name] = [])).push(fn);
    }

    function emit(name, payload) {
      (listeners[name] || []).forEach((fn) => fn(payload));
    }

    function showHost() {
      host.style.setProperty('display', 'block', 'important');
    }

    function hideHost() {
      if (toast.classList.contains('show')) return;
      host.style.setProperty('display', 'none', 'important');
    }

    function lockScroll() {
      if (locked) return;
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      locked = true;
    }

    function unlockScroll() {
      if (!locked) return;
      document.body.style.overflow = prevOverflow;
      locked = false;
    }

    function applyTheme(theme) {
      const map = {
        '--mp-font': theme.fontFamily,
        '--mp-green': theme.green,
        '--mp-on': theme.onGreen,
        '--mp-radius': theme.radius,
        '--mp-btn-h': theme.btnHeight,
        '--mp-btn-weight': theme.btnWeight,
        '--mp-btn-size': theme.btnSize,
        '--mp-btn-font': theme.btnFont,
        '--mp-btn-shadow': theme.btnShadow,
        '--mp-btn-pad': theme.btnPad,
        '--mp-btn-min': theme.btnMin,
        '--mp-sec-bg': theme.secBg,
        '--mp-sec-color': theme.secColor,
        '--mp-sec-border': theme.secBorder,
        '--mp-sec-radius': theme.secRadius,
        '--mp-sec-weight': theme.secWeight,
        '--mp-sec-shadow': theme.secShadow,
        '--mp-sec-min': theme.secMin
      };
      Object.keys(map).forEach((key) => {
        host.style.setProperty(key, cssSafe(map[key] || ''), 'important');
      });
    }

    function open() {
      if (openFlag) return;
      try {
        applyTheme(sampleTheme());
      } catch (err) {
        /* 采样失败时沿用上一次或样式表默认值 */
      }
      lastFocus = document.activeElement;
      openFlag = true;
      mask.classList.add('show');
      showHost();
      lockScroll();
      setTimeout(() => textarea.focus(), 30);
    }

    function close() {
      if (!openFlag || busy) return;
      openFlag = false;
      mask.classList.remove('show');
      dialog.classList.remove('drag');
      unlockScroll();
      hideHost();
      if (lastFocus && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus(); } catch (err) { /* 焦点可能已不在文档中 */ }
      }
    }

    function choose(input, handler) {
      input.value = '';
      input.onchange = () => {
        const files = input.files ? Array.from(input.files) : [];
        if (files.length) handler(files);
      };
      input.click();
    }

    function renderRow(row) {
      const item = document.createElement('div');
      item.className = 'row';
      const img = document.createElement('img');
      img.className = 'thumb' + (row.thumb ? '' : ' thumb-empty');
      img.alt = '';
      if (row.thumb) {
        img.src = row.thumb;
        img.addEventListener('error', () => {
          img.removeAttribute('src');
          img.classList.add('thumb-empty');
        });
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = row.name || '';
      const path = document.createElement('div');
      path.className = 'path';
      path.textContent = row.detail || '';
      path.title = row.detail || '';
      meta.appendChild(name);
      meta.appendChild(path);
      const status = document.createElement('span');
      status.className = 'status ' + (row.status || '');
      status.textContent = row.statusText || '';
      item.appendChild(img);
      item.appendChild(meta);
      item.appendChild(status);
      if (row.showPick || row.canClear) {
        const actions = document.createElement('div');
        actions.className = 'row-actions';
        if (row.showPick) {
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'link';
          pick.textContent = '选择';
          pick.addEventListener('click', () => {
            choose(oneInput, (files) => emit('assign-one', { id: row.id, file: files[0] }));
          });
          actions.appendChild(pick);
        }
        if (row.canClear) {
          const clear = document.createElement('button');
          clear.type = 'button';
          clear.className = 'link';
          clear.textContent = '清除';
          clear.addEventListener('click', () => emit('clear-one', row.id));
          actions.appendChild(clear);
        }
        item.appendChild(actions);
      }
      return item;
    }

    function fill(container, rows) {
      container.replaceChildren();
      (rows || []).forEach((row) => container.appendChild(renderRow(row)));
    }

    function render(state) {
      busy = !!state.busy;
      textarea.disabled = busy;
      uploadBtn.disabled = busy;
      pickBtn.disabled = busy;
      folderBtn.disabled = busy;
      check.disabled = busy;
      cancelBtn.disabled = busy;
      fileLabel.textContent = state.fileLabel || '';
      warnBox.textContent = (state.warnings || []).join(' ');
      warnBox.style.display = state.warnings && state.warnings.length ? '' : 'none';
      summary.textContent = state.summary || '';
      localSec.style.display = state.localRows && state.localRows.length ? '' : 'none';
      autoSec.style.display = state.autoRows && state.autoRows.length ? '' : 'none';
      otherSec.style.display = state.otherRows && state.otherRows.length ? '' : 'none';
      localSec.querySelector('.check').style.display = state.showSkip ? '' : 'none';
      if (check.checked !== !!state.skip) check.checked = !!state.skip;
      fill(localSec.querySelector('[data-rows="local"]'), state.localRows);
      fill(autoSec.querySelector('[data-rows="auto"]'), state.autoRows);
      fill(otherSec.querySelector('[data-rows="other"]'), state.otherRows);
      foot.textContent = state.foot || '';
      foot.classList.toggle('error', !!state.footError);
      importBtn.classList.toggle('is-busy', busy);
      importBtn.disabled = busy || !state.canImport;
      importBtn.replaceChildren();
      if (busy) {
        const spin = document.createElement('span');
        spin.className = 'spin';
        importBtn.appendChild(spin);
      }
      importBtn.appendChild(document.createTextNode(state.primaryLabel || '导入到正文'));
      dialog.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function toastMessage(text) {
      toast.textContent = text;
      toast.classList.add('show');
      showHost();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        hideHost();
      }, 2600);
    }

    dialog.querySelector('.close').addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    mask.addEventListener('click', close);
    dialog.addEventListener('click', (event) => event.stopPropagation());
    importBtn.addEventListener('click', () => {
      if (!busy) emit('import');
    });
    uploadBtn.addEventListener('click', () => choose(htmlInput, (files) => emit('html-file', files[0])));
    pickBtn.addEventListener('click', () => choose(filesInput, (files) => emit('match-files', files)));
    folderBtn.addEventListener('click', () => choose(folderInput, (files) => emit('match-files', files)));
    check.addEventListener('change', () => emit('skip', check.checked));
    textarea.addEventListener('input', () => emit('html'));

    dialog.addEventListener('dragover', (event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      dialog.classList.add('drag');
    });
    dialog.addEventListener('dragleave', (event) => {
      if (!dialog.contains(event.relatedTarget)) dialog.classList.remove('drag');
    });
    dialog.addEventListener('drop', (event) => {
      event.preventDefault();
      dialog.classList.remove('drag');
      const files = Array.from(event.dataTransfer.files || []);
      if (!files.length || busy) return;
      if (files.length === 1 && /\.html?$/i.test(files[0].name)) emit('html-file', files[0]);
      else emit('match-files', files);
    });

    shadow.addEventListener('keydown', (event) => {
      if (!openFlag) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!busy) emit('import');
      }
    });

    return {
      on: on,
      open: open,
      close: close,
      toggle: () => { if (openFlag) close(); else open(); },
      isOpen: () => openFlag,
      render: render,
      getHtml: () => textarea.value,
      setHtml: (value) => { textarea.value = value; },
      getSkip: () => check.checked,
      toast: toastMessage
    };
  }

  globalThis.MpWxPanel = { create: create };
})();
