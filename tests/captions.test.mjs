import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captionRows, cueAt, mergeCaptions } from '../public/captions.mjs';

// Tái hiện phụ đề tiếng Việt bắt đầu sớm hơn câu tiếng Anh tương ứng.
test('ghép mỗi câu dịch một lần dù hai bản có mốc lệch nhau', () => {
  const english = [
    { start: 28000, end: 31000, text: 'What is happening?' },
    { start: 31400, end: 34500, text: 'This is direct body control.' },
  ];
  const vietnamese = [
    { start: 28000, end: 30000, text: 'Chuyện gì đang xảy ra?' },
    { start: 30000, end: 34500, text: 'Đây là điều khiển cơ thể trực tiếp.' },
  ];
  assert.deepEqual(mergeCaptions(english, vietnamese), [
    { start: 28000, end: 31000, en: english[0].text, vi: vietnamese[0].text },
    { start: 31400, end: 34500, en: english[1].text, vi: vietnamese[1].text },
  ]);
  assert.deepEqual(captionRows(vietnamese, 'vi').map(({ start, vi }) => [start, vi]), [
    [28000, vietnamese[0].text],
    [30000, vietnamese[1].text],
  ]);
  assert.deepEqual(captionRows(english, 'en').map(({ start, en }) => [start, en]), [
    [28000, english[0].text],
    [31400, english[1].text],
  ]);
});

// Gộp đoạn trùng nhau cùng mốc nhưng giữ lời thật sự lặp lại sau khoảng lặng.
test('giữ câu lặp ở mốc khác và câu chỉ có trong một ngôn ngữ', () => {
  const vietnamese = [
    { start: 600, end: 1400, text: 'Được chứ.' },
    { start: 200, end: 1000, text: 'Được\nchứ.' },
    { start: 4200, end: 5100, text: 'Được chứ.' },
  ];
  const rows = mergeCaptions([{ start: 250, end: 1500, text: 'Sure.' }], vietnamese);
  assert.deepEqual(rows, [
    { start: 250, end: 1500, en: 'Sure.', vi: 'Được\nchứ.' },
    { start: 4200, end: 5100, en: '', vi: 'Được chứ.' },
  ]);
  assert.equal(cueAt(rows, 0), 0);
  assert.equal(cueAt(rows, 3500), 0);
  assert.equal(cueAt(rows, 4200), 1);
  assert.equal(cueAt(rows, 9000), 1);
});
