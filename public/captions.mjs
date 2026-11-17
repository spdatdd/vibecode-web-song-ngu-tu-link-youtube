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

// Giữ mốc gốc của từng ngôn ngữ và gộp các đoạn cùng chữ liền nhau hoặc chồng lấn.
export function captionRows(track, language) {
  const rows = [];
  const lastByText = new Map();
  for (const { start, end, text } of [...track].sort((first, second) => first.start - second.start)) {
    const key = text.normalize('NFC').replace(/\s+/g, ' ').trim();
    const previous = lastByText.get(key);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      continue;
    }
    const row = { start, end, en: '', vi: '', [language]: text };
    rows.push(row);
    lastByText.set(key, row);
  }
  return rows;
}

// Gắn mỗi đoạn tiếng Việt vào một dòng tiếng Anh có thời gian giao nhau nhiều nhất.
export function mergeCaptions(english, vietnamese) {
  const rows = captionRows(english, 'en');
  const unmatched = [];
  let firstCandidate = 0;
  for (const cue of captionRows(vietnamese, 'vi')) {
    while (firstCandidate < rows.length && rows[firstCandidate].end <= cue.start) {
      firstCandidate += 1;
    }
    let match;
    let longestOverlap = 0;
    for (let index = firstCandidate; index < rows.length && rows[index].start < cue.end; index += 1) {
      const row = rows[index];
      const overlap = Math.min(row.end, cue.end) - Math.max(row.start, cue.start);
      if (overlap > longestOverlap) {
        match = row;
        longestOverlap = overlap;
      }
    }
    if (match) match.vi = match.vi ? match.vi + '\n' + cue.vi : cue.vi;
    else unmatched.push(cue);
  }
  return [...rows, ...unmatched].sort((first, second) => first.start - second.start);
}

// Tìm dòng bắt đầu gần nhất tại mốc phát, kể cả khi hai đoạn chồng lấn.
export function cueAt(cues, time) {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (time < cues[middle].start) high = middle - 1;
    else low = middle + 1;
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
