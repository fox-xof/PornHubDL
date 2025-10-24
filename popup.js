console.log("popup.js 已加载");

function showLoading(show) {
  document.getElementById("loading").style.display = show ? "block" : "none";
  document.getElementById("videoList").style.display = show ? "none" : "block";
}

function renderVideos(videos) {
  const container = document.getElementById("videoList");
  if (!videos || videos.length === 0) {
    container.innerHTML = "未检测到视频，请先打开视频页并点击扩展图标。";
    return;
  }

  // ------------------------
  // 获取视频标题
  // ------------------------
  chrome.storage.local.get("ph_title", ({ ph_title }) => {
    const title = ph_title || ""; // 回退为空

    const html = `
      <table>
        <tr>
          <th>质量</th>
          <th>格式</th>
          <th>操作</th>
        </tr>
        ${videos.map((v, index) => {
          // 使用标题生成文件名
          const filename = title
            ? `${title}_${v.quality}.${v.format.toLowerCase()}`
            : `${v.quality}.${v.format.toLowerCase()}`;
          return `
            <tr>
              <td>${v.quality}</td>
              <td>${v.format}</td>
              <td>
                <a href="#" class="download-btn" data-url="${v.url}" 
                   data-filename="${filename}" 
                   data-format="${v.format}">
                  ${v.format === "MP4" ? "下载" : "复制 HLS 链接"}
                </a>
              </td>
            </tr>
          `;
        }).join("")}
      </table>
    `;
    container.innerHTML = html;

    // 为按钮添加事件监听器
    document.querySelectorAll(".download-btn").forEach(button => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const url = button.dataset.url;
        const filename = button.dataset.filename;
        const format = button.dataset.format;

        if (format === "HLS") {
          navigator.clipboard.writeText(url).then(() => {
            alert("HLS 链接已复制到剪贴板，可使用 FFmpeg 下载：\nffmpeg -i \"" + url + "\" -c copy output.mp4");
          }).catch(err => {
            console.error("复制失败:", err);
            alert("复制链接失败，请手动复制：" + url);
          });
          return;
        }

        // 使用 chrome.downloads API 触发 MP4 下载
        chrome.downloads.download({
          url: url,
          filename: filename,
          // saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("下载失败:", chrome.runtime.lastError);
            alert("下载失败，请检查链接或稍后重试。");
          } else {
            console.log("开始下载:", downloadId);
          }
        });
      });
    });
  });
}

// 读取存储的视频并渲染
chrome.storage.local.get("ph_videos", ({ ph_videos }) => {
  console.log("popup 读取到的视频:", ph_videos);
  if (!ph_videos) {
    console.warn("未从 storage 读取到 ph_videos 数据");
  }
  showLoading(false);
  renderVideos(ph_videos);
});

// 监听 storage 变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.ph_videos) {
    console.log("检测到视频数据更新:", changes.ph_videos.newValue);
    showLoading(false);
    renderVideos(changes.ph_videos.newValue);
  }
});

// 初始化加载
document.addEventListener("DOMContentLoaded", () => {
  showLoading(true);

  // 1️⃣ 先尝试读取当前 storage
  chrome.storage.local.get(["ph_videos", "ph_title"], ({ ph_videos, ph_title }) => {
    console.log("popup 初始化读取到的视频:", ph_videos, "标题:", ph_title);
    renderVideos(ph_videos || []);
    showLoading(false);
  });

  // 2️⃣ 监听 storage 变化，实时更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.ph_videos) {
      console.log("检测到视频数据更新:", changes.ph_videos.newValue);
      renderVideos(changes.ph_videos.newValue || []);
      showLoading(false);
    }
  });

  // 3️⃣ 注入 content 脚本
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab.url.match(/https?:\/\/.*\.pornhub\.com\/.*/)) {
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (src) => {
          const s = document.createElement('script');
          s.setAttribute('data-ph-inject', '1');
          s.src = src;
          s.onload = () => s.remove();
          (document.head || document.documentElement).appendChild(s);
        },
        args: [chrome.runtime.getURL("inject.js")]
      });
    } else {
      showLoading(false);
      document.getElementById("videoList").innerHTML = "请在 Pornhub 视频页面使用此扩展。";
    }
  });
});

