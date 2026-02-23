import { useState, useEffect, useCallback, useRef } from 'react';
import { SensorData } from '@/lib/airQuality';
import { io, Socket } from 'socket.io-client';

// URL del backend (assicurati che corrisponda a quello dell'ESP32 o usa window.location.origin se in prod)
// Se lavori in locale e il backend è su un'altra porta, metti l'URL intero, es: "http://localhost:3000"
const SERVER_URL = "https://air-quality-companion.onrender.com"; 

export const useSensorData = () => {
  const [currentData, setCurrentData] = useState<SensorData>({
    pm25: 0,
    pm10: 0,
    timestamp: new Date(),
    lat: 45.4642, // Default fallback (Milano)
    lng: 9.1900
  });
  
  const [history, setHistory] = useState<SensorData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // 1. Fetch dello storico iniziale (REST API)
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/data`);
        if (!response.ok) throw new Error('Errore fetch storico');
        
        const data = await response.json();
        
        // Mappatura dati backend -> formato frontend
        const formattedHistory: SensorData[] = data.map((item: any) => ({
          pm25: Number(item.pm25),
          pm10: Number(item.pm10),
          // Il backend manda 'lon', il frontend usa 'lng'
          lat: Number(item.lat),
          lng: Number(item.lon), 
          timestamp: new Date(item.timestamp)
        }));

        setHistory(formattedHistory);
        
        // Imposta l'ultimo dato come corrente se esiste
        if (formattedHistory.length > 0) {
          setCurrentData(formattedHistory[formattedHistory.length - 1]);
        }
      } catch (error) {
        console.error("Impossibile caricare lo storico:", error);
      }
    };

    fetchHistory();
  }, []);
  
  // 2. Connessione Socket.IO per dati Real-Time
  useEffect(() => {
    // Inizializza connessione socket
    socketRef.current = io(SERVER_URL);

    socketRef.current.on('connect', () => {
      console.log("Socket connesso!");
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log("Socket disconnesso");
      setIsConnected(false);
    });

    // Ascolta l'evento 'new-data' emesso dal backend quando l'ESP32 invia dati
    socketRef.current.on('new-data', (payload: any) => {
      console.log("Dato real-time ricevuto:", payload);
      const newData: SensorData = {
        pm25: Number(payload.pm25),
        pm10: Number(payload.pm10),
        lat: Number(payload.lat),
        lng: Number(payload.lon), // Mappatura lon -> lng
        timestamp: new Date(payload.timestamp)
      };

      // Aggiorna dato corrente
      setCurrentData(newData);

      // Aggiorna storico
      setHistory(prev => {
        const updated = [...prev, newData];
        // Mantieni ultimi 500 valori (o 1000 come da backend)
        return updated.slice(-500);
      });
    });
    
    // Cleanup alla dismount del componente
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);
  
  return { currentData, history, isConnected };
};

// GPS tracking hook (Resta invariato: traccia il browser dell'utente, non l'ESP)
export const useGPSTracking = () => {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata');
      return;
    }
    
    setIsTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);
  
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);
  
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);
  
  return { position, error, isTracking, startTracking, stopTracking };
};