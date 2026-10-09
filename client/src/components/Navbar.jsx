import { LogOut, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_NAME } from '../config';

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          <span className="brand-mark">
            <Video size={20} />
          </span>
          <span className="brand-name">{APP_NAME}</span>
        </div>

        <div className="user-menu">
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="badge">{user.role}</span>
          </div>
          <div className="avatar">{getInitials(user.name)}</div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;