console.log("content.js 已加载");

let found = false;

// 监听来自 inject.js 的消息
window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'ph_extension_inject') {
    console.log("收到来自 inject.js 的消息:", event.data);
    
    if (found) return;
    found = true;

    console.log(`[✓] 找到 ${event.data.key}，准备提取视频`);
    extractVideo(event.data.data);
  }
});

// 监听 ph_flashvars_found 事件
window.addEventListener("ph_flashvars_found", e => {
  if (found) return;
  found = true;

  console.log(`[✓] 找到 ${e.detail.key}，准备提取视频`);
  extractVideo(e.detail.data);
});

// -------------------------
// 提取视频函数 extractVideo
// -------------------------
async function extractVideo(flashvarsData) {
  let flashvars;

  // 兼容字符串和对象
  if (typeof flashvarsData === "string") {
    try {
      flashvars = new Function(`return ${flashvarsData}`)();
    } catch (e) {
      console.error("[✗] 解析 flashvars_ 失败:", e);
      return;
    }
  } else if (typeof flashvarsData === "object") {
    flashvars = flashvarsData;
  } else {
    console.error("[✗] flashvars_ 类型不支持:", typeof flashvarsData);
    return;
  }

  console.log("flashvars:", JSON.stringify(flashvars, null, 2));

  // -------------------------
  // ✅ 新增：获取视频标题
  // -------------------------
  let videoTitle = "";
  if (flashvars?.video_title) {
    videoTitle = flashvars.video_title;
  } else if (flashvars?.title) {
    videoTitle = flashvars.title;
  } else if (document.querySelector("h1")) {
    videoTitle = document.querySelector("h1").innerText;
  } else {
    videoTitle = document.title || "未命名视频";
  }

  // 清理非法文件名字符
  videoTitle = videoTitle.replace(/[\\\/:*?"<>|]/g, '').trim();
  console.log("[✓] 获取视频标题:", videoTitle);

  // -------------------------
  // 以下为原逻辑（完全保留）
  // -------------------------
  const resolutions = [];
  const seen = new Set();

  if (flashvars?.mediaDefinitions) {
    console.log("mediaDefinitions:", JSON.stringify(flashvars.mediaDefinitions, null, 2));

    const getMediaItems = flashvars.mediaDefinitions.filter(
      item => item?.videoUrl && typeof item.videoUrl === "string" && item.format === "mp4" && item.videoUrl.includes("/video/get_media")
    );

    if (getMediaItems.length > 0) {
      console.log("[✓] 检测到 get_media 链接:", getMediaItems);
      
      const promises = getMediaItems.map(item => new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "fetchGetMedia",
          url: item.videoUrl
        }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            console.error("[✗] 获取 get_media 失败:", chrome.runtime.lastError || response.error, "URL:", item.videoUrl);
            resolve([]);
            return;
          }

          const mediaDefinitions = response.data || [];
          console.log("get_media 响应:", JSON.stringify(mediaDefinitions, null, 2));

          const mp4Links = mediaDefinitions.filter(
            def => def?.videoUrl && typeof def.videoUrl === "string" && def.format === "mp4" && def.videoUrl.includes(".mp4")
          );

          const links = mp4Links.map(def => ({
            quality: def.quality || def.height || item.quality || "未知",
            url: def.videoUrl,
            format: "MP4"
          }));

          resolve(links);
        });
      }));

      const results = await Promise.all(promises);
      results.flat().forEach(link => {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          resolutions.push(link);
        }
      });

      if (resolutions.length > 0) {
        console.log("[✓] 从 get_media 提取成功！", resolutions);
        console.table(resolutions.map(r => ({ 质量: r.quality, 格式: r.format, 地址: r.url })));

        // ✅ 保存视频列表和标题
        chrome.storage.local.set({ ph_videos: [] }, () => {
          chrome.storage.local.set({
            ph_videos: resolutions,
            ph_title: videoTitle
          }, () => {
            console.log("[✓] 已保存到 storage:", { ph_videos: resolutions, ph_title: videoTitle });
          });
        });

        showDownloadUI(resolutions);
        return;
      }
    }

    // 回退：从 mediaDefinitions 提取直接 MP4 链接
    const directMp4Links = flashvars.mediaDefinitions.filter(
      item => item?.videoUrl && typeof item.videoUrl === "string" && item.format === "mp4" && item.videoUrl.includes(".mp4")
    );

    for (const item of directMp4Links) {
      if (!seen.has(item.videoUrl)) {
        seen.add(item.videoUrl);
        resolutions.push({
          quality: item.quality || item.height || "未知",
          url: item.videoUrl,
          format: "MP4"
        });
      }
    }
  }

  if (resolutions.length === 0) {
    const hlsLinks = flashvars?.mediaDefinitions?.filter(
      item => item?.videoUrl && typeof item.videoUrl === "string" && item.format === "hls" && item.videoUrl.includes(".m3u8")
    ) || [];
    
    if (hlsLinks.length > 0) {
      const hlsMessage = "⚠️ 未找到 MP4 链接，仅找到 HLS 链接。请使用 FFmpeg 下载：\n" +
        hlsLinks.map(link => `ffmpeg -i "${link.videoUrl}" -c copy ${link.quality || 'output'}.mp4`).join("\n");
      alert(hlsMessage);
    } else {
      alert("❌ 未提取到任何视频链接，可能是网络问题或页面限制。请检查网络或稍后重试。");
    }
    return;
  }

  console.log("[✓] 提取成功！", resolutions);

  // ✅ 保存视频列表和标题（第二处写入）
  chrome.storage.local.set({ ph_videos: [] }, () => {
    chrome.storage.local.set({
      ph_videos: resolutions,
      ph_title: videoTitle
    }, () => {
      console.log("[✓] 已保存到 storage:", { ph_videos: resolutions, ph_title: videoTitle });
    });
  });

  showDownloadUI(resolutions);
}
