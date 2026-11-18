# Deploy AmberTube lên Vercel

AmberTube là ứng dụng web tĩnh (React + Vite) và không cần backend. Vercel chỉ cần build ra thư mục `dist` rồi phục vụ các file trong đó. Repo đã có sẵn `vercel.json` với các thiết lập sau:

- **Rewrite mọi đường dẫn về `index.html`**: mở thẳng hoặc tải lại `/search`, `/focus`, `/library`… sẽ không bị lỗi 404.
- **Cache lâu cho `/assets/*`**: tên file trong thư mục này có mã hash nên cache an toàn.
- **Header bảo mật cơ bản**: chỉ cho phép dùng micro để tìm bằng giọng nói; camera và vị trí bị tắt.

---

## 1. Chọn tên miền

| Lựa chọn | Ví dụ | Chi phí | Ghi chú |
| --- | --- | --- | --- |
| **Tên miền miễn phí của Vercel** (nên dùng trước) | `ambertube.vercel.app` | 0 đ | Có ngay, HTTPS sẵn. Nếu tên đã có người dùng, đặt tên dự án khác như `ambertube-player` hoặc `ambertube-music`. |
| Tên miền riêng `.io.vn` | `ambertube.io.vn` | Rẻ, mua qua nhà đăng ký Việt Nam | Hợp với dự án cá nhân ở Việt Nam. Cần CCCD khi đăng ký. |
| Tên miền riêng `.app` | `ambertube.app` | Mua qua Vercel hoặc nhà đăng ký bất kỳ | `.app` bắt buộc HTTPS, Vercel tự cấp chứng chỉ. |
| Tên miền phụ của công ty | `music.<congty>.com.vn` | 0 đ (nhờ IT trỏ DNS) | Chỉ dùng khi công ty đồng ý. Xem lưu ý về YouTube ở mục 6. |

**Nên tránh:** tên miền có chữ `youtube` hoặc `yt` (ví dụ `youtube-music-vn.com`). Đây là thương hiệu của Google, dễ bị khiếu nại hoặc bị khóa API key.

> Mình không kiểm tra được tên miền nào còn trống. Hãy gõ thử tên ở mục **Domains** trong Vercel hoặc trên trang của nhà đăng ký.

---

## 2. Đưa code lên GitHub

```bash
cd ambertube
git init
git add .
git commit -m "AmberTube"
# tạo repo trống trên GitHub (có thể để Private), rồi:
git remote add origin https://github.com/<tai-khoan>/ambertube.git
git branch -M main
git push -u origin main
```

`.gitignore` đã loại `node_modules`, `dist`, `.env` và `.env.local`, nên **API key không bị đẩy lên GitHub**. Trước khi push, chạy `git status` để chắc chắn không có file `.env` nào trong danh sách.

---

## 3. Tạo dự án trên Vercel

**Cách A: qua giao diện web (dễ nhất)**

1. Đăng nhập [vercel.com](https://vercel.com) bằng GitHub, chọn **Add New… → Project**, rồi chọn repo `ambertube`.
2. **Project Name**: `ambertube`. Tên này quyết định địa chỉ `ambertube.vercel.app`.
3. Vercel tự nhận đây là dự án **Vite**. Các thông số build đã có trong `vercel.json` nên không cần sửa:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Mở mục **Environment Variables** và thêm biến:

   | Tên | Giá trị | Môi trường |
   | --- | --- | --- |
   | `VITE_YOUTUBE_API_KEY` | API key YouTube của bạn | Production (và Preview nếu muốn) |
   | `VITE_LYRICS_ENDPOINT` | *(tùy chọn)* | Production |
   | `VITE_CONVERSION_ENDPOINT` | *(tùy chọn)* | Production |
   | `VITE_AUTHORIZED_CHANNEL_IDS` | *(tùy chọn)* | Production |

5. Bấm **Deploy**. Khoảng 1 phút sau, app chạy tại `https://ambertube.vercel.app`.

**Cách B: dùng Vercel CLI**

```bash
npm i -g vercel
vercel login
vercel link                      # tạo/liên kết dự án "ambertube"
vercel env add VITE_YOUTUBE_API_KEY production
vercel --prod                    # build + deploy production
```

> **Quan trọng:** các biến `VITE_*` được **gắn vào code lúc build**. Sau khi thêm hoặc đổi biến môi trường, phải **Redeploy** (Deployments → ⋯ → Redeploy) thì thay đổi mới có hiệu lực.

Từ giờ, mỗi lần `git push` lên `main` thì Vercel tự deploy bản mới. Push lên nhánh khác thì Vercel tạo một bản xem thử (Preview) có link riêng.

---

## 4. Gắn tên miền riêng (nếu có)

1. Vào **Project → Settings → Domains → Add**, rồi nhập ví dụ `ambertube.io.vn` và `www.ambertube.io.vn`. Nên chọn chuyển hướng `www` về tên miền gốc.
2. Vercel hiện các bản ghi DNS cần tạo. Vào trang quản lý DNS ở nhà đăng ký và tạo **đúng giá trị Vercel hiển thị**. Thường là:

   | Loại | Tên (Host) | Giá trị |
   | --- | --- | --- |
   | `A` | `@` (tên miền gốc) | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

   Nếu dùng tên miền phụ như `music.congty.com.vn`, chỉ cần một bản ghi `CNAME` với tên `music`, trỏ tới giá trị Vercel đưa.
3. Chờ DNS cập nhật, thường vài phút, có khi tới vài giờ. Khi Vercel báo **Valid Configuration**, chứng chỉ HTTPS được cấp tự động.

Nếu mua tên miền ngay trong Vercel (Domains → Buy) thì DNS được cấu hình tự động, bỏ qua bước 2.

---

## 5. Khóa API key YouTube theo tên miền (bắt buộc)

App chạy hoàn toàn trên trình duyệt, nên **API key nằm trong file JS và ai cũng xem được**. Để người khác không lấy key dùng chỗ khác, hãy giới hạn key:

1. Vào [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) và chọn API key.
2. **Application restrictions** → **Websites**, rồi thêm:
   ```
   https://ambertube.vercel.app/*
   https://ambertube.io.vn/*          (tên miền riêng, nếu có)
   https://www.ambertube.io.vn/*
   http://localhost:5173/*            (để chạy dev trên máy)
   http://localhost:4173/*            (npm run preview)
   ```
   Không nên thêm `https://*.vercel.app/*`, vì như vậy mọi trang trên Vercel đều dùng được key của bạn. Nếu cần chạy key trên bản Preview, hãy thêm đúng địa chỉ preview của dự án.
3. **API restrictions** → **Restrict key** → chỉ chọn **YouTube Data API v3**.
4. Lưu lại. Thay đổi có thể mất vài phút mới có hiệu lực.

Key bạn từng dán trong cuộc trò chuyện nên được **thay mới** (Regenerate) trước khi đưa app lên mạng công khai.

---

## 6. Lưu ý trước khi công khai

- **Gói Hobby (miễn phí) của Vercel chỉ dành cho mục đích cá nhân, phi thương mại.** Nếu dùng cho công ty hoặc kiếm tiền, cần gói Pro.
- **Trình phát YouTube đang bị ẩn** (chế độ chỉ nghe nhạc). Điều này **vi phạm điều khoản YouTube API**: Google yêu cầu trình phát phải hiển thị, tối thiểu 200×200 px. Khi đưa app lên một địa chỉ công khai, Google dễ phát hiện và có thể khóa API key. Muốn an toàn hơn, sửa class `.yt-host` trong `src/styles/app.css` để hiện trình phát, hoặc chỉ dùng app cho riêng bạn.
- **Hạn mức YouTube Data API:** mặc định 10.000 đơn vị/ngày, mỗi lần tìm kiếm tốn khoảng 100 đơn vị. Nếu nhiều người cùng dùng thì sẽ nhanh hết hạn mức.
- **Tìm bằng giọng nói** cần HTTPS (Vercel có sẵn) và kết nối tới dịch vụ nhận dạng giọng nói của trình duyệt. Mạng công ty chặn dịch vụ này thì tính năng sẽ báo lỗi.
- **Dữ liệu người dùng** (lịch sử, yêu thích, playlist…) lưu trong trình duyệt của từng người (localStorage). Đổi sang tên miền khác thì dữ liệu cũ không tự chuyển theo.

---

## 7. Kiểm tra sau khi deploy

- [ ] Mở `https://<ten-mien>/search?q=lofi` rồi **tải lại trang (F5)**: không bị 404.
- [ ] Ô tìm kiếm trả về kết quả YouTube thật, không còn dòng "Danh mục demo…".
- [ ] Bấm một bài thì có tiếng. Hết bài thì Smart Autoplay tự chuyển bài.
- [ ] Mở `/focus` trực tiếp, rồi tải lại trang vẫn hoạt động.
- [ ] Trong Google Cloud Console, API key có lượt gọi từ tên miền mới và không bị lỗi `403 referer blocked`.

Nếu gặp lỗi **403 "Requests from referer … are blocked"**, tên miền chưa có trong danh sách Websites ở mục 5. Thêm vào, chờ vài phút rồi tải lại trang.
