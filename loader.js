'use strict';
const expiresAt = Date.parse('2026-10-22T04:00:00Z');
const form = document.getElementById('gate');
const status = document.getElementById('status');
const button = document.getElementById('enter');
const mime = { html: 'text/html', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', txt: 'text/plain' };
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { cache: 'default', signal: controller.signal });
    if (!response.ok) throw Error('resource unavailable');
    return await response.arrayBuffer();
  } finally { clearTimeout(timer); }
}
async function getPayload(manifest) {
  const cacheKey = new URL('payload.bin?iv=' + encodeURIComponent(manifest.iv), location.href);
  let cache;
  try {
    cache = await caches.open('encrypted-game-v1');
    const cached = await cache.match(cacheKey);
    if (cached) return new Uint8Array(await cached.arrayBuffer());
  } catch (_) { cache = null; }
  const payload = new Uint8Array(await fetchWithTimeout('payload.bin'));
  if (cache) await cache.put(cacheKey, new Response(payload)).catch(() => {});
  return payload;
}
if (Date.now() >= expiresAt) {
  form.querySelector('input').disabled = true;
  button.disabled = true;
  status.textContent = '访问已结束';
} else {
  setTimeout(() => {
    document.body.innerHTML = '<main style="margin:auto;text-align:center;color:#354a37;font-size:18px"><h1>菜头大作战</h1><p>访问已结束</p></main>';
  }, expiresAt - Date.now());
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (Date.now() >= expiresAt) return;
  button.disabled = true;
  button.hidden = true;
  status.textContent = '正在获取资源…';
  try {
    const password = document.getElementById('pass').value;
    const manifest = JSON.parse(new TextDecoder().decode(await fetchWithTimeout('manifest.json')));
    const payload = await getPayload(manifest);
    status.textContent = '正在启动游戏…';
    const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const tag = decode(manifest.tag);
    const combined = new Uint8Array(payload.length + tag.length);
    combined.set(payload);
    combined.set(tag, payload.length);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(manifest.iv) }, key, combined));
    const urls = {};
    for (const file of manifest.files) {
      const ext = file.path.split('.').pop();
      const blob = new Blob([plain.slice(file.offset, file.offset + file.bytes)], { type: mime[ext] || 'application/octet-stream' });
      urls[file.path.slice(1)] = URL.createObjectURL(blob);
    }
    if (!urls['game.bundle.js']) throw Error('missing game');
    window.__publisherAssetUrls = urls;
    window.__publisherAssetSizes = Object.fromEntries(manifest.files.map(file => [file.path.slice(1), file.bytes]));
    form.remove();
    const script = document.createElement('script');
    script.src = urls['game.bundle.js'];
    script.onerror = () => { status.textContent = '试玩加载失败'; };
    document.body.append(script);
  } catch {
    status.textContent = Date.now() >= expiresAt ? '访问已结束' : '连接未完成，请检查网络后重试';
    button.disabled = false;
    if (Date.now() < expiresAt) { button.hidden = false; button.textContent = '重试进入'; }
  }
});
const linkKey = new URLSearchParams(location.hash.slice(1)).get('k');
if (linkKey && Date.now() < expiresAt) {
  document.getElementById('pass').value = linkKey;
  form.requestSubmit();
}
