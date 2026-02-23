import { motion } from 'framer-motion';
import { 
  Map, 
  BarChart3, 
  Sparkles, 
  Brain, 
  Radio,
  Wind
} from 'lucide-react';

export type Section = 'map' | 'analytics' | 'forecast' | 'neurohealth';

interface SidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  isConnected: boolean;
}

const navItems = [
  { id: 'map' as Section, label: 'Live Map', icon: Map },
  { id: 'analytics' as Section, label: 'Analytics', icon: BarChart3 },
  { id: 'forecast' as Section, label: 'Previsioni PM', icon: Sparkles },
  { id: 'neurohealth' as Section, label: 'NeuroHealth', icon: Brain },
];

const Sidebar = ({ activeSection, onSectionChange, isConnected }: SidebarProps) => {
  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen w-64 glass-panel rounded-none border-r border-border z-50"
      initial={{ x: -264 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-accent">
            <Wind className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gradient">AirWatch</h1>
            <p className="text-xs text-muted-foreground">Monitoraggio Aria</p>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-air-excellent animate-pulse' : 'bg-air-dangerous'}`} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Sensore Connesso' : 'Disconnesso'}
          </span>
          <Radio className={`w-3 h-3 ml-auto ${isConnected ? 'text-air-excellent' : 'text-air-dangerous'}`} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4 px-2">
          Navigazione
        </p>
        {navItems.map((item) => (
          <motion.button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full ${activeSection === item.id ? 'nav-item-active' : 'nav-item'}`}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
            {item.id === 'map' && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-air-excellent/20 text-air-excellent">
                LIVE
              </span>
            )}
          </motion.button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
        <div className="glass-panel p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Qualità dati</p>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-6 h-1.5 rounded-full ${i <= 4 ? 'bg-air-excellent' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="text-xs text-air-excellent mt-2">Ottima</p>
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
