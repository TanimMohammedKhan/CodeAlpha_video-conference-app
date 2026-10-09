import { MonitorUp, PenTool, ShieldCheck, Video } from 'lucide-react';
import { APP_NAME } from '../config';

const FEATURES = [
  { icon: Video, text: 'Crystal-clear group video calls' },
  { icon: MonitorUp, text: 'Screen sharing and file sharing' },
  { icon: PenTool, text: 'A shared whiteboard for ideas' },
  { icon: ShieldCheck, text: 'Encrypted and secure by design' },
];

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="brand">
          <span className="brand-mark">
            <Video size={20} />
          </span>
          <span className="brand-name">{APP_NAME}</span>
        </div>

        <div className="auth-brand-body">
          <h2>Meet, teach and collaborate in one calm space.</h2>
          <p>
            Everything your class or team needs for a great meeting, in a
            single secure place.
          </p>
          <ul className="feature-list">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand-footer">
          Built for students, teachers and teams.
        </p>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
          {children}
          <p className="switch">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;