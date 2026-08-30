import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import QuickMatch from './pages/QuickMatch';
import MatchHistory from './pages/MatchHistory';
import MatchDetail from './pages/MatchDetail';
import ResultEntry from './pages/ResultEntry';
import CricketScorer from './pages/CricketScorer';
import Ledger from './pages/Ledger';
import Leaderboard from './pages/Leaderboard';
import PlayerProfile from './pages/PlayerProfile';

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:playerId" element={<PlayerProfile />} />
        <Route path="/rankings" element={<Leaderboard />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/ledger" element={<Ledger />} />
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
