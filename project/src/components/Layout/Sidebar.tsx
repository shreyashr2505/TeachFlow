import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { getNavigationItems } from '../../utils/navigation';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const menuItems = getNavigationItems(user?.role);

  return (
    <aside className="hidden min-h-screen w-72 border-r border-slate-800/80 bg-slate-950/95 shadow-sm lg:block">
      <nav className="mt-6">
        <div className="px-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`flex min-h-[48px] w-full items-center rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === item.id
                        ? 'border border-cyan-500/30 bg-cyan-500/12 text-cyan-300'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
