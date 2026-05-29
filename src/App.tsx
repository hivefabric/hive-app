import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import AuthGate from './components/AuthGate';
import ChatView from './views/ChatView';
import HiveView from './views/HiveView';
import ModelsView from './views/ModelsView';
import SettingsView from './views/SettingsView';
import type { NavItem } from './components/Sidebar';

function getHashView(): NavItem {
  const hash = window.location.hash.replace('#/', '');
  if (hash === 'hive') return 'hive';
  if (hash === 'models') return 'models';
  if (hash === 'settings') return 'settings';
  return 'chat';
}

function setHashView(view: NavItem) {
  window.location.hash = `/${view}`;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hf_token'));
  const [view, setView] = useState<NavItem>(getHashView);

  // Sync hash <-> view state
  useEffect(() => {
    function onHashChange() {
      setView(getHashView());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(item: NavItem) {
    setView(item);
    setHashView(item);
  }

  function handleAuth(newToken: string) {
    setToken(newToken);
  }

  if (!token) {
    return <AuthGate onAuth={handleAuth} />;
  }

  return (
    <div className="app-layout">
      <Sidebar active={view} onNavigate={navigate} />
      <main className="app-main">
        {view === 'chat' && <ChatView />}
        {view === 'hive' && <HiveView onGoToInstall={() => navigate('settings')} />}
        {view === 'models' && <ModelsView />}
        {view === 'settings' && <SettingsView onViewHive={() => navigate('hive')} />}
      </main>
    </div>
  );
}
