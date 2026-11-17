# Web học tiếng Anh song ngữ từ link YouTube

Dán link YouTube để xem video và đọc phụ đề Anh–Việt theo mốc thời gian. Ứng dụng lấy transcript qua Supadata và hiển thị danh sách có thể cuộn ngay bên dưới video.

- Khi phát hoặc tua trên thanh thời lượng YouTube, dòng tương ứng được tô sáng. Bật **Tự cuộn** để danh sách đi theo video.
- Bấm vào một dòng phụ đề để tua video đến đầu dòng đó.
- Chuyển giữa chế độ **Song ngữ**, **English** và **Tiếng Việt** tùy theo bản phụ đề có sẵn.

## Chạy trên Windows với PowerShell

Cần Git, Node.js 22 trở lên, trình duyệt và khóa API [Supadata](https://dash.supadata.ai/). Dự án dùng JavaScript thuần và các mô-đun tích hợp trong Node.js.

1. Tải mã nguồn, tạo tệp cấu hình và build.

   ```powershell
   git clone https://github.com/spdatdd/vibecode-web-song-ngu-tu-link-youtube.git
   Set-Location vibecode-web-song-ngu-tu-link-youtube
   Copy-Item .env.example .env
   node scripts/build.mjs
   ```

2. Mở `.env` và điền khóa vào `SUPADATA_API_KEY=`. Git bỏ qua tệp `.env`.

3. Chạy đoạn dưới đây trong thư mục dự án để mở giao diện và API trên cùng một địa chỉ.

   ```powershell
   @'
   import { createServer } from 'node:http';
   import worker from './dist/server/index.js';

   const origin = 'http://127.0.0.1:8787';

   // Chuyển yêu cầu HTTP trên máy vào Worker phục vụ giao diện và phụ đề.
   const server = createServer(async (request, response) => {
     try {
       const result = await worker.fetch(
         new Request(origin + request.url, { method: request.method }),
         process.env,
       );
       response.writeHead(result.status, Object.fromEntries(result.headers));
       response.end(Buffer.from(await result.arrayBuffer()));
     } catch {
       response.writeHead(500).end('Lỗi máy chủ.');
     }
   });

   // Lắng nghe trên máy hiện tại và in địa chỉ mở trong trình duyệt.
   server.listen(8787, '127.0.0.1', () => console.log(origin));
   '@ | node --env-file=.env --input-type=module -
   ```

4. Mở [trang chạy trên máy](http://127.0.0.1:8787/), chọn **Mở video** và dán link YouTube. Có thể thử với [Sleep Is Your Superpower](https://youtu.be/5MuIMqhT8DM). Nhấn `Ctrl+C` trong PowerShell để dừng máy chủ. Sau khi sửa mã nguồn, build lại rồi khởi động lại máy chủ.

## Cấu trúc dự án

| Đường dẫn | Vai trò |
| --- | --- |
| `public/index.html`, `public/styles.css` | Giao diện trình phát và danh sách phụ đề |
| `public/app.js` | Mở video YouTube, tải phụ đề từ API và đồng bộ khi phát hoặc tua |
| `public/captions.mjs` | Kiểm tra link, ghép các bản phụ đề theo mốc thời gian và tìm dòng đang phát |
| `worker/index.mjs` | Phục vụ giao diện và gọi Supadata tại `/api/captions` |
| `scripts/build.mjs` | Đóng gói mã nguồn thành `dist/server/index.js` |

## Phụ đề và triển khai

Video cần cho phép phát nhúng và Supadata cần trả về phụ đề tiếng Anh hoặc tiếng Việt. Nếu video chỉ có một bản phụ đề, trang hiển thị bản đó. Trình duyệt hỗ trợ Translator API có thể hiện nút dịch sang ngôn ngữ còn lại.

Khi triển khai trên môi trường Cloudflare Workers tương thích, dùng `dist/server/index.js` làm mô-đun đầu vào và đặt `SUPADATA_API_KEY` dưới dạng secret của Worker.
