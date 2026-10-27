// HLS playback helper. Chrome/Android/Firefox use hls.js; Safari/iOS use the
// native HLS implementation. js/vendor/hls.min.js is loaded globally by the
// HTML shells before the SPA module.
let active = null;

export function isHlsUrl(url = "") {
  return /\.m3u8(\?|#|$)/i.test(String(url));
}

export function canPlayNativeHls(video) {
  return Boolean(video?.canPlayType?.("application/vnd.apple.mpegurl"));
}

export function attachHls(video, url, { onFatal, onReady } = {}) {
  detachHls();
  if (!video || !url) return null;

  if (canPlayNativeHls(video)) {
    video.src = url;
    return null;
  }

  const Hls = window.Hls;
  if (!Hls || !Hls.isSupported()) {
    video.src = url;
    return null;
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 90
  });
  active = hls;
  let networkRetried = false;
  let mediaRecovered = false;

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data?.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !networkRetried) {
      networkRetried = true;
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
      mediaRecovered = true;
      hls.recoverMediaError();
      return;
    }
    onFatal?.(data);
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => onReady?.());
  hls.loadSource(url);
  hls.attachMedia(video);
  return hls;
}

export function detachHls() {
  if (!active) return;
  try { active.destroy(); } catch {}
  active = null;
}
