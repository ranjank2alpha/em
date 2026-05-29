import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const USERS = {
  ranjan: { email: 'ranjan@k2alpha.ai', name: 'Ranjan' },
  ashish: { email: 'ashish.karan@k2alpha.ai', name: 'Ashish' }
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userKey = username.trim().toLowerCase();
      const user = USERS[userKey];
      
      if (!user) {
        throw new Error("Invalid username. Please use 'ranjan' or 'ashish'.");
      }
      
      const email = user.email;

      let { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      
      // If the user does not exist yet, we auto-create them on the first login attempt
      if (signInError && signInError.message.includes('Invalid login credentials')) {
        const { error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { name: user.name } }
        });
        if (signUpError) throw signUpError;
        alert('First time logging in! Your account was just securely created. Please click Log In one more time. (Note: Make sure "Confirm email" is turned OFF in your Supabase Auth settings).');
        setLoading(false);
        return;
      } else if (signInError) {
        throw signInError;
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '4rem auto' }}>
      <h2 className="text-center mb-4">K2Alpha Expense Login</h2>
      {error && <div className="text-danger mb-4 text-center">{error}</div>}
      <form onSubmit={handleAuth}>
        <div className="input-group">
          <label className="input-label">Username</label>
          <select 
            className="input" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required
          >
            <option value="">Select User</option>
            <option value="ranjan">ranjan</option>
            <option value="ashish">ashish</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary w-full mt-4" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
