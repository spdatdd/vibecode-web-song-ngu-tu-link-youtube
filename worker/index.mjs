// Trả dữ liệu phụ đề hoặc thông báo lỗi dưới dạng JSON cùng nguồn.
function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Chuẩn hóa thời gian và ngôn ngữ của một bản phụ đề Supadata.
function normalizeTrack(data) {
  const lang = typeof data.lang === 'string' ? data.lang.toLowerCase().split('-')[0] : '';
  const cues = [];
  if (Array.isArray(data.content)) {
    for (const segment of data.content) {
      if (!segment || typeof segment.text !== 'string') continue;
      const { offset, duration } = segment;
      const text = segment.text.trim();
      if (!Number.isFinite(offset) || !Number.isFinite(duration) || offset < 0 || duration <= 0 || !text) continue;
      cues.push({ start: Math.round(offset), end: Math.max(Math.round(offset) + 1, Math.round(offset + duration)), text });
    }
  }
  const available = Array.isArray(data.availableLangs) ? data.availableLangs.filter((code) => typeof code === 'string') : [];
  return { lang, cues, available };
}

// Gọi Supadata với khóa giữ ở Worker và giới hạn thời gian của mỗi yêu cầu.
async function requestSupadata(url, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const options = {
      headers: { 'x-api-key': key },
      redirect: 'manual',
      signal: controller.signal,
    };
    let response = await fetch(url.toString(), options);
    const location = response.headers.get('Location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, url);
      if (next.origin !== url.origin) return { status: 502, data: null };
      response = await fetch(next.toString(), options);
    }
    if (!response.ok) console.warn('Supadata HTTP', response.status);
    return { status: response.status, data: response.ok ? await response.json() : null };
  } finally {
    clearTimeout(timer);
  }
}

// Gửi link người xem dán và đợi tác vụ nếu Supadata cần tạo transcript.
async function fetchTrack(videoUrl, language, key) {
  const url = new URL('https://api.supadata.ai/v1/transcript');
  url.searchParams.set('url', videoUrl);
  if (language) {
    url.searchParams.set('lang', language);
    url.searchParams.set('mode', 'native');
  }
  let { status, data } = await requestSupadata(url, key);
  if (status === 202 && /^[a-zA-Z0-9_-]+$/.test(data?.jobId ?? '')) {
    const jobUrl = new URL('https://api.supadata.ai/v1/transcript/' + data.jobId);
    const deadline = Date.now() + 45000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      ({ status, data } = await requestSupadata(jobUrl, key));
      if (status !== 200) return { status };
      if (data?.status === 'completed') {
        data = data.result ?? data;
        break;
      }
      if (data?.status === 'failed') return { status: 502 };
    } while (Date.now() < deadline);
  }
  if (status !== 200) return { status };
  if (!Array.isArray(data?.content)) return { status: 502 };
  return { status: 200, ...normalizeTrack(data) };
}

// Ghép phản hồi gốc và ngôn ngữ thứ hai nếu YouTube có bản phụ đề đó.
async function captionsFor(request, env, url) {
  if (request.method !== 'GET') return reply({ error: 'Phương thức không được hỗ trợ.' }, 405);
  const videoUrl = url.searchParams.get('url') ?? '';
  try {
    if (!videoId(videoUrl)) return reply({ error: 'Link YouTube không hợp lệ.' }, 400);
  } catch {
    return reply({ error: 'Link YouTube không hợp lệ.' }, 400);
  }
  if (!env.SUPADATA_API_KEY) return reply({ error: 'Tính năng lấy phụ đề chưa được kết nối. Bạn vẫn có thể bật CC trong video nếu có.' }, 503);
  try {
    const first = await fetchTrack(videoUrl, null, env.SUPADATA_API_KEY);
    switch (first.status) {
      case 200: break;
      case 206:
      case 404: return reply({ error: 'Không tìm thấy phụ đề công khai cho video này.' }, 404);
      case 401:
      case 403: return reply({ error: 'Dịch vụ phụ đề cần được kết nối lại.' }, 503);
      case 402:
      case 429: return reply({ error: 'Dịch vụ phụ đề đã đạt giới hạn. Hãy thử lại sau.' }, 429);
      default: return reply({ error: 'Tạm thời không lấy được phụ đề. Hãy thử lại sau.' }, 502);
    }
    const tracks = { en: [], vi: [] };
    if (first.lang === 'en' || first.lang === 'vi') tracks[first.lang] = first.cues;
    const needed = ['en', 'vi'].find((lang) => lang !== first.lang && first.available.some((code) => code.toLowerCase().split('-')[0] === lang));
    if (needed) {
      const other = await fetchTrack(videoUrl, needed, env.SUPADATA_API_KEY).catch(() => null);
      if (other?.status === 200 && other.lang === needed) tracks[needed] = other.cues;
    }
    if (!tracks.en.length && !tracks.vi.length) {
      return reply({ error: first.cues.length ? 'Video chưa có phụ đề tiếng Anh hoặc tiếng Việt.' : 'Không tìm thấy phụ đề công khai cho video này.' }, 404);
    }
    return reply(tracks);
  } catch (error) {
    const message = String(error?.message ?? '').replace(/sd_[a-zA-Z0-9]+/g, '[secret]');
    console.warn('Supadata request failed', error?.name, message);
    return reply({ error: 'Tạm thời không lấy được phụ đề. Hãy thử lại sau.' }, 502);
  }
}

// Phục vụ giao diện, ảnh bìa và API từ cùng tên miền của Site.
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/captions') return captionsFor(request, env, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : null;
    if (!asset) return new Response(null, { status: 404 });
    const body = request.method === 'HEAD' ? null
      : asset.binary ? Uint8Array.from(atob(asset.content), (char) => char.charCodeAt(0))
      : asset.content;
    return new Response(body, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache' } });
  },
};
