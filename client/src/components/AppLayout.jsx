// src/components/AppLayout.jsx — persistent shell (top bar + tab navigation)
// wrapped around every signed-in screen. Auth pages deliberately render
// outside this, since there's nothing to navigate to until you're logged in.
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Inline SVG rather than an icon package. Four small paths aren't worth
// another dependency in a bundle already carrying MediaPipe and ZXing.
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};

function IconHome() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3.5l9 7v9.5a1 1 0 0 1-1 1h-4.5V15h-7v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconDumbbell() {
  return (
    <svg {...iconProps}>
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
    </svg>
  );
}

function IconFlame() {
  return (
    <svg {...iconProps}>
      <path d="M12 21c3.3 0 5.5-2.2 5.5-5.5 0-3.6-2.8-5.4-2.8-8.5-1.6.8-2.6 2.3-2.6 4-.9-1.3-1.2-2.9-.8-4.5C8.6 8 6.5 10.4 6.5 15.5 6.5 18.8 8.7 21 12 21Z" />
    </svg>
  );
}

function IconRoutine() {
  return (
    <svg {...iconProps}>
      <path d="M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

const TABS = [
  { to: '/dashboard', label: 'Home', Icon: IconHome },
  { to: '/workout', label: 'Workout', Icon: IconDumbbell },
  { to: '/nutrition', label: 'Nutrition', Icon: IconFlame },
  { to: '/routine', label: 'Routine', Icon: IconRoutine }
];

// Titles live here so each screen doesn't render its own heading — one header
// on mobile instead of two stacked ones eating vertical space.
const TITLES = {
  '/dashboard': 'Dashboard',
  '/workout': 'Log a workout',
  '/nutrition': 'Nutrition',
  '/routine': 'Your routine',
  '/session': 'Form check'
};

export default function AppLayout() {
  const { logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">{TITLES[pathname] ?? 'AI Fitness Coach'}</span>
        <button onClick={logout} className="logout-button">Log out</button>
      </header>

      <nav className="tab-bar">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
