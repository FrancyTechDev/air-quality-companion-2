import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Radio, Wind, Satellite } from 'lucide-react'; // Aggiunta icona Satellite
import { SensorData, getMarkerColor, getAirQualityInfo } from '@/lib/airQuality';

// --- UTILS MATEMATICHE (Scientifiche) ---

// Formula dell'emisenoverso (Haversine) per calcolare la distanza in metri
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000; // Raggio Terra in metri
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface MapSectionProps {
  currentData: SensorData;
  history: SensorData[];
  isConnected: boolean;
}

const MapSection = ({ currentData, history, isConnected }: MapSectionProps) => {
  // --- REFS STRUTTURALI ---
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Refs Rendering
  const currentMarkerRef = useRef<L.CircleMarker | null>(null);
  const pulseMarkerRef = useRef<L.CircleMarker | null>(null);
  const pathRef = useRef<L.Polyline | null>(null);

  // --- REFS PARTICLES & LOGICA (User Requested) ---
  const particlesRef = useRef<L.CircleMarker[]>([]);
  const lastDropRef = useRef<number>(0);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const gpsAvailableRef = useRef<boolean>(false);
  const gpsCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // --- STATE ---
  const [mapReady, setMapReady] = useState(false);
  const [usingGPS, setUsingGPS] = useState(false); // Stato per UI feedback

  const airQuality = getAirQualityInfo(currentData.pm25);

  // 1️⃣ GESTIONE GEOLOCATION (Browser API)
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("Geolocalizzazione non supportata dal browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Salviamo nel ref per uso immediato nel loop grafico
        gpsCoordsRef.current = { lat: latitude, lng: longitude };
        gpsAvailableRef.current = true;
        setUsingGPS(true); // Aggiorna UI
      },
      (error) => {
        console.error("Errore GPS:", error.message);
        gpsAvailableRef.current = false;
        setUsingGPS(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2️⃣ INIZIALIZZAZIONE MAPPA
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Coordinate iniziali (fallback Milano)
    const initLat = currentData.lat || 45.4642;
    const initLng = currentData.lng || 9.19;

    mapRef.current = L.map(mapContainerRef.current, {
      center: [initLat, initLng],
      zoom: 16,
      zoomControl: false,
      preferCanvas: true
    });

    // Dark Technical Layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(mapRef.current);

    L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    setMapReady(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      particlesRef.current = [];
    };
  }, []);

  // 3️⃣ LOOP PRINCIPALE: MARKER, PARTICELLE E PATH
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // DETERMINA LA POSIZIONE REALE DA USARE
    // Se il GPS browser è attivo, usa quello, altrimenti i dati del sensore (MQTT/API)
    const effectiveLat = gpsAvailableRef.current && gpsCoordsRef.current 
      ? gpsCoordsRef.current.lat 
      : (currentData.lat || 45.4642);

    const effectiveLng = gpsAvailableRef.current && gpsCoordsRef.current 
      ? gpsCoordsRef.current.lng 
      : (currentData.lng || 9.19);

    const color = getMarkerColor(currentData.pm25);
    const now = Date.now();

    // --- A. GESTIONE MARKER PRINCIPALE ---
    if (currentMarkerRef.current) {
      currentMarkerRef.current.setLatLng([effectiveLat, effectiveLng]);
      currentMarkerRef.current.setStyle({ color, fillColor: color });
    } else {
      currentMarkerRef.current = L.circleMarker([effectiveLat, effectiveLng], {
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(mapRef.current);

      pulseMarkerRef.current = L.circleMarker([effectiveLat, effectiveLng], {
        radius: 20,
        fillColor: color,
        color: color,
        weight: 0,
        opacity: 0,
        fillOpacity: 0.2
      }).addTo(mapRef.current);
    }
    
    if (pulseMarkerRef.current) {
        pulseMarkerRef.current.setLatLng([effectiveLat, effectiveLng]);
        pulseMarkerRef.current.setStyle({ fillColor: color, color: color });
    }

    // --- B. LOGICA PARTICLES (Core Logic Richiesta) ---
    // Verifica se abbiamo una posizione precedente valida per calcolare lo spostamento
    if (lastPositionRef.current) {
      const dist = distanceMeters(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        effectiveLat,
        effectiveLng
      );

      // CONDIZIONE DI RILASCIO: Spostamento > 3m E Tempo > 10s (o 5s se veloce)
      if (dist > 3 && now - lastDropRef.current > 10000) {
        
        // Creazione particella persistente
        const particle = L.circleMarker([effectiveLat, effectiveLng], {
          radius: 6,
          fillColor: color,
          color: color, // Bordo dello stesso colore
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.6,
          className: 'leaflet-particle-tech' // Classe CSS opzionale
        }).addTo(mapRef.current);

        particlesRef.current.push(particle);
        lastDropRef.current = now;

        // TTL: Decadimento automatico dopo 2 minuti (120000ms)
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.removeLayer(particle);
            particlesRef.current = particlesRef.current.filter(p => p !== particle);
          }
        }, 120000);
      }
    }

    // Aggiorna ultima posizione conosciuta
    lastPositionRef.current = { lat: effectiveLat, lng: effectiveLng };

    // --- C. PATH STORICO (Optional, tenuto leggero) ---
    // Nota: Usiamo la history delle props per coerenza, ma potremmo usare anche i punti locali
    const pathCoords = history
      .filter(d => d.lat && d.lng)
      .map(d => [d.lat!, d.lng!] as [number, number]);

    if (pathCoords.length > 1) {
      if (pathRef.current) {
        pathRef.current.setLatLngs(pathCoords);
      } else {
        pathRef.current = L.polyline(pathCoords, {
          color: 'rgba(255, 255, 255, 0.15)',
          weight: 2,
          dashArray: '5, 10',
          opacity: 0.5
        }).addTo(mapRef.current);
      }
    }

    // Pan fluido
    mapRef.current.panTo([effectiveLat, effectiveLng], { animate: true, duration: 1.0 });

  }, [currentData, history, mapReady, usingGPS]); // Aggiunto usingGPS alle dependency

  // Animazione Pulse (Leggera)
  useEffect(() => {
    if (!mapReady) return;
    let frameId: number;
    let start = performance.now();
    const animate = (time: number) => {
      const progress = ((time - start) % 2000) / 2000;
      if (pulseMarkerRef.current) {
        pulseMarkerRef.current.setRadius(8 + (progress * 20));
        pulseMarkerRef.current.setStyle({ fillOpacity: 0.4 * (1 - progress) });
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [mapReady]);

  return (
    <motion.div
      className="map-container bg-card border border-border rounded-xl overflow-hidden shadow-sm relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* --- HEADER TECNICO --- */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-sm z-10 relative">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Live Monitor</h2>
            <div className="flex items-center gap-2">
                {/* Indicatore Sorgente Dati */}
                {usingGPS ? (
                   <span className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                     <Satellite className="w-3 h-3" /> GPS LOCKED
                   </span>
                ) : (
                   <span className="text-[10px] font-mono text-yellow-500/80 flex items-center gap-1">
                     <Radio className="w-3 h-3" /> SENSOR LINK
                   </span>
                )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            isConnected ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-xs font-bold">{isConnected ? 'LIVE' : 'OFF'}</span>
          </div>
          
          <div className={`px-3 py-1.5 rounded-full border ${airQuality.badgeClass} flex items-center gap-2`}>
            <Wind className="w-3 h-3" />
            <span className="text-xs font-bold">{airQuality.label}</span>
          </div>
        </div>
      </div>

      {/* --- MAPPA --- */}
      <div className="relative group">
        <div ref={mapContainerRef} className="h-[400px] lg:h-[500px] w-full z-0" />
        
        {/* --- HUD OVERLAY (Cyberpunk Style) --- */}
        <div className="absolute bottom-4 left-4 right-4 z-[400] grid grid-cols-3 gap-2 pointer-events-none">
            {/* Latitudine */}
            <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-lg text-center shadow-lg">
                <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-1">LAT</div>
                <div className="font-mono text-xs text-white">
                  {(gpsAvailableRef.current && gpsCoordsRef.current ? gpsCoordsRef.current.lat : currentData.lat)?.toFixed(5) || '--'}
                </div>
            </div>
            {/* Longitudine */}
            <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-lg text-center shadow-lg">
                <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-1">LON</div>
                <div className="font-mono text-xs text-white">
                  {(gpsAvailableRef.current && gpsCoordsRef.current ? gpsCoordsRef.current.lng : currentData.lng)?.toFixed(5) || '--'}
                </div>
            </div>
            {/* Particles Count */}
            <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-lg text-center shadow-lg">
                <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-1">SAMPLES</div>
                <div className="font-mono text-xs text-primary">{particlesRef.current.length} <span className="text-[9px] text-muted-foreground">/ 2m</span></div>
            </div>
        </div>

        {/* GPS Warning Overlay (se richiesto ma non disponibile) */}
        {!usingGPS && !isConnected && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-[10px] px-3 py-1 rounded-full z-[500] backdrop-blur font-bold">
                NO SIGNAL SOURCE
            </div>
        )}
      </div>
    </motion.div>
  );
};

export default MapSection;