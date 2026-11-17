import { cueAt, mergeCaptions, timecode, videoId } from './captions.mjs';

// Lưu tham chiếu giao diện và trạng thái của video đang mở.
const list = document.getElementById('cue-list');
const poster = document.getElementById('play-video');
const playLabel = document.getElementById('play-label');
const host = document.getElementById('player-host');
const status = document.getElementById('player-status');
const follow = document.getElementById('follow');
const dialog = document.getElementById('import-dialog');
const form = document.getElementById('import-form');
const formError = document.getElementById('form-error');
const trackNote = document.getElementById('track-note');
const feedback = document.getElementById('caption-feedback');
const captionMessage = document.getElementById('caption-message');
const translate = document.getElementById('translate');
const modes = [...document.querySelectorAll('button[data-mode]')];
const state = { video: { cues: [] }, buttons: [], active: -1, player: null, ready: false, queuedTime: null, poll: null, timeout: null, session: 0 };
let apiLoading;
let captionRequest;

// Tạo một đoạn chú thích văn bản, không chèn HTML từ tệp tải lên.
function textSpan(className, text, language) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  if (language) span.lang = language;
  return span;
}

// Vẽ danh sách một lần khi mở video hoặc khi đổi chế độ ngôn ngữ.
function renderCues() {
  const mode = list.dataset.mode;
  const fragment = document.createDocumentFragment();
  state.buttons = state.video.cues.map((cue, index) => {
    if (mode !== 'both' && !cue[mode]) return null;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cue';
    button.dataset.index = index;
    const words = textSpan('cue-text', '');
    if (cue.en) words.append(textSpan('cue-en', cue.en, 'en'));
    if (cue.vi) words.append(textSpan('cue-vi', cue.vi, 'vi'));
    const arrow = textSpan('cue-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    button.append(textSpan('timecode', timecode(cue.start)), words, arrow);
    item.append(button);
    fragment.append(item);
    return button;
  });
  list.replaceChildren(fragment);
  state.buttons[state.active]?.setAttribute('aria-current', 'true');
}

// Đổi dòng được tô sáng và chỉ cuộn bên trong danh sách phụ đề.
function highlight(index, shouldScroll = true) {
  if (index !== state.active) {
    state.buttons[state.active]?.removeAttribute('aria-current');
    state.active = index;
  }
  const button = state.buttons[index];
  if (!button) return;
  button.setAttribute('aria-current', 'true');
  if (!shouldScroll || follow.getAttribute('aria-pressed') !== 'true') return;
  const viewport = list.getBoundingClientRect();
  const row = button.getBoundingClientRect();
  if (row.top < viewport.top || row.bottom > viewport.bottom) {
    list.scrollTop += row.top - viewport.top - 8;
  }
}

// Đọc vị trí trình phát và tìm câu tương ứng.
function syncCaptions() {
  if (!state.ready || state.queuedTime !== null) return;
  const index = cueAt(state.video.cues, state.player.getCurrentTime() * 1000);
  if (index !== state.active) highlight(index);
}

// Hủy phiên phát cũ để tránh sự kiện đến muộn tác động lên video mới.
function stopPlayer() {
  state.session += 1;
  clearInterval(state.poll);
  clearTimeout(state.timeout);
  state.player?.destroy?.();
  state.player = null;
  state.ready = false;
  state.queuedTime = null;
  host.replaceChildren();
}

// Hiển thị video và thông tin phụ đề tương ứng.
function showVideo(video) {
  stopPlayer();
  captionRequest?.abort();
  captionRequest = new AbortController();
  state.video = video;
  state.active = -1;
  document.getElementById('theater').hidden = false;
  document.getElementById('video-title').textContent = video.title;
  trackNote.textContent = 'Phụ đề từ video YouTube';
  const youtubeLink = document.getElementById('youtube-link');
  youtubeLink.href = video.url;
  youtubeLink.hidden = false;
  poster.style.setProperty('--poster-image', 'url("https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg")');
  poster.disabled = false;
  poster.hidden = false;
  playLabel.textContent = 'Phát video';
  status.hidden = true;
  applyMode('both');
  list.scrollTop = 0;
  void loadCaptions(video, captionRequest.signal);
}

// Hiện trạng thái tải phụ đề và cung cấp nút dịch khi thiếu một ngôn ngữ.
function setCaptionMessage(message, target) {
  feedback.hidden = !message;
  captionMessage.textContent = message;
  translate.hidden = !target;
  translate.disabled = false;
  translate.dataset.target = target ?? '';
  if (target) translate.textContent = target === 'vi' ? 'Dịch sang tiếng Việt' : 'Dịch sang tiếng Anh';
}

// Cập nhật danh sách mà không làm gián đoạn video đang phát.
function updateTracks(video, tracks) {
  video.tracks = tracks;
  video.cues = mergeCaptions(tracks.en, tracks.vi);
  state.active = -1;
  applyMode(list.dataset.mode);
  syncCaptions();
}

// Tự lấy phụ đề của ID video vừa mở và bỏ kết quả nếu người xem đã đổi video.
async function loadCaptions(video, signal) {
  setCaptionMessage('Đang tìm phụ đề của video…');
  try {
    const response = await fetch('/api/captions?url=' + encodeURIComponent(video.url), { signal });
    const tracks = await response.json();
    if (signal.aborted) return;
    if (!response.ok && typeof tracks?.error === 'string') {
      setCaptionMessage(tracks.error);
      return;
    }
    if (!response.ok || !Array.isArray(tracks?.en) || !Array.isArray(tracks?.vi)) throw new Error();
    updateTracks(video, tracks);
    if (tracks.en.length && tracks.vi.length) {
      trackNote.textContent = 'Phụ đề từ YouTube · Bấm vào câu để tua video';
      setCaptionMessage('');
      return;
    }
    const hasEnglish = tracks.en.length > 0;
    const language = hasEnglish ? 'tiếng Anh' : 'tiếng Việt';
    trackNote.textContent = 'Bấm vào câu để tua video';
    if ('Translator' in window) {
      setCaptionMessage('Video có phụ đề ' + language + '. Bạn có thể dịch sang ngôn ngữ còn lại.', hasEnglish ? 'vi' : 'en');
    } else {
      setCaptionMessage('Đang hiển thị phụ đề ' + language + '. Mở trang bằng Chrome trên máy tính để dịch sang ngôn ngữ còn lại.');
    }
  } catch {
    if (!signal.aborted) setCaptionMessage('Tạm thời không lấy được phụ đề. Hãy thử mở lại video.');
  }
}

// Dịch trên thiết bị từ nút người xem vừa bấm, giữ nguyên các mốc phụ đề gốc.
async function translateTrack() {
  const target = translate.dataset.target;
  const video = state.video;
  if (!target || !video.tracks || !('Translator' in window)) return;
  const signal = captionRequest.signal;
  const source = target === 'vi' ? 'en' : 'vi';
  const original = video.tracks[source];
  const translated = [];
  translate.disabled = true;
  captionMessage.textContent = 'Đang chuẩn bị bộ dịch của trình duyệt…';
  let translator;
  try {
    translator = await Translator.create({ sourceLanguage: source, targetLanguage: target, signal });
    for (const cue of original) {
      const position = translated.length;
      if (position % 15 === 0) captionMessage.textContent = 'Đang dịch phụ đề ' + position + '/' + original.length + '…';
      const text = await translator.translate(cue.text, { signal });
      translated.push({ ...cue, text });
    }
    if (signal.aborted) return;
    updateTracks(video, { ...video.tracks, [target]: translated });
    trackNote.textContent = 'Phụ đề từ YouTube và bản dịch tự động · Bấm vào câu để tua';
    setCaptionMessage('');
  } catch {
    if (!signal.aborted) setCaptionMessage('Trình duyệt chưa dịch được phụ đề. Bạn có thể thử lại.', target);
  } finally {
    translator?.destroy?.();
  }
}

// Tải YouTube IFrame API khi người xem bắt đầu phát.
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(fail, 12000);

    // Xóa phiên API lỗi để có thể thử lại.
    function fail() {
      clearTimeout(timer);
      script.remove();
      delete window.onYouTubeIframeAPIReady;
      apiLoading = undefined;
      reject(new Error('Không tải được API YouTube.'));
    }

    // Báo API đã sẵn sàng để tạo trình phát.
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      resolve();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.append(script);
  });
  return apiLoading;
}

// Báo lỗi phát và hiện lại nút thử lại cùng liên kết YouTube.
function playerError(session, message) {
  if (session !== state.session) return;
  stopPlayer();
  poster.hidden = false;
  poster.disabled = false;
  playLabel.textContent = 'Thử phát lại';
  status.textContent = message;
  status.hidden = false;
}

// Tua đến thời điểm đã chọn và yêu cầu YouTube phát.
function playAt(milliseconds) {
  if (milliseconds !== null) state.player.seekTo(milliseconds / 1000, true);
  state.player.playVideo();
}

// Xử lý khi trình phát nhúng sẵn sàng nhận lệnh.
function playerReady(session) {
  if (session !== state.session) return;
  clearTimeout(state.timeout);
  state.ready = true;
  poster.hidden = true;
  const timestamp = state.queuedTime;
  state.queuedTime = null;
  playAt(timestamp);
  state.poll = setInterval(syncCaptions, 180);
}

// Tạo iframe có thông tin trang nguồn để YouTube nhận diện yêu cầu nhúng.
async function startPlayback(timestamp = null) {
  if (state.ready) {
    playAt(timestamp);
    return;
  }
  state.queuedTime = timestamp;
  if (poster.disabled) return;
  status.hidden = true;
  poster.disabled = true;
  playLabel.textContent = 'Đang mở YouTube…';
  const session = state.session;
  try {
    await loadYouTubeApi();
    if (session !== state.session) return;
    const url = new URL('https://www.youtube.com/embed/' + state.video.id);
    url.search = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', rel: '0' });
    const frame = document.createElement('iframe');
    frame.src = url.href;
    frame.title = 'YouTube · ' + state.video.title;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    host.replaceChildren(frame);
    state.timeout = setTimeout(() => playerError(session, 'Trình phát không phản hồi. Bạn có thể thử lại hoặc mở YouTube.'), 14000);
    state.player = new window.YT.Player(frame, {
      events: {
        // Khởi chạy đồng bộ khi nhận được sự kiện sẵn sàng.
        onReady: () => playerReady(session),
        // Đọc lại phụ đề khi YouTube báo thay đổi trạng thái.
        onStateChange: (event) => {
          if (session !== state.session) return;
          if (event.data === window.YT.PlayerState.PLAYING) status.hidden = true;
          syncCaptions();
        },
        // Hiện điều hướng thay thế nếu YouTube chặn hoặc không tải được video.
        onError: () => playerError(session, 'YouTube không phát được video nhúng này. Hãy dùng liên kết “Xem trên YouTube”.'),
        // Nhắc dùng nút phát gốc nếu trình duyệt chặn lệnh phát tự động.
        onAutoplayBlocked: () => {
          if (session !== state.session) return;
          status.textContent = 'Bấm nút phát trong trình phát YouTube để bắt đầu.';
          status.hidden = false;
        },
      },
    });
  } catch {
    playerError(session, 'Không kết nối được với trình phát YouTube. Hãy thử lại hoặc mở liên kết YouTube.');
  }
}

// Kiểm tra link YouTube và mở video ngay trong khi trang tìm phụ đề.
function importVideo(event) {
  event.preventDefault();
  const url = document.getElementById('video-url').value.trim();
  let id;
  try {
    id = videoId(url);
  } catch {
    id = null;
  }
  if (!id) {
    formError.textContent = 'Hãy nhập link YouTube hợp lệ.';
    formError.hidden = false;
    return;
  }
  const title = document.getElementById('video-name').value.trim() || 'Video YouTube';
  showVideo({ id, url, title, cues: [] });
  dialog.close();
}

// Chọn ngôn ngữ đang có và giữ mốc phát khi đổi chế độ hiển thị.
function applyMode(language) {
  const hasEnglish = state.video.cues.some((cue) => cue.en);
  const hasVietnamese = state.video.cues.some((cue) => cue.vi);
  const available = { both: hasEnglish || hasVietnamese, en: hasEnglish, vi: hasVietnamese };
  list.dataset.mode = available[language] ? language : 'both';
  for (const mode of modes) {
    mode.disabled = !available[mode.dataset.mode];
    mode.setAttribute('aria-pressed', String(mode.dataset.mode === list.dataset.mode));
  }
  follow.disabled = !available.both;
  renderCues();
  highlight(state.active);
}

// Áp dụng chế độ ngôn ngữ vừa được chọn.
function changeMode(event) {
  const language = event.currentTarget.dataset.mode;
  if (list.dataset.mode !== language) applyMode(language);
}

// Chọn một mốc và tua video đến đầu câu phụ đề.
function selectCue(event) {
  const button = event.target.closest('button[data-index]');
  if (!button) return;
  const index = Number(button.dataset.index);
  highlight(index, false);
  void startPlayback(state.video.cues[index].start);
}

// Bật hoặc tắt tự cuộn mà vẫn tô sáng câu hiện tại.
function toggleFollow() {
  follow.setAttribute('aria-pressed', String(follow.getAttribute('aria-pressed') !== 'true'));
  highlight(state.active);
}

// Đăng ký các thao tác phát, mở video và chuyển chế độ phụ đề.
poster.addEventListener('click', () => startPlayback());
list.addEventListener('click', selectCue);
follow.addEventListener('click', toggleFollow);
translate.addEventListener('click', translateTrack);
for (const mode of modes) mode.addEventListener('click', changeMode);
document.getElementById('open-import').addEventListener('click', () => { formError.hidden = true; dialog.showModal(); });
document.getElementById('close-import').addEventListener('click', () => dialog.close());
form.addEventListener('submit', importVideo);
applyMode('both');
