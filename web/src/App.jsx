import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import SplashScreen from './components/SplashScreen';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import QuickMatch from './pages/QuickMatch';
import MatchHistory from './pages/MatchHistory';
import MatchDetail from './pages/MatchDetail';
import ResultEntry from './pages/ResultEntry';
import CricketScorer from './pages/CricketScorer';
import Ledger from './pages/Ledger';
import Leaderboard from './pages/Leaderboard';
import Stats from './pages/Stats';
import PlayerProfile from './pages/PlayerProfile';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import Settings from './pages/Settings';

function AppRoutes() {
  return (
    <>
      <SplashScreen />
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:playerId" element={<PlayerProfile />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/tournaments/:tournamentId" element={<TournamentDetail />} />
        <Route path="/rankings" element={<Leaderboard />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/matches/:matchId" element={<MatchDetail />} />
        <Route path="/matches/:matchId/score" element={<CricketScorer />} />
        <Route path="/matches/:matchId/result" element={<ResultEntry />} />
        <Route path="/matches/new" element={<QuickMatch />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
