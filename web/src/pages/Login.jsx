import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login, error: authError, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password.trim()) {
      setLocalError('Username and password are required.');
      return;
    }
    const ok = await login(username.trim(), password);
    if (ok) navigate('/');
  };

  return (
    <div className="page flex items-center justify-center min-h-screen">
      <div className="w-full max-w-sm mx-4 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-brand-500/40 mx-auto mb-4">
            M
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Mandir <span className="text-brand-400">11</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Admin Login</p>
        </div>

        <form id="form-login" onSubmit={handleSubmit} className="card p-6 space-y-4">
          {(localError || authError) && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {localError || authError}
            </div>
          )}

          <div>
            <label className="label" htmlFor="input-username">Username</label>
            <input
              id="input-username"
              type="text"
              className="input"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div>
            <label className="label" htmlFor="input-password">Password</label>
            <input
              id="input-password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          <button
            id="btn-login"
            type="submit"
            className="btn-primary btn w-full btn-lg"
            disabled={loading}
          >
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Anonymous viewers can{' '}
          <Link to="/" className="text-brand-400 hover:text-brand-300">
            view matches without logging in
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
