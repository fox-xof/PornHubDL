console.log("background.js 已加载");

chrome.action.onClicked.addListener(async (tab) => {
  console.log("扩展图标点击，tab:", tab && tab.id ? tab.id : tab);

  if (!tab || !tab.id) {
    console.warn("无效 tab");
    return;
  }

  try {
    const url = chrome.runtime.getURL("inject.js");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (src) => {
        try {
          const prev = document.querySelectorAll('script[data-ph-inject="1"]');
          prev.forEach(p => p.remove());
        } catch (e) {}

        const s = document.createElement('script');
        s.setAttribute('data-ph-inject', '1');
        s.src = src;
        s.onload = () => s.remove();
        (document.head || document.documentElement).appendChild(s);
      },
      args: [url]
    });

    console.log("✅ inject.js 注入尝试完成");
  } catch (err) {
    console.error("❌ inject.js 注入失败:", err);
  }
});

// 处理消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetchGetMedia") {
    console.log("请求 get_media:", message.url);
    
    // 获取页面 Cookie
    chrome.cookies.getAll({ url: "https://www.pornhub.com" }, (cookies) => {
      const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
      
      fetch(message.url, {
        headers: {
          "Referer": "https://www.pornhub.com/",
          "Origin": "https://www.pornhub.com",
          "User-Agent": navigator.userAgent,
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "Cookie": cookieHeader
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          // 调试：打印原始响应
          response.clone().text().then(text => console.log("get_media 原始响应:", text));
          return response.json();
        })
        .then(data => {
          console.log("get_media 响应:", JSON.stringify(data, null, 2));
          sendResponse({ success: true, data });
        })
        .catch(err => {
          console.error("get_media 请求失败:", err, "URL:", message.url);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true; // 异步响应
  }

  if (message.type === "startDownload") {
    console.log("开始下载:", message.url);
    chrome.cookies.getAll({ url: "https://www.pornhub.com" }, (cookies) => {
      const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
      
      fetch(message.url, {
        headers: {
          "Referer": "https://www.pornhub.com/",
          "Origin": "https://www.pornhub.com",
          "User-Agent": navigator.userAgent,
          "Cookie": cookieHeader
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          chrome.downloads.download({
            url: blobUrl,
            filename: message.filename,
            saveAs: true
          }, (downloadId) => {
            URL.revokeObjectURL(blobUrl);
            sendResponse({ success: !!downloadId });
          });
        })
        .catch(err => {
          console.error("下载失败:", err, "URL:", message.url);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true; // 异步响应
  }
});