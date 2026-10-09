import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

function PasswordField({ label, id, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <Lock className="input-icon" size={18} />
        <input
          id={id}
          className="with-toggle"
          type={visible ? 'text' : 'password'}
          {...props}
        />
        <button
          type="button"
          className="toggle-visibility"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default PasswordField;