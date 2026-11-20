(function () {
  'use strict';

  const SOURCE = 'mpwx-html-import';
  if (window.__MPWX_BRIDGE__) {
    window.postMessage({ source: SOURCE, type: 'ready' }, '*');
    return;
  }
  window.__MPWX_BRIDGE__ = true;

  function reply(requestId, result) {
    window.postMessage(Object.assign({ source: SOURCE, type: 'result', requestId: requestId }, result || {}), '*');
  }

  function readAuth() {
    const wx = window.wx || {};
    const bags = [wx.data, wx.cgiData, wx.commonData];
    const bag = {};
    bags.forEach((item) => {
      if (item && typeof item === 'object') Object.assign(bag, item);
    });
    let token = bag.t || bag.token || '';
    if (!token) token = new URLSearchParams(location.search).get('token') || '';
    return {
      token: token ? String(token) : '',
      ticket: bag.ticket ? String(bag.ticket) : '',
      ticketId: bag.ticket_id ? String(bag.ticket_id) : '',
      svrTime: bag.svr_time ? String(bag.svr_time) : ''
    };
  }

  function toBytes(buffer) {
    if (!buffer) return null;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
    if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return null;
  }

  function pickCdn(data) {
    const list = [data && data.cdn_url, data && data.url];
    for (let i = 0; i < list.length; i++) {
      if (typeof list[i] === 'string' && /^https?:\/\//i.test(list[i])) return list[i];
    }
    return '';
  }

  async function uploadInPage(msg) {
    const auth = readAuth();
    if (!auth.token) return { ok: false, error: '未获取到登录态，请刷新编辑页后重试' };
    const mime = String(msg.mime || 'image/png').split(';')[0];
    let filename = String(msg.filename || ('upload.' + (mime.split('/')[1] || 'png')));
    if (filename.length > 80) filename = filename.slice(-80);
    const bytes = toBytes(msg.buffer);
    if (!bytes || !bytes.length) return { ok: false, error: '图片内容为空' };

    const file = new File([bytes], filename, { type: mime });
    const fd = new FormData();
    fd.append('id', 'WU_FILE_' + Date.now());
    fd.append('name', file.name);
    fd.append('type', mime);
    fd.append('lastModifiedDate', new Date().toString());
    fd.append('size', String(file.size));
    fd.append('file', file);

    const params = new URLSearchParams({
      action: 'upload_material',
      f: 'json',
      scene: '8',
      writetype: 'doublewrite',
      groupid: '1',
      token: auth.token,
      lang: 'zh_CN',
      seq: String(Date.now()),
      t: String(Math.random())
    });
    if (auth.ticketId) params.set('ticket_id', auth.ticketId);
    if (auth.ticket) params.set('ticket', auth.ticket);
    if (auth.svrTime) params.set('svr_time', auth.svrTime);

    const resp = await fetch('/cgi-bin/filetransfer?' + params.toString(), {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    let data = null;
    try {
      data = await resp.json();
    } catch (err) {
      return { ok: false, error: '上传失败：返回无法解析' };
    }
    const cdn = pickCdn(data);
    if (data && data.base_resp && data.base_resp.ret === 0 && cdn) return { ok: true, cdnUrl: cdn };
    const reason = (data && data.base_resp && (data.base_resp.err_msg || data.base_resp.ret)) || ('HTTP ' + resp.status);
    return { ok: false, error: '上传失败：' + reason };
  }

  function collectDocs(doc, out) {
    out.push(doc);
    const frames = doc.querySelectorAll ? doc.querySelectorAll('iframe, frame') : [];
    Array.from(frames).forEach((frame) => {
      try {
        if (frame.contentDocument) collectDocs(frame.contentDocument, out);
      } catch (err) {
        /* 跨域 iframe 无法读取 */
      }
    });
    return out;
  }

  function queryEditors(root, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll('.ProseMirror, [contenteditable="true"]').forEach((el) => out.add(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) queryEditors(el.shadowRoot, out);
    });
    return out;
  }

  function isShown(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const view = el.ownerDocument.defaultView;
    const cs = view.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function isTitle(el) {
    const id = (el.id || '').toLowerCase();
    const cls = String(el.className || '').toLowerCase();
    const ph = (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '').toLowerCase();
    return id.indexOf('title') >= 0 || cls.indexOf('title') >= 0 || ph.indexOf('标题') >= 0;
  }

  function findEditor() {
    const found = [];
    collectDocs(document, []).forEach((doc) => {
      queryEditors(doc, new Set()).forEach((el) => found.push(el));
    });
    const visible = found.filter((el) => isShown(el) && !isTitle(el));
    const prose = visible.filter((el) => el.classList && el.classList.contains('ProseMirror'));
    const pool = prose.length ? prose : visible;
    pool.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return pool[0] || null;
  }

  function queryTitles(root, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll('textarea, input, [contenteditable="true"]').forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) queryTitles(el.shadowRoot, out);
    });
    return out;
  }

  function findTitle() {
    const found = [];
    collectDocs(document, []).forEach((doc) => queryTitles(doc, found));
    const visible = found.filter((el) => isShown(el) && isTitle(el));
    visible.sort((a, b) => {
      const aHit = (a.getAttribute('placeholder') || a.getAttribute('data-placeholder') || '').indexOf('标题') >= 0 ? 1 : 0;
      const bHit = (b.getAttribute('placeholder') || b.getAttribute('data-placeholder') || '').indexOf('标题') >= 0 ? 1 : 0;
      return bHit - aHit;
    });
    return visible[0] || null;
  }

  function writeTitle(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return false;
    const el = findTitle();
    if (!el) return false;
    const max = Number(el.getAttribute('maxlength'));
    if (max > 0 && value.length > max) value = value.slice(0, max);
    const view = el.ownerDocument.defaultView;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement : view.HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
    } else {
      el.textContent = value;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  }

function placeCaret(editor) {
  const doc = editor.ownerDocument;
  const view = doc.defaultView;
  try {
    editor.focus({ preventScroll: true });
  } catch (err) {
    editor.focus();
  }
    const selection = view.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) return;
    const range = doc.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function notify(editor) {
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML' }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertNode(editor, html) {
    const doc = editor.ownerDocument;
    const holder = doc.createElement('div');
    holder.innerHTML = html;
    const fragment = doc.createDocumentFragment();
    while (holder.firstChild) fragment.appendChild(holder.firstChild);
    const selection = doc.defaultView.getSelection();
    let block = null;
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      block = selection.anchorNode;
      while (block && block.parentNode !== editor) block = block.parentNode;
    }
    if (block && block.nextSibling) editor.insertBefore(fragment, block.nextSibling);
    else editor.appendChild(fragment);
  }

  function insertHtml(html, title) {
    const clean = sanitize(html).trim();
    if (!clean) return { ok: false, error: '没有可导入的内容' };
    const editor = findEditor();
    if (!editor) return { ok: false, error: '未找到正文编辑器' };

    const before = editor.innerHTML;
    try {
      placeCaret(editor);
      insertNode(editor, clean);
    } catch (err) {
      try {
        editor.insertAdjacentHTML('beforeend', clean);
      } catch (inner) {
        return { ok: false, error: '写入正文失败' };
      }
    }

    if (editor.innerHTML === before) return { ok: false, error: '写入正文失败' };
    notify(editor);
    const titleSet = writeTitle(title);
    return { ok: true, titleSet: titleSet };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE || !msg.requestId) return;
    if (msg.type === 'upload') {
      uploadInPage(msg).then((result) => reply(msg.requestId, result)).catch((err) => {
        reply(msg.requestId, { ok: false, error: (err && err.message) || '上传失败' });
      });
    } else if (msg.type === 'inject') {
      try {
        reply(msg.requestId, insertHtml(msg.html || '', msg.title || ''));
      } catch (err) {
        reply(msg.requestId, { ok: false, error: (err && err.message) || '写入正文失败' });
      }
    }
  });

  window.postMessage({ source: SOURCE, type: 'ready' }, '*');
})();
