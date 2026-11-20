import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import LyricsPanel from './components/LyricsPanel';
import YouTubeHost from './components/YouTubeHost';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
// secondary pages are split out of the startup bundle (Home, Search and the player load first)
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })));
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistsPage').then((m) => ({ default: m.PlaylistDetailPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ArtistsPage = lazy(() => import('./pages/ArtistsPage'));
const ArtistPage = lazy(() => import('./pages/ArtistPage'));
const ChartPage = lazy(() => import('./pages/ChartPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AuthDialog = lazy(() => import('./auth/AuthDialog'));
import { ToastProvider } from './context/ToastContext';
import { LibraryProvider } from './context/LibraryContext';
import { PlayerProvider } from './context/PlayerContext';
import { UIProvider, useUI } from './context/UIContext';
import { PomodoroController } from './focus/PomodoroController';
import { SearchHistoryProvider } from './search/SearchHistoryContext';
import { DisplayModeProvider, useDisplayMode } from './context/DisplayModeContext';
import CarSuggestionBanner from './components/CarSuggestionBanner';
import CarPlayerBar from './components/CarPlayerBar';
import NowPlaying from './components/NowPlaying';
import CarVoiceSearch from './voice/CarVoiceSearch';
import { ListeningStoreProvider } from './recommend/ListeningStore';
import { RecommendationProvider } from './recommend/RecommendationProvider';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { diagEnabled } from './diag/audioDiag';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SyncProvider } from './sync/SyncProvider';
import GuestMergeDialog from './sync/GuestMergeDialog';

const FocusModePage = lazy(() => import('./focus/components/FocusModePage'));
// device-testing diagnostics, only loaded with ?diag=1
const DiagPanel = lazy(() => import('./diag/DiagPanel'));

/** The normal AmberTube layout (sidebar, search, pages, player bar). */
function Shell() {
  const { pathname } = useLocation();
  const { panel } = useUI();
  const { mode, compact } = useDisplayMode();
  const scroller = useRef<HTMLDivElement>(null);
  useKeyboardShortcuts();

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className={`app app--${mode}${compact ? ' app--compact' : ''}`}>
      {!compact && <Sidebar />}
      <main className={`main${panel ? ` has-panel has-panel--${panel}` : ''}`}>
        <TopBar />
        <CarSuggestionBanner />
        <div className="main__scroll" ref={scroller}>
          <Suspense fallback={<div className="page page--loading" aria-busy="true"><div className="sk sk--line" style={{ width: 220, height: 28 }} /></div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/artists" element={<ArtistsPage />} />
            <Route path="/artist/:name" element={<ArtistPage />} />
            <Route path="/charts/:source" element={<ChartPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/auth/reset" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </div>
        <QueuePanel />
        <LyricsPanel />
      </main>
      {compact ? <CarPlayerBar /> : <PlayerBar />}
      {compact && <NowPlaying />}
      {compact && <CarVoiceSearch />}
    </div>
  );
}

/** The sign-in dialog's code loads only when it is opened. */
function AuthDialogHost() {
  const { dialog } = useAuth();
  return dialog ? <Suspense fallback={null}><AuthDialog /></Suspense> : null;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <DisplayModeProvider>
      <SearchHistoryProvider>
      <LibraryProvider>
      <ListeningStoreProvider>
        <PlayerProvider>
        <RecommendationProvider>
          <UIProvider>
            <PomodoroController>
              <SyncProvider>
              <Routes>
                {/* Focus mode replaces the whole layout but shares the same player, queue and timer */}
                <Route path="/focus" element={<Suspense fallback={<div className="fm fm--loading" />}><FocusModePage /></Suspense>} />
                <Route path="/*" element={<Shell />} />
              </Routes>
              {/* outside the routes so the YouTube iframe survives switching layouts */}
              <YouTubeHost />
              {diagEnabled() && <Suspense fallback={null}><DiagPanel /></Suspense>}
              <AuthDialogHost />
              <GuestMergeDialog />
              </SyncProvider>
            </PomodoroController>
          </UIProvider>
        </RecommendationProvider>
        </PlayerProvider>
      </ListeningStoreProvider>
      </LibraryProvider>
      </SearchHistoryProvider>
      </DisplayModeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
