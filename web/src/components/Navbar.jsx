import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', id: 'nav-dashboard' },
  { to: '/matches', label: 'Matches', id: 'nav-matches' },
  { to: '/rankings', label: 'Rankings', id: 'nav-rankings' },
  { to: '/players', label: 'Players', id: 'nav-players' },
  { to: '/ledger', label: 'Ledger', id: 'nav-ledger' },
];

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-surface-800/80 backdrop-blur-md border-b border-surface-600/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" id="nav-logo" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-brand-500/30 group-hover:scale-105 transition-transform duration-200">
              M
            </div>
            <span className="font-bold text-white tracking-tight">
              Mandir <span className="text-brand-400">11</span>
            </span>
          </Link>

          {/* Nav links */}
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map(({ to, label, id }) => (
              <NavLink
                key={to}
                to={to}
                id={id}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-500/15 text-brand-300'
                      : 'text-gray-400 hover:text-white hover:bg-surface-700'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2">
            <Link to="/matches/new" id="nav-quick-match" className="btn-primary btn btn-sm">
              ⚡ Quick Match
            </Link>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex sm:hidden pb-2 gap-1 overflow-x-auto">
          {navItems.map(({ to, label, id }) => (
            <NavLink
              key={to}
              to={to}
              id={`mobile-${id}`}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'text-gray-400 hover:text-white hover:bg-surface-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
