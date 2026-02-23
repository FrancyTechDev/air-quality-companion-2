import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, Droplets, Menu, X } from 'lucide-react';
import Sidebar, { Section } from '@/components/Sidebar';
import MapSection from '@/components/MapSection';
import AnalyticsSection from '@/components/AnalyticsSection';
import ForecastSection from '@/components/ForecastSection';
import NeuroHealthSection from '@/components/NeuroHealthSection';
import StatCard from '@/components/StatCard';
import { useSensorData } from '@/hooks/useSensorData';
import { getAirQualityInfo, calculateNeuroHealthRisk } from '@/lib/airQuality';

const Index = () => {
  const [activeSection, setActiveSection] = useState<Section>('map');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currentData, history, isConnected } = useSensorData();
  
  const airQuality = getAirQualityInfo(currentData.pm25);
  const neuroRisk = calculateNeuroHealthRisk(history);

  // Close mobile menu when section changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeSection]);

  const renderSection = () => {
    switch (activeSection) {
      case 'map':
        return (
          <motion.div
            key="map"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="PM2.5"
                value={currentData.pm25}
                unit="µg/m³"
                icon={Droplets}
                badge={airQuality.label}
                badgeClass={airQuality.badgeClass}
                variant={currentData.pm25 > 35 ? 'danger' : 'default'}
              />
              <StatCard
                title="PM10"
                value={currentData.pm10}
                unit="µg/m³"
                icon={Wind}
                trend={currentData.pm10 > 50 ? 'up' : 'down'}
                trendValue="rispetto all'ora"
              />
              <StatCard
                title="Indice AQI"
                value={Math.round(currentData.pm25 * 2)}
                icon={Droplets}
                badge={airQuality.level === 'excellent' ? 'Ottimo' : 'Attenzione'}
                badgeClass={airQuality.badgeClass}
              />
              <StatCard
                title="Rischio Neuro"
                value={neuroRisk.level === 'low' ? 'Basso' : neuroRisk.level === 'moderate' ? 'Moderato' : 'Alto'}
                icon={Wind}
                variant="neuro"
              />
            </div>

            {/* Map */}
            <MapSection
              currentData={currentData}
              history={history}
              isConnected={isConnected}
            />
          </motion.div>
        );
      
      case 'analytics':
        return (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <AnalyticsSection history={history} currentData={currentData} />
          </motion.div>
        );
      
      case 'forecast':
        return (
          <motion.div
            key="forecast"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ForecastSection history={history} currentData={currentData} />
          </motion.div>
        );
      
      case 'neurohealth':
        return (
          <motion.div
            key="neurohealth"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <NeuroHealthSection risk={neuroRisk} />
          </motion.div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          isConnected={isConnected}
        />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-panel rounded-none border-b border-border">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-accent">
              <Wind className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-bold text-lg text-gradient">AirWatch</h1>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-muted"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <nav className="p-4 space-y-2">
                {[
                  { id: 'map' as Section, label: 'Live Map' },
                  { id: 'analytics' as Section, label: 'Analytics' },
                  { id: 'forecast' as Section, label: 'Previsioni PM' },
                  { id: 'neurohealth' as Section, label: 'NeuroHealth' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full p-3 rounded-xl text-left transition-colors ${
                      activeSection === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pt-20 lg:pt-0">
        <div className="p-4 lg:p-8">
          {/* Page Header */}
          <div className="mb-8">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mb-2"
            >
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-air-excellent animate-pulse' : 'bg-air-dangerous'}`} />
              <span className="text-sm text-muted-foreground">
                {isConnected ? 'Dati in tempo reale' : 'Connessione persa'}
              </span>
            </motion.div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {activeSection === 'map' && 'Mappa Live'}
              {activeSection === 'analytics' && 'Dashboard Analytics'}
              {activeSection === 'forecast' && 'Previsioni AI'}
              {activeSection === 'neurohealth' && 'NeuroHealth Monitor'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {activeSection === 'map' && 'Tracciamento GPS e qualità dell\'aria'}
              {activeSection === 'analytics' && 'Analisi storica dei dati'}
              {activeSection === 'forecast' && 'Previsioni basate su machine learning'}
              {activeSection === 'neurohealth' && 'Monitoraggio impatto neurologico'}
            </p>
          </div>

          {/* Section Content */}
          <AnimatePresence mode="wait">
            {renderSection()}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Index;
