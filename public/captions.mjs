// Nhận diện đường dẫn YouTube phổ biến và trả về ID hợp lệ.
export function videoId(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split('/').filter(Boolean);
  let id;
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  if (host === 'youtu.be') {
    id = path[0];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
    id = path[0] === 'watch' ? url.searchParams.get('v') : undefined;
    if (['embed', 'shorts', 'live'].includes(path[0])) id = path[1];
  }
  return /^[a-zA-Z0-9_-]{11}$/.test(id ?? '') ? id : null;
}

// Ghép hai bản phụ đề theo các khoảng thời gian thực tế, kể cả khi tách câu khác nhau.
export function mergeCaptions(english, vietnamese) {
  const events = [];
  for (const [language, track] of [['en', english], ['vi', vietnamese]]) {
    for (const cue of track) {
      events.push({ at: cue.start, opening: true, cue, language });
      events.push({ at: cue.end, opening: false, cue, language });
    }
  }
  events.sort((first, second) => first.at - second.at);
  const active = { en: new Set(), vi: new Set() };
  const merged = [];
  let previous = events[0]?.at ?? 0;
  for (const { at, opening, cue, language } of events) {
    if (at > previous && (active.en.size || active.vi.size)) {
      const en = trackText(active.en);
      const vi = trackText(active.vi);
      const last = merged.at(-1);
      if (last?.end === previous && last.en === en && last.vi === vi) {
        last.end = at;
      } else {
        merged.push({ start: previous, end: at, en, vi });
      }
    }
    if (opening) active[language].add(cue);
    else active[language].delete(cue);
    previous = at;
  }
  return merged;
}

// Gom các dòng cùng ngôn ngữ đang xuất hiện tại một thời điểm.
function trackText(active) {
  return [...new Set([...active].map((cue) => cue.text))].join('\n');
}

// Tìm câu ở mốc phát, giữ câu vừa qua khi người xem tua đến khoảng lặng.
export function cueAt(cues, time) {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (time < cue.start) high = middle - 1;
    else if (time >= cue.end) low = middle + 1;
    else return middle;
  }
  return cues.length ? Math.max(0, high) : -1;
}

// Chuyển mốc thời gian thành nhãn phút:giây hoặc giờ:phút:giây.
export function timecode(milliseconds) {
  const total = Math.floor(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0');
  return hours ? hours + ':' + minutes + ':' + seconds : minutes + ':' + seconds;
}
