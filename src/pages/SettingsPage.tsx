import { useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { hasYouTubeApi } from '../services/youtube';
import { hasConversionBackend, authorizedChannelCount } from '../services/downloads';
import { hasLyricsProvider } from '../services/lyrics';
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { getRecognitionCtor } from '../hooks/useSpeechRecognition';
import { SPEEDS, formatSpeed } from '../playback/speeds';
import type { VisualizerMode, VoiceLang } from '../types';
import DisplayModeToggle from '../components/DisplayModeToggle';
import { useSearchHistory } from '../search/SearchHistoryContext';
import { useListeningStore } from '../recommend/ListeningStore';
import AutoplayControls from '../components/AutoplayControls';
import { useRecommendations } from '../recommend/RecommendationProvider';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle__knob" />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__text">
        <div className="setting__title">{title}</div>
        {desc && <div className="setting__desc">{desc}</div>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

const Status = ({ ok, on = 'Đã kết nối', off = 'Chưa cấu hình' }: { ok: boolean; on?: string; off?: string }) => (
  <span className={`status${ok ? ' is-ok' : ''}`}><span className="status__dot" />{ok ? on : off}</span>
);

export default function SettingsPage() {
  const { settings, updateSettings, clearHistory } = useLibrary();
  const { autoplay: smart, setAutoplay: setSmart } = useRecommendations();
  const { rate, setRate } = usePlayer();
  const toast = useToast();
  const [channel, setChannel] = useState('');
  const voiceSupported = getRecognitionCtor() !== null;
  const { history: searches, clearSearches } = useSearchHistory();
  const listening = useListeningStore();

  const addChannel = (e: FormEvent) => {
    e.preventDefault();
    const id = channel.trim();
    if (!/^UC[\w-]{22}$/.test(id)) {
      toast('Nhập ID kênh dạng UCxxxxxxxxxxxxxxxxxxxxxx (24 ký tự).', { type: 'warning' });
      return;
    }
    if (!settings.authorizedChannels.includes(id)) updateSettings({ authorizedChannels: [...settings.authorizedChannels, id] });
    setChannel('');
  };

  return (
    <section className="page page--narrow">
      <h1 className="page-title">Cài đặt</h1>

      <h2 className="section-title">Chế độ hiển thị</h2>
      <div className="panel">
        <Row title="Bố cục" desc="Car View dành cho màn hình nhỏ nằm ngang (ví dụ màn hình 7 inch trên xe VinFast VF5): nút lớn, ưu tiên nghe nhạc. Chuyển ngay, không tải lại trang, nhạc vẫn phát.">
          <DisplayModeToggle showLabels />
        </Row>
      </div>

      <h2 className="section-title">Phát nhạc</h2>
      <div className="panel">
        <Row title="Tự động phát" desc="Phát bài tiếp theo trong hàng đợi khi một bài kết thúc. Video không phát được sẽ tự bỏ qua.">
          <Toggle label="Tự động phát" checked={settings.autoplay} onChange={(v) => { updateSettings({ autoplay: v }); if (!v && smart.enabled) setSmart(false); }} />
        </Row>
        <Row title="Tốc độ ưa thích" desc="Được ghi nhớ giữa các lần mở. Nguồn không hỗ trợ sẽ dùng tốc độ gần nhất.">
          <select className="field field--select" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Tốc độ phát ưa thích">
            {SPEEDS.map((s) => <option key={s} value={s}>{formatSpeed(s)}</option>)}
          </select>
        </Row>
        <Row title="Kiểu hiệu ứng" desc="Phân tích âm thanh thật với file trên máy; hoạt ảnh trang trí với YouTube (không truy cập được âm thanh của YouTube).">
          <select className="field field--select" value={settings.visualizer} onChange={(e) => updateSettings({ visualizer: e.target.value as VisualizerMode })} aria-label="Kiểu hiệu ứng">
            <option value="wave">Dạng sóng</option>
            <option value="spectrum">Phổ tần</option>
          </select>
        </Row>
      </div>

      <h2 className="section-title">Gợi ý &amp; tự phát</h2>
      <div className="panel">
        <div className="setting setting--stack"><AutoplayControls /></div>
        <Row title="Cách gợi ý hoạt động" desc="Thuật toán theo quy tắc, chạy hoàn toàn trên máy bạn (không dùng AI): tính điểm từ thời gian nghe thật, tỷ lệ nghe hết, lượt bỏ qua, bài yêu thích, playlist, từ khóa tìm kiếm và phản hồi của bạn. Bài chỉ được chọn rồi bỏ qua ngay sẽ không được tính là sở thích.">
          <span className="muted">{listening.events.length} lượt nghe</span>
        </Row>
        <Row title="Lịch sử nghe dùng cho gợi ý" desc="Giữ tối đa 120 ngày. Xóa sẽ đưa gợi ý về trạng thái ban đầu.">
          <button className="btn btn--ghost btn--sm" disabled={!listening.events.length} onClick={() => { if (window.confirm('Xóa toàn bộ dữ liệu nghe dùng cho gợi ý?')) { listening.clearListening(); toast('Đã xóa dữ liệu nghe', { type: 'success', duration: 1800 }); } }}>Xóa</button>
        </Row>
        <Row title="Phản hồi gợi ý" desc={`${listening.feedback.blockedTracks.length} bài bị chặn · ${Object.keys(listening.feedback.notInterested).length} bài không quan tâm · ${(listening.feedback.moreLike ?? []).length + (listening.feedback.lessLike ?? []).length} lượt thêm/bớt`}>
          <button className="btn btn--ghost btn--sm" onClick={() => { listening.resetFeedback(); toast('Đã đặt lại phản hồi', { type: 'success', duration: 1800 }); }}>Đặt lại</button>
        </Row>
        {listening.feedback.blockedChannels.length > 0 && (
          <div className="setting setting--stack">
            <div className="setting__text"><div className="setting__title">Nghệ sĩ không gợi ý</div></div>
            <div className="tag-list">
              {listening.feedback.blockedChannels.map((c) => (
                <span className="tag" key={c}>{c}<button aria-label={`Bỏ chặn ${c}`} onClick={() => listening.unblockArtist(c)}><X size={13} /></button></span>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2 className="section-title">Tìm kiếm bằng giọng nói</h2>
      <div className="panel">
        <Row title="Ngôn ngữ nhận dạng" desc={voiceSupported ? 'Bấm micro ở ô tìm kiếm, nói, kiểm tra lại chữ rồi nhấn Enter.' : 'Trình duyệt này không hỗ trợ tìm bằng giọng nói (hãy dùng Chrome hoặc Edge). Tìm bằng chữ vẫn hoạt động bình thường.'}>
          <select className="field field--select" value={settings.voiceLang} onChange={(e) => updateSettings({ voiceLang: e.target.value as VoiceLang })} aria-label="Ngôn ngữ tìm kiếm giọng nói" disabled={!voiceSupported}>
            <option value="vi-VN">Tiếng Việt</option>
            <option value="en-US">Tiếng Anh</option>
          </select>
        </Row>
      </div>

      <h2 className="section-title">Phím tắt</h2>
      <div className="panel">
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{s.keys.map((k, i) => <span key={k}>{i > 0 && <span className="kbd-plus">+</span>}<kbd>{k}</kbd></span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="setting__desc shortcuts__note">Phím tắt không hoạt động khi bạn đang gõ trong ô nhập liệu. Phím tắt riêng của chế độ Tập trung được hiển thị trong cài đặt của chế độ đó.</p>
      </div>

      <h2 className="section-title">Tải xuống</h2>
      <div className="panel">
        <Row title="Chất lượng MP3" desc="Bitrate yêu cầu từ dịch vụ chuyển đổi.">
          <select className="field field--select" value={settings.bitrate} onChange={(e) => updateSettings({ bitrate: Number(e.target.value) })} aria-label="Chất lượng MP3">
            <option value={128}>128 kbps</option>
            <option value={192}>192 kbps</option>
            <option value={256}>256 kbps</option>
            <option value={320}>320 kbps</option>
          </select>
        </Row>
        <div className="setting setting--stack">
          <div className="setting__text">
            <div className="setting__title">Kênh YouTube được ủy quyền</div>
            <div className="setting__desc">
              Chỉ chuyển đổi được video từ kênh bạn sở hữu hoặc có quyền tải.
              {authorizedChannelCount > 0 && ` Có thêm ${authorizedChannelCount} kênh được khai báo trong .env.`}
            </div>
          </div>
          <form className="inline-form" onSubmit={addChannel}>
            <input className="field" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="ID kênh (UC…)" spellCheck={false} aria-label="ID kênh" />
            <button className="btn btn--outline" type="submit">Thêm kênh</button>
          </form>
          {settings.authorizedChannels.length > 0 && (
            <div className="tag-list">
              {settings.authorizedChannels.map((c) => (
                <span className="tag" key={c}>
                  <code>{c}</code>
                  <button aria-label={`Xóa ${c}`} onClick={() => updateSettings({ authorizedChannels: settings.authorizedChannels.filter((x) => x !== c) })}>
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="section-title">Nguồn dữ liệu</h2>
      <div className="panel">
        <Row title="Tìm kiếm YouTube" desc="VITE_YOUTUBE_API_KEY — nếu không có, ứng dụng tìm trong danh mục demo.">
          <Status ok={hasYouTubeApi} off="Chế độ demo" />
        </Row>
        <Row title="Phát YouTube" desc="Trình phát YouTube IFrame chính thức, chỉ âm thanh. Link dán vào vẫn phát được khi chưa có API key.">
          <Status ok on="Sẵn sàng" />
        </Row>
        <Row title="Dịch vụ lời bài hát" desc="VITE_LYRICS_ENDPOINT — dịch vụ lời bài hát có bản quyền của bạn. File .lrc tự nhập và lời demo vẫn dùng được khi chưa có.">
          <Status ok={hasLyricsProvider} off="Chỉ file tự nhập" />
        </Row>
        <Row title="Backend chuyển đổi" desc="VITE_CONVERSION_ENDPOINT — dịch vụ của bạn để chuyển đổi nội dung được phép.">
          <Status ok={hasConversionBackend} off="Chỉ bài demo" />
        </Row>
      </div>

      <h2 className="section-title">Dữ liệu</h2>
      <div className="panel">
        <Row title="Lịch sử tìm kiếm" desc={`${searches.length} truy vấn gần đây, dùng cho gợi ý khi gõ.`}>
          <button className="btn btn--ghost btn--sm" disabled={!searches.length} onClick={() => { clearSearches(); toast('Đã xóa lịch sử tìm kiếm', { type: 'success', duration: 1800 }); }}>Xóa</button>
        </Row>
        <Row title="Lịch sử nghe" desc="Lưu cục bộ trên thiết bị này.">
          <button className="btn btn--ghost btn--sm" onClick={() => { clearHistory(); toast('Đã xóa lịch sử', { type: 'success', duration: 1800 }); }}>Xóa</button>
        </Row>
        <Row title="Đặt lại AmberTube" desc="Xóa yêu thích, playlist, lịch sử, hàng đợi, danh sách tải xuống, cài đặt và dữ liệu Tập trung.">
          <button className="btn btn--danger btn--sm" onClick={() => {
            if (!window.confirm('Xóa toàn bộ dữ liệu AmberTube trên máy này?')) return;
            Object.keys(localStorage).filter((k) => k.startsWith('ambertube:')).forEach((k) => localStorage.removeItem(k));
            window.location.reload();
          }}>Đặt lại</button>
        </Row>
      </div>
    </section>
  );
}
