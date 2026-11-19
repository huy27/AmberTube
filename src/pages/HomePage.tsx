import { useNavigate } from 'react-router-dom';
import { Play, Radio, Sparkles, Check } from 'lucide-react';
import TrackCard from '../components/TrackCard';
import VideoRow from '../components/VideoRow';
import TrackList from '../components/TrackList';
import { MoodShelf } from '../components/MoodGrid';
import PopularArtistsShelf from '../artists/PopularArtistsShelf';
import ChartShelf from '../charts/ChartShelf';
import RecoCard from '../components/RecoCard';
import Shelf from '../components/Shelf';
import Artwork from '../components/Artwork';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { useRecommendations } from '../recommend/RecommendationProvider';
import { useListeningStore } from '../recommend/ListeningStore';
import { DEMO_TRACKS, MOODS } from '../data/demoCatalog';
import { hasYouTubeApi } from '../services/youtube';
import { greeting } from '../services/format';
import type { Track } from '../types';

function DailyMixCard({ mix }: { mix: Track[] }) {
  const { playTrack } = usePlayer();
  return (
    <div className="mix-card">
      <div className="mix-card__art" aria-hidden="true">{mix.slice(0, 4).map((t) => <Artwork key={t.id} track={t} />)}</div>
      <div className="mix-card__body">
        <span className="eyebrow">Daily Mix của bạn</span>
        <strong>{mix.length} bài · bài quen + bài mới hợp gu</strong>
        <span className="mix-card__names">{[...new Set(mix.map((t) => t.channel))].slice(0, 3).join(', ')}</span>
      </div>
      <button className="btn btn--primary mix-card__play" onClick={() => playTrack(mix[0], mix)}><Play size={16} fill="currentColor" strokeWidth={0} /> Phát</button>
    </div>
  );
}

function RadioTile({ seed }: { seed: Track }) {
  const { startRadio } = useRecommendations();
  return (
    <button className="mix-card mix-card--radio" onClick={() => void startRadio(seed)}>
      <div className="mix-card__art mix-card__art--single" aria-hidden="true"><Artwork track={seed} /><span className="mix-card__badge"><Radio size={18} /></span></div>
      <div className="mix-card__body">
        <span className="eyebrow">Smart Radio</span>
        <strong>Radio từ “{seed.title}”</strong>
        <span className="mix-card__names">Bài tương tự, nghệ sĩ liên quan</span>
      </div>
    </button>
  );
}

function MyRadioTile() {
  const { startMyRadio } = useRecommendations();
  return (
    <button className="mix-card mix-card--radio" onClick={() => void startMyRadio()}>
      <div className="mix-card__art mix-card__art--single mix-card__art--mine" aria-hidden="true"><span className="mix-card__badge"><Sparkles size={18} /></span></div>
      <div className="mix-card__body">
        <span className="eyebrow">Radio của tôi</span>
        <strong>Nghệ sĩ và phong cách bạn hay nghe</strong>
        <span className="mix-card__names">Quen thuộc xen lẫn bài mới</span>
      </div>
    </button>
  );
}

/** Placeholder for the personal shelves while recommendations are computed (keeps the layout stable). */
function ShelfSkeleton() {
  return (
    <section className="shelf" aria-busy="true" aria-label="Đang tải gợi ý">
      <div className="sk sk--line" style={{ width: 180, height: 20, marginTop: 8 }} />
      <div className="shelf__row">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk shelf-sk" />)}</div>
    </section>
  );
}

function ColdStart() {
  const { feedback, setStyles } = useListeningStore();
  const { trending, trendingSource } = useRecommendations();
  const toggle = (q: string) => setStyles(feedback.styles.includes(q) ? feedback.styles.filter((s) => s !== q) : [...feedback.styles, q]);
  return (
    <>
      <section className="cold">
        <div className="cold__head">
          <Sparkles size={18} />
          <div>
            <h2 className="section-title">Cá nhân hóa gợi ý cho bạn</h2>
            <p className="shelf__sub">Nghe vài bài (ít nhất ~30 giây mỗi bài) hoặc chọn vài phong cách bạn thích. Gợi ý sẽ chính xác dần theo lịch sử nghe.</p>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Phong cách yêu thích">
          {MOODS.map((m) => {
            const on = feedback.styles.includes(m.query);
            return (
              <button key={m.id} className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(m.query)}>
                {on && <Check size={14} />} {m.label}
              </button>
            );
          })}
        </div>
      </section>
      {trending.length > 0 && (
        <Shelf id="sh-trending" title={trendingSource === 'youtube' ? 'Thịnh hành trên YouTube' : 'Phổ biến (danh mục demo)'} subtitle={trendingSource === 'youtube' ? 'Video âm nhạc phổ biến tại Việt Nam' : 'Xếp theo lượt xem trong danh mục demo'}>
          {trending.map((t) => <RecoCard key={t.id} track={t} list={trending} />)}
        </Shelf>
      )}
    </>
  );
}

export default function HomePage() {
  const { history } = useLibrary();
  const { compact } = useDisplayMode();
  const { recs, recsReady } = useRecommendations();
  const navigate = useNavigate();
  const car = compact;
  const recent: Track[] = [...recs.continueListening];
  for (const h of history) if (!recent.some((t) => t.id === h.track.id) && h.track.provider !== 'local' && recent.length < 10) recent.push(h.track);
  const featured = hasYouTubeApi ? [] : DEMO_TRACKS.slice(0, 6);
  const moods = DEMO_TRACKS.slice(7, 15);
  const radioSeed = recs.because?.seed ?? recent[0];

  const continueShelf = recent.length > 0 && (
    <Shelf id="sh-continue" title="Nghe tiếp" subtitle={car ? undefined : 'Những bài bạn vừa nghe'}>
      {recent.map((t) => <RecoCard key={t.id} track={t} list={recent} />)}
    </Shelf>
  );

  const personal = !recsReady ? <ShelfSkeleton /> : recs.coldStart ? <ColdStart /> : (
    <>
      {(recs.dailyMix.length > 0 || radioSeed) && (
        <div className="mix-row">
          {!recsReady && history.length >= 5 && <div className="mix-card mix-card--sk sk" aria-hidden="true" />}
          {recs.dailyMix.length > 0 && <DailyMixCard mix={recs.dailyMix} />}
          {radioSeed && <RadioTile seed={radioSeed} />}
          <MyRadioTile />
        </div>
      )}
      {recs.madeForYou.length > 0 && (
        <Shelf id="sh-mfy" title="Dành cho bạn" subtitle="Dựa trên thời lượng nghe, bài yêu thích và lượt bỏ qua của bạn">
          {(car ? recs.madeForYou.slice(0, 6) : recs.madeForYou).map((t) => <RecoCard key={t.id} track={t} list={recs.madeForYou} />)}
        </Shelf>
      )}
      {!car && recs.because && (
        <Shelf id="sh-because" title={<>Vì bạn đã nghe “{recs.because.seed.title}”</>} subtitle="Cùng nghệ sĩ hoặc cùng phong cách">
          {recs.because.items.map((t) => <RecoCard key={t.id} track={t} list={recs.because!.items} />)}
        </Shelf>
      )}
      {!car && recs.discoverWeekly.length > 0 && (
        <Shelf id="sh-discover" title="Khám phá tuần này" subtitle="Nghệ sĩ và bài bạn chưa nghe, hợp với gu của bạn · đổi mỗi tuần">
          {recs.discoverWeekly.map((t) => <RecoCard key={t.id} track={t} list={recs.discoverWeekly} />)}
        </Shelf>
      )}
      {!car && recs.similarArtists.length > 0 && (
        <section className="shelf">
          <h2 className="section-title">Nghệ sĩ tương tự</h2>
          <div className="artist-row">
            {recs.similarArtists.map((a) => (
              <button key={a.name} className="artist-chip" onClick={() => navigate(`/search?q=${encodeURIComponent(a.name)}`)}>
                <span className="artist-chip__art"><Artwork track={a.sample} /></span>
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );

  if (car) {
    // Car View: music first — continue listening, daily mix / radio, moods, then a few suggestions
    // before the first recommendation pass: only reserve the row for users with real history
    // (a brand-new user will get the cold-start picker instead, so nothing should appear and vanish)
    const warm = history.length >= 5;
    const mixRow = (recsReady ? !recs.coldStart : warm) && (recs.dailyMix.length > 0 || radioSeed || !recsReady) && (
      <div className="mix-row">
        {!recsReady && history.length >= 5 && <div className="mix-card mix-card--sk sk" aria-hidden="true" />}
        {recs.dailyMix.length > 0 && <DailyMixCard mix={recs.dailyMix} />}
        {radioSeed && <RadioTile seed={radioSeed} />}
        <MyRadioTile />
      </div>
    );
    return (
      <section className="page page--car">
        {continueShelf}
        {mixRow}
        <MoodShelf />
        <ChartShelf source="vietnam" />
        <PopularArtistsShelf />
        <ChartShelf source="global" />
        {!recsReady ? <ShelfSkeleton /> : recs.coldStart ? <ColdStart /> : recs.madeForYou.length > 0 && (
          <Shelf id="sh-mfy" title="Dành cho bạn">
            {recs.madeForYou.slice(0, 6).map((t) => <RecoCard key={t.id} track={t} list={recs.madeForYou} />)}
          </Shelf>
        )}
        {featured.length > 0 && (
          <Shelf id="sh-featured" title="Nhạc thư giãn / học tập">
            {featured.map((t) => <RecoCard key={t.id} track={t} list={featured} />)}
          </Shelf>
        )}
      </section>
    );
  }

  return (
    <section className="page">
      <h1 className="page-title">{greeting()}</h1>

      <MoodShelf first />

      {continueShelf}
      {personal}
      <ChartShelf source="vietnam" />
      <ChartShelf source="global" />
      <PopularArtistsShelf />

      {featured.length > 0 && (
        <>
          <h2 className="section-title">Nhạc thư giãn / học tập</h2>
          <TrackList label="Nhạc thư giãn / học tập">
            {featured.map((t, i) => <VideoRow key={t.id} track={t} index={i + 1} list={featured} />)}
          </TrackList>
          <h2 className="section-title">Thêm tâm trạng</h2>
          <div className="card-grid">
            {moods.map((t) => <TrackCard key={t.id} track={t} list={moods} />)}
          </div>
        </>
      )}
    </section>
  );
}
