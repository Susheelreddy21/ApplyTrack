
import { useState } from 'react';
import './Auth.css';

export default function Register({ onRegister, onSwitchToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 8 || password.length > 72) {
      setError('Password must be between 8 and 72 characters.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      onRegister(data.user);
    } catch (err) {
      setError(err.message || 'Unable to connect to the server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">ApplyTrack</div>
        <h1>Create your account</h1>
        <p className="auth-subtitle">Start tracking your job search.</p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="register-name">Full name</label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          required
        />

        <label htmlFor="register-email">Email address</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={255}
          required
        />

        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <p className="auth-switch">
          Already registered?{' '}
          <button type="button" className="auth-link" onClick={onSwitchToLogin}>
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}
