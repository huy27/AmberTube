# AmberTube Music Player

Trình phát nhạc YouTube dành cho máy tính, viết bằng React + TypeScript + Vite. Giao diện theo thiết kế AmberTube: nền than chì, màu nhấn hổ phách `#FFB43B`, thanh bên cố định, ô tìm kiếm ở trên và thanh phát nhạc luôn hiển thị ở dưới.

## Chạy dự án

```bash
npm install
cp .env.example .env    # không bắt buộc, xem bên dưới
npm run dev             # http://localhost:5173
npm run build           # kiểm tra kiểu (tsc) + build production vào dist/
npm test                # unit test (Node test runner, không cần thư viện thêm)
```

Nếu không có `.env`, ứng dụng dùng danh mục demo có sẵn. Mọi tính năng đều thử được mà không cần mạng.

## Deploy

Xem [DEPLOY.md](DEPLOY.md) để biết cách đưa app lên Vercel (`ambertube.vercel.app` hoặc tên miền riêng), khóa API key theo tên miền và các lưu ý trước khi công khai.

## Cấu hình (`.env`)

| Biến | Mục đích |
| --- | --- |
| `VITE_YOUTUBE_API_KEY` | Khóa YouTube Data API v3: bật tìm kiếm YouTube thật. |
| `VITE_LYRICS_ENDPOINT` | Dịch vụ lời bài hát **có bản quyền** của bạn (Musixmatch, LyricFind…). |
| `VITE_CONVERSION_ENDPOINT` | Backend chuyển đổi MP3 của bạn (xem mục "Tải xuống"). |
| `VITE_AUTHORIZED_CHANNEL_IDS` | ID các kênh bạn sở hữu hoặc có quyền tải, cách nhau bằng dấu phẩy. |

## Tính năng

| # | Tính năng | Cách dùng |
| --- | --- | --- |
| 1 | **Tốc độ phát** 0.5x–2.0x | Nút `1.0x` ở thanh phát. Chỉ hiện các tốc độ nguồn phát hỗ trợ (ví dụ: livestream chỉ có 1.0x). Áp dụng ngay và được ghi nhớ. |
| 2 | **Tìm kiếm bằng giọng nói** | Nút micro trong ô tìm kiếm, nút `VI/EN` để đổi ngôn ngữ. Văn bản nhận dạng được điền vào ô để bạn sửa, sau đó bấm Enter để tìm. Có xử lý lỗi quyền micro, và khi trình duyệt không hỗ trợ thì quay về tìm kiếm bằng chữ. |
| 3 | **Hàng đợi thông minh** | Phím `Q` hoặc nút hàng đợi. Phát tiếp theo, thêm vào hàng đợi, xóa, kéo thả để sắp xếp (hoặc `Alt + ↑/↓`), xóa hết. Tự động phát bài kế tiếp và bỏ qua video không phát được. |
| 4 | **Lời bài hát** | Phím `L`. Hỗ trợ lời đồng bộ (LRC): tô sáng dòng hiện tại, tự cuộn theo nhạc, bấm vào một dòng để tua đến đó. Có thông báo khi không có lời, và cho phép nhập file `.lrc`/`.txt`. |
| 5 | **Hẹn giờ tắt** | Biểu tượng mặt trăng: 15/30/45/60 phút hoặc hết bài hiện tại. Hiển thị thời gian còn lại và có thể hủy. |
| 6 | **Hiệu ứng âm thanh** | Bấm vào hiệu ứng để đổi giữa dạng sóng và phổ tần. Có bản thu gọn (thanh phát) và bản mở rộng (Focus mode). |
| 7 | **Lịch sử nghe** | Trang History: nhóm theo ngày, có giờ nghe, nút Phát lại, Xóa từng mục, Xóa hết. |
| 8 | **Phím tắt** | Xem bảng đầy đủ trong Settings. Không kích hoạt khi đang gõ chữ. |
| 9 | **Mood & Discovery** | 10 thể loại ở Home và trang Search. Bấm vào thể loại nào thì app tìm kiếm YouTube theo thể loại đó. |
| 10 | **Chế độ Tập trung** | Mục **Tập trung** ở thanh bên, phím `F` hoặc bấm ảnh bìa. Xem mục bên dưới. |
| 11 | **Ghi nhớ** | Tốc độ, âm lượng, trộn bài, lặp lại, bài đang nghe và vị trí đang nghe, hàng đợi, yêu thích, lịch sử. Tất cả lưu bằng localStorage. |

Ngoài ra, ở **My Library › Local files**, bạn có thể nghe file nhạc trên máy (MP3, WAV, M4A…). File không được upload đi đâu cả.

### Phím tắt

| Phím | Chức năng |
| --- | --- |
| `Space` | Phát / tạm dừng |
| `Ctrl + →` / `Ctrl + ←` | Bài tiếp theo / bài trước |
| `↑` / `↓` | Tăng / giảm âm lượng 5% |
| `M` | Tắt / bật tiếng |
| `S` | Bật / tắt trộn bài |
| `R` | Lặp lại: tắt → tất cả → một bài |
| `L` / `Q` / `F` | Lời bài hát / hàng đợi / chế độ Tập trung |
| `/` hoặc `Ctrl + K` | Chuyển đến ô tìm kiếm |
| `Esc` | Đóng bảng bên |

## Car View (màn hình 7 inch nằm ngang, ví dụ VinFast VF5)

Nút **Máy tính / Car View** nằm trên thanh đầu trang, trong menu và trong Cài đặt. Chuyển ngay lập tức, không tải lại trang và không đổi URL. Bài đang phát, vị trí đang nghe, hàng đợi, âm lượng và ô tìm kiếm đều giữ nguyên. Lựa chọn được lưu lại. Trên màn hình nhỏ nằm ngang, app chỉ **gợi ý** bật Car View chứ không tự chuyển.

- Thanh bên được thay bằng nút menu (ngăn kéo điều hướng). Ô tìm kiếm luôn hiện ở trên cùng, nút cao 48–56 px.
- Trang chủ ưu tiên: Nghe tiếp → Daily Mix / Smart Radio → Tâm trạng (một hàng vuốt ngang) → Dành cho bạn. Ẩn lời chào để dành chỗ cho nhạc.
- Kết quả tìm kiếm là các hàng gọn có nút Thêm vào hàng đợi và Thêm.
- Trình phát gọn: ảnh bìa, tên bài, nghệ sĩ, bài tiếp theo, Trước / Phát / Tiếp cỡ lớn, nút Tự phát, menu phụ (trộn bài, lặp lại, tốc độ, hẹn giờ, hàng đợi, lời bài hát).
- Màn hình **Đang phát** (bấm vào bài ở trình phát) hiện đủ nút điều khiển mà không phải cuộn.
- Khi bàn phím ảo mở, trình phát tạm ẩn. Danh sách gợi ý tìm kiếm không bao giờ đè lên trình phát.
- Đã kiểm thử ở 800×480, 854×480, 1024×600, 1280×720: không tràn ngang, nội dung không bị che, nút bấm ≥ 44 px.
- Đây là web app chạy trong trình duyệt của xe, **không phải** ứng dụng CarPlay hay Android Auto. App chỉ phát âm thanh, không tự mở video.

## Tìm kiếm thông minh

- **Gợi ý khi gõ:** chờ 300 ms sau lần gõ cuối mới gợi ý, bỏ qua kết quả cũ, tô đậm phần khớp. Gợi ý gồm: tìm kiếm gần đây, truy vấn đã tìm, bài hát, nghệ sĩ, video, kênh, thịnh hành.
- **Dữ liệu thật:** API chính thức của YouTube không có endpoint gợi ý từ khóa, nên gợi ý lấy từ lịch sử tìm kiếm, kết quả đã lưu tạm (12 giờ), thư viện của bạn và mục thịnh hành (`videos.list chart=mostPopular`, 1 đơn vị quota, lưu tạm 6 giờ). Không dùng endpoint nội bộ của YouTube. Bài hát và nghệ sĩ chỉ được nhận diện từ metadata thật, ví dụ tiêu đề dạng "Nghệ sĩ - Bài" hoặc kênh "- Topic".
- **Thông minh:** không phân biệt dấu tiếng Việt và hoa/thường ("son tung" khớp "Sơn Tùng"), khớp một phần, và chịu được lỗi gõ (sai 1–2 ký tự).
- **Lịch sử tìm kiếm:** tối đa 25 mục, không lặp, xóa từng mục hoặc xóa hết.
- **Bàn phím:** ↑/↓ chọn gợi ý, Enter tìm hoặc chọn, Esc đóng. Bấm ra ngoài cũng đóng.
- Một truy vấn chỉ gọi API một lần, kể cả khi bấm tìm nhiều lần liên tiếp.

## Gợi ý cá nhân hóa & Smart Autoplay

- **Theo dõi nghe:** ghi thời gian thực sự nghe, tỷ lệ nghe hết và lý do kết thúc (hết bài / bỏ qua / chuyển bài). Một bài chỉ tính là "đã nghe" khi nghe ≥ 30 giây (hoặc gần hết bài ngắn). Bấm vào rồi bỏ qua ngay thì tính là bỏ qua, không phải sở thích. Dữ liệu giữ 120 ngày và xóa được trong Cài đặt.
- **Nhận diện bài hát (`src/recommend/identity.ts`):** Official Audio, MV, Lyrics, kênh "- Topic" và bản tải lại của **cùng một bài** được coi là một bài, so sánh theo nghệ sĩ + tên bài đã chuẩn hóa + độ dài. Chỉ giữ một bản đại diện, ưu tiên Topic → Official Audio → MV. Remix, Live, Acoustic, Cover, Instrumental, Extended, Remaster… vẫn được tính là **bài khác**. Hai bài có số khác nhau (Part 1 / Part 2) không bao giờ bị gộp.
- **Thuật toán (`src/recommend/engine.ts`):** chấm điểm theo quy tắc rõ ràng, chạy hoàn toàn trên máy, **không dùng AI**. Không so khớp chữ trong tiêu đề. Trọng số chỉnh được trong `DEFAULT_WEIGHTS` / `MODE_WEIGHTS`:
  - phong cách / thể loại: 25%;
  - nghệ sĩ (cùng nghệ sĩ, hợp tác, thường nghe cùng): 20%;
  - thói quen nghe: 20%;
  - yêu thích: 15%;
  - ngôn ngữ: 10%;
  - khám phá: 10%.
  - Bị trừ điểm khi: đã nghe hôm nay, hay bị bỏ qua, vừa gợi ý ở lần làm mới trước, là bản mix dài hàng giờ trong khi bài gốc chỉ vài phút, hoặc không có liên hệ gì với bài gốc.
- **Thể loại lấy từ đâu:** từ tag và tiêu đề video do người đăng đặt (YouTube không cung cấp đặc trưng âm thanh), nên chỉ là ước lượng. Nếu không biết thể loại, app chỉ dùng tín hiệu ngôn ngữ chung và không đoán bừa.
- **Đa dạng:** tối đa 2 bài mỗi nghệ sĩ trong một lượt (Radio nghệ sĩ cho phép 4), không phát 2 bài liền nhau của cùng nghệ sĩ, xen bài quen với bài mới.
  - Không lặp bài vừa nghe trong 30 phút.
  - Bài đã nghe trong 3 giờ gần đây chỉ được dùng để lấp chỗ trống khi không còn bài phù hợp hơn.
  - App nhớ các bài vừa gợi ý trong 3 ngày để lần làm mới sau ra danh sách khác.
- **Lý do gợi ý:** chỉ ghi lý do có dữ liệu thật đứng sau, ví dụ "Cùng nghệ sĩ…", "Tương tự bài đang phát · ballad", "Nghệ sĩ liên quan", "Dựa trên lịch sử nghe", "Cùng ngôn ngữ". Không có lý do thì để trống.
- **Trang chủ:** Dành cho bạn, Vì bạn đã nghe…, Daily Mix, Smart Radio, **Radio của tôi**, Khám phá tuần này, Nghệ sĩ tương tự, Nghe tiếp.
- **Phản hồi:**
  - Yêu thích.
  - **Không thích bài này:** chặn mọi bản tải lên của bài đó.
  - Không quan tâm.
  - Không gợi ý nghệ sĩ này.
  - Thêm bài như này / Bớt bài như này.
  - Bỏ qua bài chỉ là tín hiệu tiêu cực nhẹ, không bị tính là "không thích".
- **Radio:** mỗi loại có chiến lược riêng.
  - **Radio bài hát:** chọn "Bắt đầu Radio" trong menu Thêm.
  - **Radio nghệ sĩ:** chọn trong menu Thêm.
  - **Radio của tôi:** trên Trang chủ.
  - **Radio tâm trạng:** nút sóng radio trên từng ô tâm trạng.
- **Smart Autoplay:** nút ∞ trên trình phát và mục điều khiển trong Hàng đợi, có 3 chế độ: Giống bài này / Cân bằng (mặc định) / Khám phá.
  - Bấm một kết quả tìm kiếm chỉ phát đúng bài đó. Hết bài thì app tự phát tiếp các bài gợi ý.
  - Khi chỉ còn ≤ 2 bài trong hàng đợi, app tự thêm tối đa 8 bài gợi ý.
  - App không thêm trùng bài (so theo nhận diện bài hát, không chỉ theo ID video), và bài gợi ý luôn nằm sau các bài bạn tự thêm.
  - Khi có API key mà gợi ý còn ít, app tìm thêm trong **danh mục Âm nhạc của YouTube**, theo nghệ sĩ liên quan rồi theo phong cách + ngôn ngữ. App **không bao giờ tìm theo tên bài**, vì cách đó chỉ ra các bản tải lại của cùng bài.
  - Bật ∞ thì cài đặt "Tự động phát" cũng tự bật theo.
  - Nếu hàng đợi hết trước khi gợi ý kịp về, app tự phát tiếp ngay khi có gợi ý.
  - Trình phát YouTube có cơ chế dự phòng: nếu mất sự kiện "hết bài", app kiểm tra trạng thái mỗi giây để vẫn tự chuyển bài.
  - Không đủ bài phù hợp thì app gợi ý ít hơn, không chèn bài không liên quan.
- **Giới hạn API:** mỗi ngày dùng tối đa 20 lượt tìm kiếm phụ cho gợi ý, kết quả được lưu tạm. Nếu hết quota, app dùng dữ liệu sẵn có.
- **Trình duyệt chặn tự phát:** app hiện thông báo rõ ràng kèm nút "Tiếp tục phát", và không tìm cách lách quy định của trình duyệt.

## Chế độ Tập trung (`/focus`)

Không gian làm việc toàn màn hình: ẩn thanh bên, ô tìm kiếm và kết quả, chỉ giữ bài đang phát, ảnh bìa, đồng hồ Pomodoro, tiến độ phiên và nút Thoát.

- **Đồng hồ Pomodoro:** 25 phút mặc định, có thể chọn 15/25/45/50/60 phút hoặc tùy chỉnh. Chu kỳ: Tập trung → Nghỉ ngắn (×3) → Nghỉ dài sau 4 phiên. Có Bắt đầu, Tạm dừng, Tiếp tục, Đặt lại, Bỏ qua, và tự chuyển phiên (tùy chọn).
- **Không lệch giờ:** thời gian còn lại luôn tính từ mốc kết thúc (`endsAt`), không đếm lùi. Khi tab bị ngủ, app tự bắt kịp ngay lúc tab hiện lại, kể cả khi đã qua nhiều phiên.
- **Một đồng hồ duy nhất:** `PomodoroController` nằm phía trên router nên đồng hồ vẫn chạy khi bạn chuyển trang (có viên đếm giờ trên thanh trên). Nhiều tab đồng bộ với nhau qua localStorage, và mỗi phiên chỉ được tính một lần.
- **Nhạc:** dùng lại đúng trình phát và hàng đợi của app, không tạo trình phát mới. Vào hay ra khỏi chế độ Tập trung nhạc vẫn phát liên tục. Có tùy chọn "Tạm dừng nhạc khi nghỉ".
- **Âm thanh nền:** Mưa, Sóng biển, Rừng, Lửa bập bùng, Gió, Quán cà phê, Tiếng ồn trắng. Mỗi âm có thanh âm lượng riêng, bật nhiều âm cùng lúc và tắt tiếng chung được. Âm thanh **được tổng hợp bằng Web Audio API** ngay trên máy (không dùng file ghi âm nên không có vấn đề bản quyền), và được giải phóng khi thoát.
- **Hình nền:** 3 kiểu Amber Glow / Midnight / Forest, làm mờ theo ảnh bìa, hạt sáng chuyển động. Chỉ dùng hoạt ảnh CSS transform/opacity cho nhẹ máy, và tự tắt khi bật "giảm chuyển động" của hệ điều hành.
- **Thống kê hôm nay:** số phiên đã xong / mục tiêu, tổng phút, phiên hiện tại, % mục tiêu và biểu đồ 7 ngày.
- **Hoàn thành phiên:** hoạt ảnh, lời chúc, âm báo, thông báo trên màn hình (tùy chọn), và lựa chọn bắt đầu nghỉ hoặc tập trung tiếp. Nhạc không bị dừng trừ khi bạn bật tùy chọn đó.
- **Phím tắt riêng:** `Space` phát/tạm dừng nhạc, `P` bắt đầu/tạm dừng đồng hồ, `R` đặt lại, `N` bài tiếp, `M` tắt tiếng, `F` toàn màn hình, `Esc` thoát.
- **Giao diện thích ứng:** máy tính có 3 cột; máy tính bảng thu bảng âm thanh nền và thống kê vào nút trên đầu trang; điện thoại xếp dọc, đồng hồ lớn và nút dễ bấm.

Mã nguồn nằm trong `src/focus/`: `pomodoro.ts` (logic thuần, có unit test), `stats.ts`, `settings.ts`, `ambient.ts`, `audio.ts`, `PomodoroController.tsx` và thư mục `components/`.

## Kiến trúc

```
src/
  types.ts                   kiểu dữ liệu dùng chung (Track, HistoryEntry, Lyrics…)
  playback/                  logic phát nhạc, KHÔNG phụ thuộc giao diện
    engines/                 mỗi nguồn phát một engine, cùng một interface PlaybackEngine
      youtubeEngine.ts       YouTube IFrame Player API
      htmlAudioEngine.ts     file trên máy (<audio> + Web Audio AnalyserNode)
      demoEngine.ts          đồng hồ mô phỏng cho danh mục demo
    queue.ts                 thao tác hàng đợi (hàm thuần): thêm, chèn, xóa, kéo thả, chọn bài kế tiếp/trộn bài
    speeds.ts                tốc độ hỗ trợ theo từng nguồn phát
    persistence.ts           lưu/khôi phục trạng thái trình phát
    playback.test.ts         unit test
  context/
    PlayerContext.tsx        điều phối engine + hàng đợi + hẹn giờ; vị trí phát nằm ở context riêng để giảm render lại
    LibraryContext.tsx       yêu thích, lịch sử, playlist, tải xuống, cài đặt, file trên máy
    UIContext.tsx            trạng thái hiển thị: bảng bên, Focus mode, toàn màn hình
  hooks/                     phím tắt, nhận dạng giọng nói, lời bài hát, đóng popover
  services/                  YouTube, lời bài hát + parser LRC, tải xuống, định dạng
  components/  pages/        giao diện
e2e/                         kiểm thử end-to-end bằng Playwright
```

## Lời bài hát: chỉ dùng nguồn được phép

Lời bài hát chỉ lấy từ ba nguồn:

1. File `.lrc`/`.txt` bạn tự nhập, lưu trên máy.
2. Lời gốc viết riêng cho danh mục demo.
3. Dịch vụ có bản quyền bạn cấu hình qua `VITE_LYRICS_ENDPOINT`.

Endpoint cần nhận `GET ?title=&artist=&duration=` và trả về `{ lrc?, plain?, instrumental?, source? }` (trả 404 nếu không có lời). Ứng dụng không tự lấy lời từ các trang web không có giấy phép.

## Hiệu ứng âm thanh

Phân tích âm thanh thật (AnalyserNode) chỉ dùng cho file trên máy, vì đó là luồng âm thanh ứng dụng được phép truy cập. Với YouTube và bài demo, hiệu ứng chỉ là hoạt ảnh trang trí. Ứng dụng không cố truy cập âm thanh được bảo vệ của YouTube.

## Car View: chế độ tiết kiệm hiệu năng

Màn hình xe (ví dụ VinFast VF5) có CPU/GPU yếu, và đang phải chạy cùng lúc trình phát YouTube. Vì vậy Car View tự bật chế độ nhẹ:

- **Tắt hiệu ứng chuyển động:**
  - equalizer đứng yên;
  - không có vệt sáng chạy trên khung chờ tải;
  - không có animation khi chuyển màn hình;
  - Focus Mode bỏ lớp nền mờ và các đốm sáng trôi.
- **Đồng hồ phát** chỉ cập nhật giao diện 1 lần/giây (máy tính là 4 lần/giây).
- **Áp dụng cho mọi chế độ:**
  - equalizer chỉ dùng `transform`, không bắt trình duyệt tính lại bố cục mỗi khung hình;
  - bảng Lời bài hát và Hàng đợi khi đóng không còn chạy animation ngầm;
  - gợi ý trên Trang chủ được tính lúc trình duyệt rảnh, không tính đúng lúc vừa chuyển bài;
  - Smart Autoplay bổ sung bài khoảng 2,5 giây sau khi bài mới đã phát;
  - hàng đợi chỉ giữ 50 bài đã phát gần nhất;
  - trình phát YouTube chỉ có một thực thể, ẩn bảng điều khiển, chú thích và nút toàn màn hình.

Đo trên máy giả lập CPU chậm 6 lần (`e2e/perf-car-profile.cjs`, 2 phút phát nhạc liên tục ở Car View):

| | Trước | Sau |
| --- | --- | --- |
| Thời gian main thread bận (ms mỗi giây) | 489 | 46 |
| Số lần tính lại bố cục (layout) mỗi giây | 61,6 | 1,3 |
| Số lần React render mỗi giây | 4,2 | 1,3 |
| Số tác vụ dài (> 50 ms), tổng thời gian | 6 tác vụ, 392 ms | 2 tác vụ, 113 ms |
| Số thực thể trình phát YouTube | 1 | 1 |

## Hiệu năng tải trang (đo bằng `e2e/perf-web-vitals.cjs`)

Điều kiện đo: mạng ~1,6 Mbps với độ trễ 150 ms, CPU chậm 4 lần, người dùng lâu năm (1.500 lượt nghe, 25 lần tìm đã lưu, 300 mục lịch sử). Số liệu là trung vị của 3 lần đo.

| Desktop 1360×860 | Trước | Sau |
| --- | --- | --- |
| FCP / LCP | 1,94 s | 1,66 s |
| Tổng thời gian chặn main thread khi khởi động (TBT) | 604 ms | 341 ms |
| Tác vụ dài nhất khi khởi động | 510 ms | 269 ms |
| INP (thao tác chậm nhất) | 424 ms | 176 ms |
| JS khởi động | 394 KB | 379 KB (các trang phụ tách riêng) |
| Gọi API khi gõ nhanh | 0 | 0 |

| Car View 800×480 | Trước | Sau |
| --- | --- | --- |
| FCP / LCP | 1,91 s | 1,56 s |
| TBT khi khởi động | 614 ms | 266 ms |
| CLS | 0,001 (0,089 khi mới thêm khung chờ) | 0,001 |
| INP | 120 ms | 88 ms |

**Những thay đổi chính:**
- **Gợi ý cá nhân không còn tính đồng bộ khi mở app.** Lượt tính đầu tiên chạy lúc trình duyệt rảnh, trong lúc đó Trang chủ hiện khung chờ giữ chỗ để bố cục không bị nhảy.
- **Bộ gợi ý nhanh hơn:**
  - hàm chuẩn hóa chữ được ghi nhớ kết quả;
  - các biểu thức lọc tiêu đề được biên dịch một lần;
  - khử trùng lặp bài hát chỉ so trong cùng nhóm tên bài, trước đây so với mọi nhóm;
  - hồ sơ nghe nhạc và danh sách ứng viên được tính một lần cho mỗi lượt gợi ý.
- **Tách mã:** Thư viện, Lịch sử, Playlist, Tải xuống và Cài đặt chỉ được tải khi mở.
- **Trình phát trên máy tính:**
  - chỉ ô thời gian và hiệu ứng sóng cập nhật 4 lần/giây, phần còn lại của thanh phát không render lại;
  - hiệu ứng sóng trang trí vẽ khoảng 30 khung hình/giây và dừng hẳn khi không phát nhạc.
- **Ảnh thu nhỏ:** trên màn hình thường, danh sách bài dùng ảnh 120×90 thay cho 320×180.

Thử điều hướng 400 lần giữa các trang trong khi phát nhạc (`e2e/perf-memory-nav.cjs`): số event listener không đổi, bộ nhớ tăng rồi ổn định, không có dấu hiệu rò rỉ.

## Phát nền trên iPhone (Safari)

- **Bài từ YouTube** phát qua YouTube IFrame Player, mà trình phát này thực chất là một `<video>` bên trong iframe của YouTube. Khi khóa màn hình hoặc chuyển ứng dụng, Safari trên iOS **dừng video**, và app không điều khiển được thành phần media trong iframe đó. Vì vậy nhạc YouTube **không phát tiếp khi khóa màn hình**, và cũng không tự chuyển sang bài kế khi màn hình đang khóa.
  - Đây là giới hạn của nguồn phát. App không trích xuất luồng âm thanh và không dùng mẹo "âm thanh im lặng" để lách.
  - Muốn nghe nền nhạc YouTube, cách hợp lệ là dùng ứng dụng YouTube/YouTube Music với gói Premium.
- **File nhạc trên máy (Thư viện › File trên máy)** phát bằng `<audio>`, nên vẫn phát khi khóa màn hình. Trên iOS, app **không** đưa âm thanh qua Web Audio, vì iOS ngắt AudioContext khi khóa màn hình làm file bị câm. Do đó hiệu ứng sóng nhạc ở đây chỉ là hoạt ảnh trang trí.
- **Màn hình khóa (Media Session):** hiện tên bài, nghệ sĩ và ảnh bìa nhiều cỡ. Các nút phát, tạm dừng, bài trước, bài sau, tua và kéo thanh thời gian đều dùng được, kèm trạng thái phát và vị trí phát.
- **Khi quay lại Safari:** app đọc trạng thái thật của trình phát để giao diện không báo "đang phát" khi thực tế đã dừng. App không bao giờ tự tạm dừng chỉ vì trang bị ẩn.

## Tìm kiếm bằng giọng nói và CarPlay

- **Trước khi bật micro:** app tạm dừng nhạc. Sau khi tìm xong, nhạc **vẫn dừng** cho tới khi bạn bấm Phát, và Smart Autoplay không tự chuyển bài.
- **Phiên nhận dạng luôn được đóng hẳn** (`abort()` và gỡ mọi callback) trong các tình huống:
  - đã nghe ra câu tìm;
  - lỗi hoặc bị từ chối quyền micro;
  - người dùng hủy;
  - quá 12 giây;
  - chuyển trang, trang bị ẩn hoặc khóa màn hình;
  - component bị gỡ.

  Không bao giờ có hai phiên chạy cùng lúc, và callback của phiên cũ bị bỏ qua.
- **App không dùng `getUserMedia`:** nhận dạng giọng nói do trình duyệt tự giữ micro, nên không có MediaStreamTrack nào để dừng.
- **Trả lại chế độ phát nhạc:** sau khi nhả micro, nếu Safari có Audio Session API (`navigator.audioSession`, từ Safari 16.4), app đặt kiểu phiên âm thanh về `playback` rồi `auto`. Mục đích là để iOS rời chế độ thu âm, tránh việc CarPlay kẹt ở chế độ thoại.
- **Giới hạn:** web không điều khiển được AVAudioSession. Nếu iOS hoặc CarPlay vẫn giữ chế độ thoại thì chỉ ứng dụng native mới sửa triệt để. Cách làm: dùng SFSpeechRecognizer, rồi `AVAudioSession.setActive(false, options: .notifyOthersOnDeactivation)` và chuyển category về `.playback` sau khi nhận dạng xong, ví dụ qua plugin Capacitor.

## Phát YouTube

Video YouTube phát qua **YouTube IFrame Player API** chính thức, ở chế độ **chỉ nghe nhạc**: trình phát nằm ngoài màn hình (component `YouTubeHost`).

> ⚠️ Chính sách API của YouTube yêu cầu trình phát phải hiển thị (tối thiểu 200×200 px) và không cho phép chỉ phát âm thanh. Chế độ ẩn này vi phạm chính sách đó, nên Google có thể khóa API key. Muốn hiện lại trình phát, sửa class `.yt-host` trong `src/styles/app.css`.

**Mạng chậm:** khi chọn bài (từ hàng đợi, kết quả tìm kiếm…), bài đó hiện ngay là bài đang chọn, kèm các dấu hiệu đang tải:
- vòng xoay ở nút Play và ở dòng bài trong hàng đợi;
- chữ "Đang tải…" và vạch chạy trên thanh tiến độ;
- sóng nhạc đứng yên cho đến khi thật sự có tiếng.

Nếu tải lâu hơn khoảng 4–5 giây, app báo "Mạng chậm — đang tải bài" và vẫn chờ tiếp, không báo nhầm là trình duyệt chặn tự phát. Sau khoảng 20 giây vẫn chưa phát được, app hiện nút "Thử lại".

Video bị gỡ, để riêng tư, hoặc bị chủ kênh chặn phát nhúng sẽ hiện thông báo, được đánh dấu "Unavailable" và app tự chuyển sang bài kế tiếp.

## Tải xuống (chỉ media được phép)

"Download MP3" chỉ chuyển đổi bài demo có giấy phép `owned`/`cc-by` và video từ các kênh được ủy quyền (thêm trong Settings). Backend tại `VITE_CONVERSION_ENDPOINT` cần hai endpoint:

```
POST /jobs        { provider, sourceId, channelId, bitrate, title }  -> { id }
GET  /jobs/:id    -> { status: 'queued'|'converting'|'done'|'error', progress: 0-100, downloadUrl?, error? }
```

Backend nên chuyển đổi từ **file gốc bạn sở hữu**, không tải trực tiếp từ YouTube.

## Kiểm thử

- `npm test`: 64 unit test cho hàng đợi, tốc độ, lưu trạng thái, parser LRC, Pomodoro, thống kê, cài đặt, tìm kiếm, nhận diện bài hát (`identity.test.ts`) và thuật toán gợi ý.
  - Phần gợi ý kiểm tra: cùng bài khác ID video, Audio/MV/Lyrics, Remix/Live, bài khác cùng nghệ sĩ, cùng phong cách khác nghệ sĩ, đa dạng nghệ sĩ, bài vừa nghe, bài không thích, chống trùng khi thêm vào hàng đợi, ít/không có ứng viên, và làm mới nhiều lần.
- `e2e/voice-mic-release.cjs`: kiểm tra micro được giải phóng ở mọi tình huống kết thúc tìm kiếm bằng giọng nói, nhạc tạm dừng và không tự phát lại.
- `e2e/perf-web-vitals.cjs`, `e2e/perf-car-profile.cjs`, `e2e/perf-memory-nav.cjs`: đo hiệu năng.
- `e2e/api-mode-autoplay.cjs`, `e2e/autoplay-advance.cjs`, `e2e/slow-network.cjs` (mạng chậm) và `e2e/lifecycle-media-session.cjs` (Media Session, đồng bộ khi quay lại trang, không dùng Web Audio cho file trên iOS): kiểm thử Autoplay ở chế độ có API key, với YouTube API được giả lập ở tầng mạng. Xem cách chạy ở đầu file. Các trường hợp tự chuyển bài được kiểm tra:
  - khi có sự kiện hết bài;
  - khi mất sự kiện hết bài;
  - khi cài đặt cũ "Tự động phát" đang tắt.
- `npm run test:e2e`: 6 bộ kiểm thử Playwright (bộ mới `car-search-reco-autoplay` kiểm tra ở 4 kích thước màn hình), phủ mọi nút điều khiển và tính năng. Bộ này dùng YouTube API và Web Speech API giả lập nên chạy được khi không có mạng.

  Cách chạy:

  ```bash
  npm i -D playwright && npx playwright install chromium
  npm run build && npm run preview &   # http://localhost:4173
  npm run test:e2e
  ```

## Design token

Giao diện theo template **"C · Tracklist gọn"**: nền than ấm, màu nhấn hổ phách, font **Be Vietnam Pro**. Font được đóng gói sẵn qua `@fontsource`, nên vẫn hiển thị đúng khi không có mạng hoặc khi Google Fonts bị chặn.

| Token | Giá trị |
| --- | --- |
| Nền chính / thanh bên / thanh phát | `#181715` / `#1C1A18` / `#1E1C19` |
| Nền khi rê chuột vào dòng | `#221F1C` |
| Màu nhấn / chữ trên nền nhấn | `#F5A524` / `#1A1206` |
| Chữ chính / phụ / mờ | `#F4F1EC` / `#A39D94` (hoặc `#C9C2B8`) / `#8F897F` |
| Viền | `rgba(255,255,255,0.14)` / `0.08` |

**Danh sách bài dạng tracklist** (`TrackList` + `VideoRow`), dùng cho kết quả tìm kiếm, Thư viện, Playlist và Trang chủ:
- Các cột: # · Tiêu đề (ảnh 72×40) · Kênh · Lượt xem · thao tác · thời lượng.
- Khi rê chuột: số thứ tự đổi thành nút ▶ và hiện các nút MP3 / Thêm vào hàng đợi / Thêm.
- Bài đang phát hiện equalizer.
- Khi vùng nội dung hẹp (ví dụ đang mở bảng Hàng đợi), danh sách tự ẩn cột Lượt xem rồi đến cột Kênh.
- Ở Car View, tên kênh nằm dưới tên bài và nút luôn hiện, cỡ ≥ 44 px.

**Trang kết quả tìm kiếm:**
- Nút "Phát tất cả" phát các kết quả đang hiển thị theo thứ tự.
- Bấm một dòng thì chỉ phát bài đó.
- Bộ lọc **Tất cả / Bài hát / Video**. "Bài hát" là video thuộc danh mục Âm nhạc, kênh "- Topic", hoặc bản Official/"Nghệ sĩ - Tên bài" dài 1–15 phút. Còn lại (mix dài, livestream, talk show…) là "Video".
