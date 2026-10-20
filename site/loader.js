'use strict';
const expiresAt = Date.parse('2026-10-22T04:00:00Z');
const form = document.getElementById('gate');
const status = document.getElementById('status');
const button = document.getElementById('enter');
const mime = { html: 'text/html', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', txt: 'text/plain' };
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
if (Date.now() >= expiresAt) {
  form.querySelector('input').disabled = true;
  button.disabled = true;
  status.textContent = '试玩期限已结束';
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (Date.now() >= expiresAt) return;
  button.disabled = true;
  status.textContent = '正在解锁试玩资源…';
  try {
    const password = document.getElementById('pass').value;
    const [manifestResponse, payloadResponse] = await Promise.all([fetch('manifest.json', { cache: 'no-store' }), fetch('payload.bin', { cache: 'no-store' })]);
    if (!manifestResponse.ok || !payloadResponse.ok) throw Error('resource unavailable');
    const manifest = await manifestResponse.json();
    const payload = new Uint8Array(await payloadResponse.arrayBuffer());
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
    form.remove();
    const script = document.createElement('script');
    script.src = urls['game.bundle.js'];
    script.onerror = () => { status.textContent = '试玩加载失败'; };
    document.body.append(script);
  } catch {
    status.textContent = '口令错误或资源暂不可用';
    button.disabled = false;
  }
});
const linkKey = new URLSearchParams(location.hash.slice(1)).get('k');
if (linkKey && Date.now() < expiresAt) {
  document.getElementById('pass').value = linkKey;
  form.requestSubmit();
}

