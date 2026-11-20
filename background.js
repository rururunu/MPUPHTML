const FETCH_TIMEOUT = 20000;
const MAX_BYTES = 10 * 1024 * 1024;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mimeFromName(url) {
  const clean = String(url || '').split('?')[0].split('#')[0];
  const ext = (clean.split('.').pop() || '').toLowerCase();
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
  return map[ext] || '';
}

async function fetchBinary(url) {
  if (!/^https?:\/\//i.test(url || '')) {
    return { ok: false, error: '不支持的图片地址' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const resp = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!resp.ok) return { ok: false, error: '下载失败 HTTP ' + resp.status };
    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return { ok: false, error: '图片超过 10MB' };
    if (!buffer.byteLength) return { ok: false, error: '图片内容为空' };

    let mime = (resp.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
      mime = mimeFromName(url) || 'image/png';
    }
    return { ok: true, base64: arrayBufferToBase64(buffer), mime };
  } catch (err) {
    const message = err && err.name === 'AbortError' ? '下载超时' : ((err && err.message) || '下载失败');
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'fetch-binary') return;
  fetchBinary(msg.url).then(sendResponse);
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id || !tab.url || tab.url.indexOf('https://mp.weixin.qq.com/') !== 0) return;
  chrome.tabs.sendMessage(tab.id, { type: 'mpwx-open' }, () => {
    void chrome.runtime.lastError;
  });
});
