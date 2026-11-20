(function () {
  'use strict';

  const IMAGE_EXT = /^(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i;

  function decodeSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  }

  function baseName(src) {
    const clean = decodeSafe(String(src || '').split('?')[0].split('#')[0]).replace(/\\/g, '/');
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;
  }

  function extensionOf(src) {
    const name = baseName(src);
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1) : '';
  }

  function isImageUrl(src) {
    const ext = extensionOf(src);
    if (!ext) return true;
    return IMAGE_EXT.test(ext);
  }

  function mimeFromName(src) {
    const ext = extensionOf(src).toLowerCase();
    const map = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      avif: 'image/avif',
      ico: 'image/x-icon',
      tif: 'image/tiff',
      tiff: 'image/tiff'
    };
    return map[ext] || 'image/png';
  }

  function isJunk(name) {
    const base = String(name || '');
    return !base || base.charAt(0) === '.' || /^(thumbs\.db|desktop\.ini)$/i.test(base);
  }

  function matchScore(src, fileName, relativePath) {
    const name = baseName(src).toLowerCase();
    const file = String(fileName || '').toLowerCase();
    let wanted = String(src || '').split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '');
    wanted = decodeSafe(wanted).toLowerCase();
    const rel = decodeSafe(String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '')).toLowerCase();
    if (rel && (rel === wanted || rel.endsWith('/' + wanted) || wanted.endsWith('/' + rel))) return 3;
    if (file && name && file === name) return 2;
    return 0;
  }

  function stripAtRules(css) {
    let out = '';
    for (let i = 0; i < css.length; i++) {
      if (css.charAt(i) !== '@') {
        out += css.charAt(i);
        continue;
      }
      let depth = 0;
      let started = false;
      let j = i;
      for (; j < css.length; j++) {
        const ch = css.charAt(j);
        if (ch === '{') {
          depth += 1;
          started = true;
        } else if (ch === '}') {
          depth -= 1;
          if (started && depth <= 0) {
            j += 1;
            break;
          }
        } else if (ch === ';' && !started) {
          j += 1;
          break;
        }
      }
      i = j - 1;
    }
    return out;
  }

  function preprocessCss(css) {
    return stripAtRules(String(css || '').replace(/\/\*[\s\S]*?\*\//g, ''));
  }

  function parseRules(css) {
    const rules = [];
    let i = 0;
    while (i < css.length) {
      const brace = css.indexOf('{', i);
      if (brace < 0) break;
      const selector = css.slice(i, brace).trim();
      let depth = 1;
      let j = brace + 1;
      for (; j < css.length && depth > 0; j++) {
        if (css.charAt(j) === '{') depth += 1;
        else if (css.charAt(j) === '}') depth -= 1;
      }
      const body = css.slice(brace + 1, j - 1).trim();
      if (selector && body && selector.charAt(0) !== '@') rules.push({ selector: selector, body: body });
      i = j;
    }
    return rules;
  }

  function parseDecls(str) {
    const result = {};
    String(str || '').split(';').forEach((part) => {
      const colon = part.indexOf(':');
      if (colon < 0) return;
      const prop = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim();
      if (prop && value) result[prop] = value;
    });
    return result;
  }

  function serializeDecls(obj) {
    return Object.keys(obj).map((key) => key + ': ' + obj[key]).join('; ');
  }

  function safeSelectors(selector) {
    return String(selector || '').split(',').map((part) => part.trim()).filter((part) => {
      return part && part.indexOf('@') < 0 && part.indexOf(':') < 0;
    });
  }

  function queryAll(root, selector) {
    const list = [];
    if ((selector === 'html' || selector === ':root') && root.tagName === 'BODY') list.push(root);
    try {
      root.querySelectorAll(selector).forEach((el) => list.push(el));
    } catch (err) {
      return [];
    }
    try {
      if (root.matches && root.matches(selector) && list.indexOf(root) < 0) list.push(root);
    } catch (err) {
      /* 选择器不能用于 matches 时忽略根节点 */
    }
    return list;
  }

  function collectVars(rules) {
    const vars = {};
    rules.forEach((rule) => {
      const scope = rule.selector.split(',').some((part) => /^(:root|html|body|\*)$/i.test(part.trim()));
      if (!scope) return;
      String(rule.body).split(';').forEach((part) => {
        const colon = part.indexOf(':');
        if (colon < 0) return;
        const name = part.slice(0, colon).trim();
        if (name.indexOf('--') === 0) vars[name] = part.slice(colon + 1).trim();
      });
    });
    return vars;
  }

  function resolveVars(value, vars, depth) {
    if (String(value).indexOf('var(') < 0 || (depth || 0) > 8) return value;
    let out = '';
    let i = 0;
    const text = String(value);
    while (i < text.length) {
      const start = text.indexOf('var(', i);
      if (start < 0) {
        out += text.slice(i);
        break;
      }
      out += text.slice(i, start);
      let level = 1;
      let j = start + 4;
      for (; j < text.length && level > 0; j++) {
        if (text.charAt(j) === '(') level += 1;
        else if (text.charAt(j) === ')') level -= 1;
      }
      const inner = text.slice(start + 4, j - 1);
      const comma = inner.indexOf(',');
      const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      const fallback = comma < 0 ? '' : inner.slice(comma + 1).trim();
      const hit = Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : fallback;
      out += resolveVars(hit, vars, (depth || 0) + 1);
      i = j;
    }
    return out;
  }

  function finalizeDecls(decls, vars) {
    const out = {};
    Object.keys(decls).forEach((key) => {
      if (key.indexOf('--') === 0) return;
      const value = resolveVars(decls[key], vars, 0).trim();
      if (value) out[key] = value;
    });
    return out;
  }

  function inlineStyles(root, cssText) {
    const rules = parseRules(preprocessCss(cssText));
    const vars = collectVars(rules);
    const original = new Map();
    queryAll(root, '*').forEach((el) => {
      original.set(el, parseDecls(el.getAttribute('style') || ''));
    });
    original.set(root, parseDecls(root.getAttribute('style') || ''));
    const extra = new Map();
    rules.forEach((rule) => {
      const decls = parseDecls(rule.body);
      safeSelectors(rule.selector).forEach((selector) => {
        queryAll(root, selector).forEach((el) => {
          extra.set(el, Object.assign({}, extra.get(el) || {}, decls));
        });
      });
    });
    original.forEach((decls, el) => {
      const merged = finalizeDecls(Object.assign({}, extra.get(el) || {}, decls), vars);
      const text = serializeDecls(merged);
      if (text) el.setAttribute('style', text);
      else el.removeAttribute('style');
    });
  }

  function isLazyPlaceholder(src) {
    if (!src) return true;
    if (src === 'about:blank' || src === '#') return true;
    return src.indexOf('data:image/gif') === 0 && src.length < 200;
  }

  function extractCssUrls(css) {
    const urls = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let match;
    while ((match = re.exec(css || ''))) {
      const url = (match[2] || '').trim();
      if (!url || url.charAt(0) === '#' || url.indexOf('about:') === 0) continue;
      urls.push(url);
    }
    return urls;
  }

  function replaceCssUrls(css, map, drop) {
    return String(css || '').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, quote, inner) => {
      const url = (inner || '').trim();
      if (map.has(url)) return 'url("' + map.get(url) + '")';
      if (drop.has(url)) return 'none';
      return full;
    });
  }

  function classify(src, where) {
    if (src.indexOf('data:') === 0) {
      const mime = (src.match(/^data:([^;,]+)/) || [])[1] || 'image/png';
      if (mime.indexOf('image/') !== 0) return { kind: 'unsupported', mime: mime };
      return { kind: 'data', mime: mime };
    }
    if (src.indexOf('//') === 0) return classify('https:' + src, where);
    if (/^https?:\/\//i.test(src)) {
      if (/mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|wx\.qlogo\.cn/i.test(src)) return { kind: 'cdn', mime: mimeFromName(src) };
      if ((where === 'media' || where === 'css') && !isImageUrl(src)) return { kind: 'unsupported', mime: '' };
      return { kind: 'remote', mime: mimeFromName(src) };
    }
    if ((where === 'media' || where === 'css') && !isImageUrl(src)) return { kind: 'unsupported', mime: '' };
    return { kind: 'local', mime: mimeFromName(src) };
  }

  function collectAssets(root) {
    const found = [];
    const seen = new Set();
    let dataIndex = 0;

    function push(src, where) {
      const value = String(src || '').trim();
      if (!value || value.indexOf('blob:') === 0 || /^\s*javascript:/i.test(value)) return;
      if (where === 'css' && value.indexOf('data:') !== 0 && !isImageUrl(value)) return;
      if (seen.has(value)) return;
      seen.add(value);
      const info = classify(value, where);
      if (info.kind === 'unsupported' && where === 'css') return;
      let filename = baseName(value);
      if (info.kind === 'data') {
        dataIndex += 1;
        const ext = (info.mime || 'image/png').split('/')[1] || 'png';
        filename = '内嵌图片-' + dataIndex + '.' + ext.replace('+xml', '');
      }
      if (!filename) filename = '图片-' + (found.length + 1);
      let status = 'pending';
      if (info.kind === 'cdn') status = 'ready';
      else if (info.kind === 'local') status = 'missing';
      else if (info.kind === 'unsupported') status = 'unsupported';
      found.push({
        id: 'asset-' + (found.length + 1),
        src: value,
        fetchUrl: value.indexOf('//') === 0 ? 'https:' + value : value,
        filename: filename,
        mime: info.mime || '',
        kind: info.kind,
        where: where,
        status: status,
        file: null,
        objectUrl: '',
        cdnUrl: '',
        error: ''
      });
    }

    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || '';
      if (lazy && isLazyPlaceholder(src)) push(lazy, 'img');
      else if (src) push(src, 'img');
    });
    root.querySelectorAll('video[poster], img[poster]').forEach((el) => push(el.getAttribute('poster'), 'poster'));
    root.querySelectorAll('video[src], audio[src], source[src]').forEach((el) => push(el.getAttribute('src'), 'media'));
    root.querySelectorAll('[style]').forEach((el) => {
      extractCssUrls(el.getAttribute('style')).forEach((url) => push(url, 'css'));
    });
    return found;
  }

function stripTextIndent(styleText) {
  return String(styleText || '').split(';').map((part) => part.trim()).filter((part) => {
    if (!part) return false;
    return part.split(':')[0].trim().toLowerCase() !== 'text-indent';
  }).join('; ');
}

function cleanupForWechat(root) {
  const styled = [root].concat(Array.from(root.querySelectorAll('[style]')));
  styled.forEach((el) => {
    if (!el.getAttribute || !el.getAttribute('style')) return;
    const next = stripTextIndent(el.getAttribute('style'));
    if (next) el.setAttribute('style', next);
    else el.removeAttribute('style');
  });
    root.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, section, blockquote').forEach((el) => {
      if (el.closest('pre, code')) return;
      const node = el.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node.textContent = node.textContent.replace(/^[\s\u3000\u00a0]+/, '');
      }
    });
  }

  function prepareHtml(raw) {
    const doc = new DOMParser().parseFromString(String(raw || ''), 'text/html');
    const warnings = [];
    doc.querySelectorAll('link[rel~="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (href) warnings.push('外部样式表未写入正文：' + href);
    });
    const css = Array.from(doc.querySelectorAll('style')).map((el) => el.textContent || '').join('\n');
    doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
      const href = el.getAttribute && el.getAttribute('href');
      if (href && /^\s*javascript:/i.test(href)) el.removeAttribute('href');
    });

    const body = doc.body;
    if (css.trim()) inlineStyles(body, css);
    doc.querySelectorAll('style').forEach((el) => el.remove());
    cleanupForWechat(body);

    const bodyStyle = body.getAttribute('style');
    if (bodyStyle) {
      const wrap = doc.createElement('div');
      wrap.setAttribute('style', bodyStyle);
      while (body.firstChild) wrap.appendChild(body.firstChild);
      body.appendChild(wrap);
      body.removeAttribute('style');
    }

    const titleEl = doc.querySelector('title');
    const title = ((titleEl && titleEl.textContent) || doc.title || '').replace(/\s+/g, ' ').trim();

    return {
      html: body.innerHTML,
      title: title,
      assets: collectAssets(body),
      warnings: warnings
    };
  }

  function imageKey(img) {
    const src = img.getAttribute('src') || '';
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || '';
    if (lazy && isLazyPlaceholder(src)) return lazy;
    return src;
  }

  function applyAssets(html, assets, options) {
    const dropUnmatched = !!(options && options.dropUnmatched);
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const map = new Map();
    const drop = new Set();

    (assets || []).forEach((asset) => {
      if (!asset || !asset.src) return;
      if (asset.cdnUrl) map.set(asset.src, asset.cdnUrl);
      const localMissing = asset.kind === 'local' && asset.status === 'missing' && dropUnmatched;
      const failed = asset.status === 'failed';
      const localUnsupported = asset.kind === 'unsupported' && !/^https?:\/\//i.test(asset.src) && asset.src.indexOf('//') !== 0;
      if (localMissing || failed || localUnsupported) drop.add(asset.src);
    });

    doc.body.querySelectorAll('img').forEach((img) => {
      const key = imageKey(img);
      if (drop.has(key)) {
        img.remove();
        return;
      }
      if (map.has(key)) img.setAttribute('src', map.get(key));
      img.removeAttribute('srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('data-original');
    });

    doc.body.querySelectorAll('video[src], audio[src], source[src]').forEach((el) => {
      const src = el.getAttribute('src') || '';
      if (drop.has(src)) el.removeAttribute('src');
      else if (map.has(src)) el.setAttribute('src', map.get(src));
    });

    doc.body.querySelectorAll('[poster]').forEach((el) => {
      const poster = el.getAttribute('poster') || '';
      if (drop.has(poster)) el.removeAttribute('poster');
      else if (map.has(poster)) el.setAttribute('poster', map.get(poster));
    });

    doc.body.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style');
      if (style && style.indexOf('url(') >= 0) el.setAttribute('style', replaceCssUrls(style, map, drop));
    });

    return doc.body.innerHTML;
  }

  function base64ToUint8(b64) {
    const bin = atob(String(b64 || '').replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function base64ToBuffer(b64) {
    return base64ToUint8(b64).buffer;
  }

  function dataUrlBytes(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return null;
    try {
      const mime = match[1] || 'image/png';
      const payload = match[3] || '';
      const bytes = match[2] ? base64ToUint8(payload) : new TextEncoder().encode(decodeSafe(payload));
      return { mime: mime, buffer: bytes.buffer };
    } catch (err) {
      return null;
    }
  }

  globalThis.MpWxHtml = {
    prepareHtml: prepareHtml,
    applyAssets: applyAssets,
    matchScore: matchScore,
    isJunk: isJunk,
    baseName: baseName,
    dataUrlBytes: dataUrlBytes,
    base64ToBuffer: base64ToBuffer
  };
})();
