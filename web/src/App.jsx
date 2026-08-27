import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import QuickMatch from './pages/QuickMatch';
import MatchHistory from './pages/MatchHistory';
import MatchDetail from './pages/MatchDetail';
import ResultEntry from './pages/ResultEntry';
import Login from './pages/Login';

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/players" element={<Players />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/matches/:matchId" element={<MatchDetail />} />
        <Route path="/matches/:matchId/result" element={
          <AdminRoute><ResultEntry /></AdminRoute>
        } />
        <Route path="/matches/new" element={
          <AdminRoute><QuickMatch /></AdminRoute>
        } />
        <Route path="/login" element={<Login />} />
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
