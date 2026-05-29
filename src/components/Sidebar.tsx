import { MessageSquare, Network, Cpu, Settings } from 'lucide-react';

export type NavItem = 'chat' | 'hive' | 'models' | 'settings';

interface SidebarProps {
  active: NavItem;
  onNavigate: (item: NavItem) => void;
}

const NAV_ITEMS: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquare size={18} />,
  },
  {
    id: 'hive',
    label: 'My Hive',
    icon: <Network size={18} />,
  },
  {
    id: 'models',
    label: 'Models',
    icon: <Cpu size={18} />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings size={18} />,
  },
];

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/bee.svg" width={24} height={24} alt="HiveFabric" className="sidebar-logo-icon" />
          <div>
            <div className="sidebar-logo-text">HiveFabric</div>
            <div className="sidebar-logo-sub">Distributed AI</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item${active === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        v0.1.0
      </div>
    </aside>
  );
}
