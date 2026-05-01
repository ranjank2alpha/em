import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import './index.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="text-center" style={{ marginTop: '20vh' }}>Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-center mt-4 mb-4">Estate Finance Tracker</h1>
      {!session ? <Auth /> : <Dashboard key={session.user.id} session={session} />}
    </div>
  );
}
