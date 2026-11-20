(function () {
  'use strict';

  const SOURCE = 'mpwx-html-import';
  const MAX_BYTES = 10 * 1024 * 1024;

  let panel = null;
  let started = false;
  let assets = [];
  let preparedHtml = '';
  let articleTitle = '';
  let warnings = [];
  let loadedName = '';
  let skipUnmatched = false;
  let busy = false;
  let busyLabel = '';
  let notice = '';
  let noticeError = false;
  let noticeTimer = null;
  let inputTimer = null;
  let mountTimer = null;
  let requestSeq = 0;

  let anchorBtn = null;
  let docEl = null;

  const IMPORT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8 6.2 4.4 12 8 17.8M16 6.2 19.6 12 16 17.8M13.3 5.2l-2.6 13.6"/></svg>';

  function visibleText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isShown(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function textHits(text) {
    const hits = [];
    function scan(root) {
      const doc = root.ownerDocument || document;
      let walker;
      try {
        walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      } catch (err) {
        return;
      }
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue ? node.nodeValue.replace(/\s+/g, ' ').trim() : '';
        if (value === text && node.parentElement) hits.push(node.parentElement);
        node = walker.nextNode();
      }
      if (!root.querySelectorAll) return;
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    }
    scan(document.body || document.documentElement);
    return hits;
  }

  function controlOf(el) {
    let best = el;
    let node = el;
    const label = visibleText(el);
    while (node && node.parentElement) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      const text = visibleText(parent);
      if (!text || text.length > 12 || text !== label) break;
      best = parent;
      node = parent;
    }
    return best;
  }

  function exact(text) {
    const seen = new Set();
    const list = [];
    textHits(text).forEach((el) => {
      if (el.closest && el.closest('[data-mpwx-import], #mpwx-html-root')) return;
      const control = controlOf(el);
      if (!control || seen.has(control) || !isShown(control)) return;
      if (control.closest && control.closest('[data-mpwx-import], #mpwx-html-root')) return;
      seen.add(control);
      list.push(control);
    });
    return list;
  }

  function paintable(el) {
    if (!el) return null;
    const inner = el.querySelector && el.querySelector('button, a, [role="button"]');
    if (inner && isShown(inner)) return inner;
    return el;
  }

  function isGreenish(color) {
    const match = String(color || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!match) return false;
    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    return green > 90 && green > red + 25 && green > blue + 15;
  }

  function styleOf(el) {
    if (!el) return null;
    const inner = el.matches('button, a') ? el : (el.querySelector('button, a') || el);
    return getComputedStyle(inner);
  }

  function pxOr(value, fallback) {
    if (!value || value === 'auto' || value === '0px') return fallback;
    return value;
  }

  function usableMin(value) {
    if (!value || value === 'auto' || value === '0px') return '80px';
    return value;
  }

  function solidBg(color, fallback) {
    if (!color || color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(color)) return fallback;
    return color;
  }

  function borderOf(style, fallback) {
    if (!style || style.borderTopStyle === 'none' || style.borderTopWidth === '0px') return fallback;
    return style.borderTopWidth + ' ' + style.borderTopStyle + ' ' + style.borderTopColor;
  }

  function findSave() {
    return exact('保存为草稿')[0] || exact('保存草稿')[0] || null;
  }

  function nearSave(text) {
    const save = findSave();
    const list = exact(text);
    if (!save) return list[0] || null;
    const anchor = paintable(save).getBoundingClientRect();
    let best = null;
    let bestDist = Infinity;
    list.forEach((el) => {
      const rect = paintable(el).getBoundingClientRect();
      if (Math.abs(rect.top + rect.height / 2 - (anchor.top + anchor.height / 2)) > anchor.height) return;
      const dist = Math.abs(rect.left - anchor.left);
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
      }
    });
    return best;
  }

  function sampleTheme() {
    const body = getComputedStyle(document.body);
    const primary = styleOf(findSave());
    const secondary = styleOf(nearSave('预览') || nearSave('发表'));
    const font = body.fontFamily || '"PingFang SC","Microsoft YaHei",sans-serif';
    return {
      fontFamily: font,
      green: primary && isGreenish(primary.backgroundColor) ? primary.backgroundColor : '#07c160',
      onGreen: primary && isGreenish(primary.backgroundColor) ? primary.color : '#ffffff',
      radius: (primary && primary.borderRadius) || '4px',
      btnHeight: pxOr(primary && primary.height, '32px'),
      btnWeight: (primary && primary.fontWeight) || '400',
      btnSize: (primary && primary.fontSize) || '14px',
      btnFont: (primary && primary.fontFamily) || font,
      btnShadow: (primary && primary.boxShadow) || 'none',
      btnPad: primary && parseFloat(primary.paddingLeft) >= 8 ? primary.padding : '0px 16px',
      btnMin: usableMin(primary && primary.minWidth),
      secBg: solidBg(secondary && secondary.backgroundColor, '#ffffff'),
      secColor: (secondary && secondary.color) || '#1a1b1c',
      secBorder: borderOf(secondary, '1px solid #e3e4e5'),
      secRadius: (secondary && secondary.borderRadius) || ((primary && primary.borderRadius) || '4px'),
      secWeight: (secondary && secondary.fontWeight) || '400',
      secShadow: (secondary && secondary.boxShadow) || 'none',
      secMin: usableMin(secondary && secondary.minWidth)
    };
  }

  function attrHits(text) {
    const names = ['title', 'aria-label', 'data-tooltip', 'data-title', 'data-original-title', 'data-name'];
    const hits = [];
    function scan(root) {
      if (!root.querySelectorAll) return;
      root.querySelectorAll('*').forEach((el) => {
        for (let i = 0; i < names.length; i++) {
          const value = el.getAttribute(names[i]);
          if (!value) continue;
          const clean = value.replace(/\s+/g, ' ').trim();
          if (clean === text || (clean.indexOf(text) === 0 && clean.length <= text.length + 6)) hits.push(el);
        }
        if (el.shadowRoot) scan(el.shadowRoot);
      });
    }
    scan(document.body || document.documentElement);
    return hits;
  }

  function iconControl(el) {
    let node = el;
    let best = el;
    while (node && node.parentElement && node !== document.body && node !== document.documentElement) {
      const rect = node.getBoundingClientRect();
      if (node.matches && node.matches('button, a, [role="button"]') && rect.width >= 16 && rect.height >= 16) return node;
      if (rect.width >= 24 && rect.height >= 24 && rect.width <= 88 && rect.height <= 64) best = node;
      const parent = node.parentElement;
      const parentRect = parent.getBoundingClientRect();
      if (rect.width >= 24 && parentRect.width > rect.width + 48) return best;
      node = parent;
    }
    return best;
  }

  function headerDocButton() {
    let best = null;
    let bestRight = -1;
    const nodes = document.querySelectorAll('button, a, [role="button"], div, span');
    nodes.forEach((el) => {
      if (!isShown(el)) return;
      if (el.closest && el.closest('[data-mpwx-import], #mpwx-html-root')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top > 96 || rect.left < window.innerWidth * 0.55) return;
      if (rect.width < 28 || rect.width > 56 || rect.height < 28 || rect.height > 56) return;
      if (Math.abs(rect.width - rect.height) > 12) return;
      const text = visibleText(el);
      if (text && text !== '文档导入') return;
      const img = el.querySelector && el.querySelector('img');
      if (img && img.getBoundingClientRect().width > 18) return;
      const graphic = el.querySelector && el.querySelector('svg, i, img, canvas');
      if (!graphic && !(el.matches && el.matches('button, a, [role="button"]'))) return;
      if (rect.right > bestRight) {
        best = el;
        bestRight = rect.right;
      }
    });
    return best;
  }

  function findDocImport() {
    const labeled = exact('文档导入')[0];
    if (labeled) return labeled;
    const attrs = attrHits('文档导入');
    for (let i = 0; i < attrs.length; i++) {
      const control = iconControl(attrs[i]);
      if (!control || !isShown(control)) continue;
      if (control.closest && control.closest('[data-mpwx-import], #mpwx-html-root')) continue;
      return control;
    }
    return headerDocButton();
  }

  function ensureButton() {
    if (anchorBtn && anchorBtn.isConnected) return anchorBtn;
    anchorBtn = document.createElement('button');
    anchorBtn.type = 'button';
    anchorBtn.setAttribute('data-mpwx-import', '1');
    anchorBtn.setAttribute('title', '导入 HTML');
    anchorBtn.setAttribute('aria-label', '导入 HTML');
    anchorBtn.innerHTML = IMPORT_ICON + '<span>导入</span>';
    let actedAt = 0;
    function activate(event) {
      event.preventDefault();
      event.stopPropagation();
      if (Date.now() - actedAt < 400) return;
      actedAt = Date.now();
      if (!panel) startEditor();
      if (panel) panel.toggle();
    }
    anchorBtn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      activate(event);
    });
    anchorBtn.addEventListener('click', activate);
    (document.body || document.documentElement).appendChild(anchorBtn);
    return anchorBtn;
  }

  function graphicOf(el) {
    if (!el.querySelector) return null;
    const nodes = el.querySelectorAll('svg, img, i, canvas');
    for (let i = 0; i < nodes.length; i++) {
      const rect = nodes[i].getBoundingClientRect();
      if (rect.width >= 10 && rect.height >= 10 && rect.width <= 32) return nodes[i];
    }
    return null;
  }

  function iconColor(el) {
    const graphic = graphicOf(el);
    const color = getComputedStyle(graphic || el).color;
    if (!color || color === 'rgba(0, 0, 0, 0)') return '#7e8081';
    return color;
  }

  function paintedBackground(el) {
    const own = getComputedStyle(el).backgroundColor;
    if (!/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(own) && own !== 'transparent') return own;
    const kids = el.children || [];
    for (let i = 0; i < kids.length; i++) {
      const color = getComputedStyle(kids[i]).backgroundColor;
      if (color && color !== 'transparent' && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(color)) return color;
    }
    return 'transparent';
  }

  function paintButton(from) {
    const style = getComputedStyle(from);
    const btn = anchorBtn;
    const bg = paintedBackground(from);
    btn.style.position = 'fixed';
    btn.style.zIndex = '2000';
    btn.style.pointerEvents = 'auto';
    btn.style.boxSizing = 'border-box';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '4px';
    btn.style.margin = '0';
    btn.style.cursor = 'pointer';
    btn.style.appearance = 'none';
    btn.style.overflow = 'hidden';
    btn.style.textDecoration = 'none';
    btn.style.whiteSpace = 'nowrap';
    btn.style.fontFamily = style.fontFamily;
    btn.style.fontSize = style.fontSize || '14px';
    btn.style.fontWeight = style.fontWeight || '400';
    btn.style.lineHeight = '1';
    btn.style.letterSpacing = style.letterSpacing;
    btn.style.color = iconColor(from);
    btn.style.backgroundColor = bg === 'transparent' ? '#f6f7f8' : bg;
    btn.style.borderStyle = style.borderTopStyle;
    btn.style.borderWidth = style.borderTopWidth;
    btn.style.borderColor = style.borderTopColor;
    btn.style.borderRadius = style.borderRadius && style.borderRadius !== '0px' ? style.borderRadius : '4px';
    btn.style.boxShadow = style.boxShadow;
    btn.style.padding = '0 12px';
    const graphic = graphicOf(from);
    const graphicRect = graphic ? graphic.getBoundingClientRect() : null;
    const side = graphicRect ? Math.max(graphicRect.width, graphicRect.height) : Math.round(Math.min(from.getBoundingClientRect().width, from.getBoundingClientRect().height) * 0.5);
    const svg = btn.querySelector('svg');
    if (!svg) return;
    svg.style.display = 'block';
    svg.style.width = side + 'px';
    svg.style.height = side + 'px';
    svg.style.flex = '0 0 auto';
  }

  function gapBefore(el) {
    const prev = el.previousElementSibling;
    if (prev && isShown(prev)) {
      const gap = el.getBoundingClientRect().left - prev.getBoundingClientRect().right;
      if (gap >= 0 && gap <= 24) return gap;
    }
    return 8;
  }

  function placeButton() {
    if (!docEl || !docEl.isConnected) docEl = findDocImport();
    if (!docEl) {
      if (anchorBtn) anchorBtn.style.display = 'none';
      return;
    }
    if (!started) startEditor();
    ensureButton();
    const box = paintable(docEl);
    paintButton(box);
    const rect = box.getBoundingClientRect();
    anchorBtn.style.display = 'inline-flex';
    anchorBtn.style.height = rect.height + 'px';
    anchorBtn.style.width = 'auto';
    anchorBtn.style.top = rect.top + 'px';
    const width = anchorBtn.offsetWidth;
    anchorBtn.style.width = width + 'px';
    anchorBtn.style.left = (rect.left - gapBefore(box) - width) + 'px';
  }

  function scheduleMount(records) {
    if (records && anchorBtn && records.every((record) => record.target === anchorBtn || anchorBtn.contains(record.target))) return;
    docEl = null;
    clearTimeout(mountTimer);
    mountTimer = setTimeout(placeButton, 120);
  }

  function callPage(type, payload, timeout) {
    const requestId = 'r' + (++requestSeq) + '-' + Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('页面没有响应，请刷新编辑页后重试'));
      }, timeout || 30000);

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== SOURCE || data.type !== 'result' || data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data);
      }

      window.addEventListener('message', onMessage);
      window.postMessage(Object.assign({ source: SOURCE, type: type, requestId: requestId }, payload || {}), '*');
    });
  }

  function fetchRemote(url) {
    return chrome.runtime.sendMessage({ type: 'fetch-binary', url: url }).then((resp) => {
      return resp || { ok: false, error: '下载失败' };
    }).catch((err) => ({ ok: false, error: (err && err.message) || '下载失败' }));
  }

  async function readHtmlFile(file) {
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const head = utf8.slice(0, 800).toLowerCase();
    if (/charset\s*=\s*["']?\s*gb(?:k|2312|18030)/.test(head) || utf8.indexOf('\uFFFD') >= 0) {
      try {
        return new TextDecoder('gb18030').decode(buf);
      } catch (err) {
        return utf8;
      }
    }
    return utf8;
  }

  function statusText(asset) {
    const map = {
      missing: '未选择',
      matched: '已选择',
      pending: '自动上传',
      uploading: '上传中',
      done: '已上传',
      failed: '失败',
      unsupported: '不支持',
      ready: '已在微信'
    };
    return map[asset.status] || '';
  }

  function thumbOf(asset) {
    if (asset.objectUrl) return asset.objectUrl;
    if (asset.kind === 'remote') return asset.fetchUrl || asset.src;
    if (asset.kind === 'data') return asset.src;
    return '';
  }

  function detailOf(asset) {
    if (asset.error) return asset.error;
    if (asset.kind === 'data') return '内嵌在 HTML 中的图片';
    if (asset.where === 'css') return '样式背景 · ' + asset.src;
    if (asset.where === 'poster') return '封面 · ' + asset.src;
    if (asset.kind === 'unsupported') return '暂不自动上传，远程地址会保留';
    return asset.src;
  }

  function rowOf(asset) {
    return {
      id: asset.id,
      name: asset.filename,
      detail: detailOf(asset),
      status: asset.status,
      statusText: statusText(asset),
      thumb: thumbOf(asset),
      showPick: asset.kind === 'local' && !busy,
      canClear: asset.kind === 'local' && !!asset.file && !busy
    };
  }

  function viewModel() {
    const html = panel ? panel.getHtml().trim() : '';
    const local = assets.filter((asset) => asset.kind === 'local');
    const auto = assets.filter((asset) => asset.kind === 'remote' || asset.kind === 'data');
    const other = assets.filter((asset) => asset.kind === 'unsupported');
    const cdnCount = assets.filter((asset) => asset.kind === 'cdn').length;
    const missing = local.filter((asset) => asset.status === 'missing').length;
    const parts = [];
    if (html) {
      if (!local.length && !auto.length && !cdnCount && !other.length) parts.push('没有需要上传的图片，确认后直接写入正文');
      if (local.length) parts.push(local.length + ' 张本地图片需要选择文件');
      if (auto.length) parts.push(auto.length + ' 张会在导入时自动上传');
      if (cdnCount) parts.push(cdnCount + ' 张已在微信图床');
    }
    let foot = '';
    let footError = false;
    if (notice) {
      foot = notice;
      footError = noticeError;
    } else if (!html) {
      foot = '粘贴 HTML，或上传 .html 文件。';
    } else if (missing && !skipUnmatched) {
      foot = '还有 ' + missing + ' 张本地图片未选择';
      footError = true;
    }
    return {
      warnings: warnings,
      fileLabel: loadedName ? ('已载入 ' + loadedName) : '',
      summary: parts.join('，') + (parts.length ? '。' : ''),
      localRows: local.map(rowOf),
      autoRows: auto.map(rowOf),
      otherRows: other.map(rowOf),
      showSkip: local.length > 0,
      skip: skipUnmatched,
      canImport: !!html && !busy && (missing === 0 || skipUnmatched),
      busy: busy,
      foot: foot,
      footError: footError,
      primaryLabel: busy ? (busyLabel || '正在导入') : '导入到正文'
    };
  }

  function setNotice(text, isError) {
    notice = text || '';
    noticeError = !!isError;
    if (panel) panel.render(viewModel());
    clearTimeout(noticeTimer);
    if (!notice) return;
    noticeTimer = setTimeout(() => {
      notice = '';
      noticeError = false;
      if (panel) panel.render(viewModel());
    }, 3200);
  }

  function recompute() {
    const html = panel.getHtml();
    const previous = assets.slice();
    let prepared;
    try {
      prepared = MpWxHtml.prepareHtml(html);
    } catch (err) {
      prepared = { html: html, title: '', assets: [], warnings: ['HTML 解析失败'] };
    }
    preparedHtml = prepared.html || '';
    articleTitle = prepared.title || '';
    warnings = prepared.warnings || [];
    const next = prepared.assets || [];
    next.forEach((asset) => {
      const prevBySrc = previous.find((item) => item.src === asset.src);
      if (asset.kind === 'local') {
        const prev = (prevBySrc && prevBySrc.file)
          ? prevBySrc
          : previous.find((item) => item.file && item.filename.toLowerCase() === asset.filename.toLowerCase());
        if (prev && prev.file) {
          asset.file = prev.file;
          asset.objectUrl = prev.objectUrl;
          asset.status = 'matched';
        }
      } else if (prevBySrc && prevBySrc.cdnUrl) {
        asset.cdnUrl = prevBySrc.cdnUrl;
        asset.status = 'done';
      }
    });
    const keep = new Set(next.map((asset) => asset.objectUrl).filter(Boolean));
    previous.forEach((asset) => {
      if (asset.objectUrl && !keep.has(asset.objectUrl)) URL.revokeObjectURL(asset.objectUrl);
    });
    assets = next;
    panel.render(viewModel());
  }

  function releaseUrl(url) {
    if (url && !assets.some((asset) => asset.objectUrl === url)) URL.revokeObjectURL(url);
  }

  function assignFile(asset, file) {
    const shared = assets.find((item) => item.file === file && item.objectUrl);
    const previousUrl = asset.objectUrl;
    asset.file = file;
    asset.objectUrl = shared ? shared.objectUrl : URL.createObjectURL(file);
    asset.status = 'matched';
    asset.error = '';
    asset.cdnUrl = '';
    if (previousUrl && previousUrl !== asset.objectUrl) releaseUrl(previousUrl);
  }

  function matchFiles(fileList) {
    const list = Array.from(fileList || []).filter((file) => file && !MpWxHtml.isJunk(file.name));
    let count = 0;
    assets.forEach((asset) => {
      if (asset.kind !== 'local') return;
      let best = null;
      let score = 0;
      list.forEach((file) => {
        const next = MpWxHtml.matchScore(asset.src, file.name, file.webkitRelativePath || '');
        if (next > score) {
          score = next;
          best = file;
        }
      });
      if (best) {
        assignFile(asset, best);
        count += 1;
      }
    });
    const missing = assets.filter((asset) => asset.kind === 'local' && asset.status === 'missing').length;
    if (!list.length) setNotice('没有读取到图片文件', true);
    else if (!count) setNotice('没有同名图片，请检查文件名是否一致', true);
    else if (missing) setNotice('已匹配 ' + count + ' 张，还有 ' + missing + ' 张未找到', false);
    else setNotice('已匹配 ' + count + ' 张图片', false);
    return count;
  }

  function needsUpload(asset) {
    if (!asset || asset.cdnUrl || asset.status === 'done') return false;
    if (asset.kind === 'cdn' || asset.kind === 'unsupported') return false;
    if (asset.kind === 'local') return asset.status === 'matched' && !!asset.file;
    return asset.kind === 'remote' || asset.kind === 'data';
  }

  async function uploadAsset(asset) {
    let buffer;
    let mime = (asset.mime || 'image/png').split(';')[0];
    let filename = asset.filename || 'image.png';
    if (asset.kind === 'local') {
      buffer = await asset.file.arrayBuffer();
      mime = (asset.file.type || mime).split(';')[0];
      filename = asset.file.name || filename;
    } else if (asset.kind === 'data') {
      const parsed = MpWxHtml.dataUrlBytes(asset.src);
      if (!parsed) return { ok: false, error: '无法读取内嵌图片' };
      buffer = parsed.buffer;
      mime = parsed.mime || mime;
    } else {
      const fetched = await fetchRemote(asset.fetchUrl || asset.src);
      if (!fetched || !fetched.ok) return { ok: false, error: (fetched && fetched.error) || '下载失败' };
      buffer = MpWxHtml.base64ToBuffer(fetched.base64);
      mime = (fetched.mime || mime).split(';')[0];
    }
    if (!buffer || buffer.byteLength > MAX_BYTES) return { ok: false, error: '图片超过 10MB' };
    return callPage('upload', { buffer: buffer, mime: mime, filename: filename }, 40000);
  }

  async function runImport() {
    if (busy || !panel) return;
    clearTimeout(inputTimer);
    recompute();
    const html = panel.getHtml().trim();
    if (!html) {
      setNotice('请先粘贴或上传 HTML', true);
      return;
    }
    const missing = assets.filter((asset) => asset.kind === 'local' && asset.status === 'missing');
    if (missing.length && !skipUnmatched) {
      setNotice('还有 ' + missing.length + ' 张本地图片未选择', true);
      return;
    }

    busy = true;
    busyLabel = '正在准备';
    panel.render(viewModel());
    try {
      const queue = assets.filter(needsUpload);
      for (let i = 0; i < queue.length; i++) {
        const asset = queue[i];
        asset.status = 'uploading';
        busyLabel = '正在上传 ' + (i + 1) + '/' + queue.length;
        panel.render(viewModel());
        const result = await uploadAsset(asset);
        if (result && result.ok && result.cdnUrl) {
          asset.cdnUrl = result.cdnUrl;
          asset.status = 'done';
          asset.error = '';
        } else {
          asset.status = 'failed';
          asset.error = (result && result.error) || '上传失败';
        }
      }
      busyLabel = '正在写入正文';
      panel.render(viewModel());
      const finalHtml = MpWxHtml.applyAssets(preparedHtml, assets, { dropUnmatched: skipUnmatched });
      const injected = await callPage('inject', { html: finalHtml, title: articleTitle }, 15000);
      if (!injected || !injected.ok) {
        setNotice((injected && injected.error) || '导入失败', true);
        return;
      }
      const uploaded = assets.filter((asset) => asset.status === 'done').length;
      const failed = assets.filter((asset) => asset.status === 'failed').length;
      const skipped = skipUnmatched ? assets.filter((asset) => asset.kind === 'local' && asset.status === 'missing').length : 0;
      let message = uploaded ? ('已导入正文，' + uploaded + ' 张图片已上传') : '已导入正文';
      if (failed) message += '，' + failed + ' 张失败的图片已从正文移除';
      if (skipped) message += '，已跳过 ' + skipped + ' 张未选择的图片';
      panel.close();
      panel.toast(message);
    } catch (err) {
      setNotice((err && err.message) || '导入失败', true);
    } finally {
      busy = false;
      busyLabel = '';
      if (panel.isOpen()) panel.render(viewModel());
    }
  }

  function bindPanel(target) {
    target.on('html', () => {
      loadedName = '';
      clearTimeout(inputTimer);
      inputTimer = setTimeout(recompute, 180);
    });
    target.on('html-file', async (file) => {
      try {
        const text = await readHtmlFile(file);
        loadedName = file.name;
        target.setHtml(text, true);
        recompute();
      } catch (err) {
        setNotice('读取 HTML 失败', true);
      }
    });
    target.on('match-files', (files) => matchFiles(files));
    target.on('assign-one', (payload) => {
      const asset = assets.find((item) => item.id === payload.id);
      if (!asset || !payload.file) return;
      assignFile(asset, payload.file);
      setNotice('已选择 ' + payload.file.name, false);
    });
    target.on('clear-one', (id) => {
      const asset = assets.find((item) => item.id === id);
      if (!asset) return;
      const url = asset.objectUrl;
      asset.file = null;
      asset.objectUrl = '';
      asset.cdnUrl = '';
      asset.status = 'missing';
      releaseUrl(url);
      panel.render(viewModel());
    });
    target.on('skip', (checked) => {
      skipUnmatched = !!checked;
      panel.render(viewModel());
    });
    target.on('import', () => runImport());
  }

  function startEditor() {
    if (started) return;
    started = true;
    panel = MpWxPanel.create({ sampleTheme: sampleTheme });
    bindPanel(panel);
    panel.render(viewModel());
  }

  function listenIcon() {
    const runtime = globalThis.chrome && chrome.runtime;
    if (!runtime || !runtime.onMessage || !runtime.id) return;
    runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'mpwx-open') return;
      if (!started) startEditor();
      if (panel) panel.open();
    });
  }

  function boot() {
    listenIcon();
    const root = document.documentElement;
    if (root) {
      const observer = new MutationObserver(scheduleMount);
      observer.observe(root, { childList: true, subtree: true });
    }
    window.addEventListener('scroll', () => { if (anchorBtn || docEl) placeButton(); }, true);
    window.addEventListener('resize', () => placeButton());
    setInterval(() => {
      docEl = null;
      placeButton();
    }, 1500);
    placeButton();
  }

  boot();
})();
