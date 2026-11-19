# Tài khoản & đồng bộ (Supabase)

Supabase **chỉ** dùng để lưu tài khoản và dữ liệu cá nhân: yêu thích, playlist, lịch sử, cài đặt.
Nhạc vẫn lấy từ YouTube (IFrame Player + Data API) và Last.fm như cũ. AmberTube không lưu và không tải file nhạc nào.
Không đăng nhập vẫn tìm và nghe nhạc bình thường (chế độ khách).

## 1. Tạo bảng (chạy một lần)

1. Supabase Dashboard → **SQL Editor → New query**.
2. Dán toàn bộ `supabase/migrations/0001_init.sql` rồi **Run**. Chạy lại nhiều lần vẫn an toàn.
   - Nên **tải file về rồi mở bằng trình soạn thảo** trước khi copy. Copy từ khung xem trước có thể đổi khoảng trắng thành ký tự "non-breaking space". Khi đó Postgres báo `syntax error` ở các dòng thụt lề.
   - Nếu vẫn lỗi, dùng `ambertube_supabase_setup.sql`: cùng nội dung nhưng không thụt dòng, không ghi chú.

Kết quả:

| Bảng | Nội dung |
|---|---|
| `profiles` | tên hiển thị, ảnh đại diện (tạo khi đăng ký) |
| `favorites` | bài yêu thích: `provider` + `track_id` (videoId YouTube) + thông tin gọn của bài |
| `listening_history` | `kind='recent'`: nghe gần đây; `kind='listen'`: từng phiên nghe (thống kê, gợi ý) |
| `search_history` | từ khóa đã tìm |
| `playlists`, `playlist_tracks` | playlist và các bài trong đó |
| `user_settings` | cài đặt, gộp theo từng mục (`{ "<mục>": { "v": giá trị, "t": thời điểm } }`) |

**Bảo mật:**
- Mọi bảng đều bật **Row Level Security**: mỗi người chỉ đọc và sửa được dòng của chính mình (`user_id = auth.uid()`).
- Người chưa đăng nhập (`anon`) không có quyền nào.
- Chỉ thêm được bài vào playlist của chính mình.
- Database tự kiểm tra provider, độ dài, kích thước dữ liệu, và không chấp nhận giờ máy khách ở tương lai.

## 1b. Giới hạn dung lượng mỗi tài khoản (`0002_limits.sql`, phương án B)

1. **Database → Extensions → pg_cron → Enable**: bật bộ hẹn giờ cho việc dọn dẹp hằng ngày.
2. SQL Editor → New query → dán `supabase/migrations/0002_limits.sql` → Run. Nếu copy bị lỗi khoảng trắng, dùng bản dễ dán `supabase/ambertube_supabase_limits.sql`.
3. Kiểm tra: `select * from cron.job;` phải có `ambertube-cleanup`, chạy lúc 03:17 UTC mỗi ngày.

| Dữ liệu | Giới hạn mỗi user | Khi vượt |
|---|---|---|
| Yêu thích | 5.000 bài | chặn, app báo "Đã đạt tối đa 5.000 bài yêu thích" |
| Playlist | 200 playlist | chặn |
| Bài trong playlist | 1.000 bài mỗi playlist, tổng 5.000 bài | chặn |
| Nghe gần đây | 500 dòng mới nhất | dòng cũ tự bị xóa |
| Thống kê nghe | 2.000 dòng, tối đa 180 ngày | dòng cũ tự bị xóa |
| Lịch sử tìm kiếm | 100 từ khóa mới nhất | từ khóa cũ tự bị xóa |
| Dòng đánh dấu đã xóa | giữ 90 ngày | xóa hẳn (job hằng ngày) |

Dung lượng: tối đa khoảng 10 MB mỗi user, user bình thường khoảng 1,7 MB. Gói Free 500 MB chứa được khoảng 250–290 user bình thường.

- **App kiểm tra trước** các giới hạn bị chặn, để báo rõ ràng thay vì lỗi đồng bộ.
- **Nếu database vẫn từ chối** (ví dụ 2 máy cùng thêm một lúc): mục đó nằm lại trên máy, user được báo, và app không gửi lại liên tục. Khi user xóa bớt cho có chỗ, app tự gửi lại.
- **Gộp dữ liệu khách** cũng tuân theo các giới hạn này và báo số mục không gộp được.
- **Trang `/account`** hiện mức đang dùng so với giới hạn và số MB (hàm `ambertube_my_usage()`).
- **Máy không mở app hơn 90 ngày** có thể không nhận được một số lần xóa cũ, vì dấu xóa đã bị dọn. Khi đó user xóa lại bằng tay.

## 2. Đăng nhập

**Authentication → Sign In / Providers**
- **Email**: bật *Enable Email provider*.
  - *Confirm email*: tắt thì đăng ký xong vào ngay; bật thì phải bấm link trong mail.
  - Khi chạy thật nên cấu hình SMTP riêng, vì mail mặc định của Supabase bị giới hạn số thư.
- **Google** (tùy chọn):
  1. Tạo OAuth client (Web application) trong Google Cloud Console.
  2. Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
  3. Dán Client ID và Secret vào Supabase.
  4. Nút "Tiếp tục với Google" tự hiện khi Google đã bật, và tự ẩn khi tắt.

**Authentication → URL Configuration**
- Site URL: `https://amber-tube.vercel.app`
- Redirect URLs: `https://amber-tube.vercel.app/**`, `http://localhost:5173/**`, `http://localhost:4173/**`
  (cần cho Google, link xác nhận email và link quên mật khẩu → `/auth/reset`).

## 3. Cấu hình app

`.env` (và Vercel → Settings → Environment Variables, rồi **Redeploy**):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon hoặc publishable key>
```

- Có hay không có đuôi `/rest/v1/` trong URL đều được.
- **Không bao giờ** dùng `service_role` / `sb_secret_…`. Biến `VITE_*` nằm trong code chạy trên trình duyệt. Nếu lỡ điền secret key, app từ chối chạy phần tài khoản và báo lỗi trong console.
- Không cấu hình thì AmberTube chạy như cũ (chỉ chế độ khách), và không tải thêm thư viện Supabase nào.

## 4. Cách đồng bộ hoạt động

- **Lưu trên máy trước:** app luôn đọc và ghi bản trên máy, nên tắt mạng vẫn dùng bình thường. Việc đồng bộ chạy nền, không bao giờ chặn việc phát nhạc.
- **Khi nào đồng bộ:**
  - lúc đăng nhập;
  - khoảng 1,5 giây sau mỗi thay đổi;
  - ngay khi máy khác thay đổi (Supabase Realtime);
  - khi có mạng lại hoặc quay lại tab;
  - mỗi 90 giây nếu Realtime không kết nối được.
- **Xung đột:** thay đổi nào mới hơn thì giữ. So sánh theo từng bài, từng playlist, từng mục cài đặt, không ghi đè cả danh sách.
- **Thay đổi cũ:** máy offline lâu quay lại không ghi đè được thay đổi mới hơn, vì database bỏ qua lần ghi cũ hơn.
- **Xóa:** đánh dấu `deleted = true` để mọi máy đều biết. Giới hạn trên máy (200 bài nghe gần đây, 25 lượt tìm, 120 ngày nghe) **không** xóa dữ liệu trên cloud.
- **Lỗi:**
  - Mất mạng hoặc lỗi máy chủ: giữ thay đổi và thử lại sau 5 giây → 15 giây → 30 giây → 1 phút → 2 phút.
  - Phiên hết hạn: hiện "Phiên đăng nhập đã hết hạn"; dữ liệu vẫn hiển thị và được giữ lại, đăng nhập lại thì gửi tiếp.
- **Máy mới:** cài đặt mặc định của máy mới không ghi đè cài đặt có sẵn của tài khoản.
- **Dữ liệu từ khi chưa đăng nhập:** lần đầu đăng nhập, app hỏi *Gộp vào tài khoản / Không / Để sau*.
  - Gộp không tạo bản trùng: bài trùng chỉ giữ một bản, playlist cùng tên được gộp làm một.
  - Không ghi đè dữ liệu cloud, và bản trên máy giữ nguyên.
- **Đăng xuất:** máy trở về dữ liệu khách, và bản sao của tài khoản trên máy bị xóa (phù hợp màn hình dùng chung như VF5).
- **Riêng từng máy (không đồng bộ):** hàng đợi, âm lượng, Car View, bộ hẹn giờ Tập trung, các bộ nhớ đệm.

## 5. Kiểm thử

```bash
npm test          # đồng bộ: gộp, xung đột, offline, bản ghi đã xóa, máy mới, tách tài khoản…
npm run test:db   # SQL thật (PGlite): RLS 7 bảng, chặn ghi cũ, gộp cài đặt, kiểm tra dữ liệu, giới hạn dung lượng
# E2E đăng nhập + đồng bộ 2 thiết bị (Supabase giả lập cục bộ, chạy đúng file migration):
node e2e/fake-supabase.mjs 54321 &
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=sb_publishable_test_key_for_fake_server_123 \
  VITE_YOUTUBE_API_KEY=TEST_KEY npx vite build --outDir /tmp/dist-sync
npx vite preview --outDir /tmp/dist-sync --port 4175 &
node e2e/auth-sync.cjs
```

Server giả lập không có Realtime, nên bộ E2E dựa vào việc quay lại tab và cơ chế polling. Realtime đã được kiểm tra trên project Supabase thật.
