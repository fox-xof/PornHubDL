// inject.js （页面上下文）
if (!window.__ph_inject_done) {
  window.__ph_inject_done = true;

  (function() {
    try {
      // 找到 flashvars 变量
      const keys = Object.keys(window).filter(k => k.startsWith('flashvars_'));
      if (!keys || keys.length === 0) {
        // 没找到则不做事
        return;
      }

      const key = keys[0];
      const data = window[key];

      console.log('[inject.js 页面上下文] 找到 flashvars key:', key);

      // 通过 postMessage 发给 content script（扩展沙箱）
      window.postMessage({
        source: 'ph_extension_inject',
        key,
        data
      }, '*');
      // 🔥 新增：方式2：派发自定义事件
      window.dispatchEvent(new CustomEvent('ph_flashvars_found', {
        detail: { key, data }
      }));
    } catch (e) {
      console.warn('[inject.js 页面上下文] 错误:', e);
    }
  })();
}
