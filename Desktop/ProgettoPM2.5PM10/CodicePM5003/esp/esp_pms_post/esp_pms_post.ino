#include <HardwareSerial.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <U8g2lib.h>

// ====================== CONFIGURAZIONE UTENTE ======================
const char* ssid = "iPhone di Francesco";   
const char* password = "Francy10";    
const char* serverUrl = "https://air-quality-companion-2.onrender.com/data";
const char* nodeId = "node-01"; 

// ====================== CONFIGURAZIONE PIN ======================
const int PM_TX_PIN = 8;    
const int PM_RX_PIN = 9;    
const int PIN_SDA = 4;
const int PIN_SCL = 5;
const int PIN_LED_WHITE = 2;  
const int PIN_LED_GREEN = 10; 
const int PIN_LED_RED = 3;    

// Display SH1106
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

// ====================== VARIABILI DI SISTEMA ======================
HardwareSerial pmsSerial(1); 
unsigned long lastSendTime = 0;
unsigned long lastScreenSwitch = 0;
const long PAGE_TIMEOUT = 10000; 

int pm25_val = 0;
int pm10_val = 0;
float latitude = 41.09023;   
float longitude = 14.32323;  

int currentScreen = 0; 
int historyPM25[12] = {0,0,0,0,0,0,0,0,0,0,0,0};
int sampleCount = 0; // Per calcolare la media reale

// ====================== SETUP ======================
void setup() {
  Serial.begin(115200);
  
  pinMode(PIN_LED_WHITE, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);

  // Test LED Startup
  digitalWrite(PIN_LED_WHITE, HIGH); delay(200); digitalWrite(PIN_LED_WHITE, LOW);
  digitalWrite(PIN_LED_GREEN, HIGH); delay(200); digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, HIGH);   delay(200); digitalWrite(PIN_LED_RED, LOW);

  Wire.begin(PIN_SDA, PIN_SCL);
  u8g2.begin();
  
  pmsSerial.begin(9600, SERIAL_8N1, PM_RX_PIN, PM_TX_PIN);
  WiFi.begin(ssid, password);
}

// ====================== LOOP PRINCIPALE ======================
void loop() {
  readPmsData();
  manageLeds();      
  updateDisplay();   

  // Logica Invio Dati (Invariata come richiesto)
  if (millis() - lastSendTime >= 10000) {
    if (pm25_val > 0) {
      // Aggiorna lo storico traslando i valori
      for(int i = 0; i < 11; i++) {
        historyPM25[i] = historyPM25[i+1];
      }
      historyPM25[11] = pm25_val;
      if(sampleCount < 12) sampleCount++;

      if (WiFi.status() == WL_CONNECTED) {
        sendDataToServer(pm25_val, pm10_val, latitude, longitude);
      }
    }
    lastSendTime = millis();
  }
}

// ====================== GESTIONE LED ======================
void manageLeds() {
  // LED Qualità (Verde/Rosso)
  if (pm25_val > 0) {
    digitalWrite(PIN_LED_GREEN, pm25_val <= 25 ? HIGH : LOW);
    digitalWrite(PIN_LED_RED, pm25_val > 25 ? HIGH : LOW);
  }

  // LED Bianco: Lampeggio intelligente pre-cambio
  unsigned long timeElapsed = millis() - lastScreenSwitch;
  if (timeElapsed >= 7500) { 
    digitalWrite(PIN_LED_WHITE, (millis() / 100) % 2); // Lampeggio veloce
  } else {
    digitalWrite(PIN_LED_WHITE, LOW);
  }
}

// ====================== GESTIONE DISPLAY ======================
void updateDisplay() {
  if (millis() - lastScreenSwitch >= PAGE_TIMEOUT) {
    currentScreen = (currentScreen + 1) % 3;
    lastScreenSwitch = millis();
  }

  u8g2.clearBuffer();

  // DISEGNO HEADER COMUNE
  u8g2.setFont(u8g2_font_6x10_tf);
  if (WiFi.status() == WL_CONNECTED) u8g2.drawStr(100, 10, "WiFi");
  else u8g2.drawStr(100, 10, "!!!");

  switch (currentScreen) {
    case 0: // --- DASHBOARD ---
      u8g2.drawRFrame(0, 0, 128, 62, 3); // Cornice arrotondata
      u8g2.setFont(u8g2_font_haxrcorp4089_tr);
      u8g2.drawStr(10, 12, "LIVE AIR MONITOR");
      
      u8g2.setFont(u8g2_font_helvB14_tf);
      u8g2.setCursor(10, 34); u8g2.print("PM2.5: "); u8g2.print(pm25_val);
      u8g2.setFont(u8g2_font_helvB10_tf);
      u8g2.setCursor(10, 54); u8g2.print("PM10 : "); u8g2.print(pm10_val);
      
      u8g2.setFont(u8g2_font_5x7_tr);
      u8g2.drawStr(95, 34, "ug/m3");
      u8g2.drawStr(95, 54, "ug/m3");
      break;

    case 1: // --- TREND WAVE ---
      u8g2.setFont(u8g2_font_haxrcorp4089_tr);
      u8g2.drawStr(5, 10, "2-MIN TREND (PM2.5)");
      u8g2.drawHLine(0, 13, 128);
      
      // Disegno l'onda con linee spesse
      for (int i = 0; i < 11; i++) {
        int x1 = i * 11 + 6;
        int x2 = (i + 1) * 11 + 6;
        // Mappatura: 0-100 ug/m3 mappati su 40 pixel di altezza (da y=55 a y=15)
        int y1 = 55 - map(constrain(historyPM25[i], 0, 100), 0, 100, 0, 40);
        int y2 = 55 - map(constrain(historyPM25[i+1], 0, 100), 0, 100, 0, 40);
        
        u8g2.drawLine(x1, y1, x2, y2);
        u8g2.drawLine(x1, y1+1, x2, y2+1); // Rende la linea più spessa
        u8g2.drawDisc(x2, y2, 2); // Nodo dell'onda
      }
      break;

    case 2: // --- ANALYTICS ---
      u8g2.setFont(u8g2_font_haxrcorp4089_tr);
      u8g2.drawStr(5, 10, "SENSORS STATISTICS");
      u8g2.drawHLine(0, 13, 128);
      
      int minV = 999, maxV = 0;
      long avgV = 0;
      for(int i = 12 - sampleCount; i < 12; i++) {
        if(historyPM25[i] < minV) minV = historyPM25[i];
        if(historyPM25[i] > maxV) maxV = historyPM25[i];
        avgV += historyPM25[i];
      }
      if(sampleCount > 0) avgV /= sampleCount; else minV = 0;

      u8g2.setFont(u8g2_font_6x12_tr);
      u8g2.setCursor(10, 30); u8g2.print("Peak Value:  "); u8g2.print(maxV);
      u8g2.setCursor(10, 43); u8g2.print("Lowest:      "); u8g2.print(minV);
      u8g2.setCursor(10, 56); u8g2.print("Average:     "); u8g2.print(avgV);
      break;
  }

  // Barra di progresso professionale in basso
  int progress = map(millis() - lastScreenSwitch, 0, PAGE_TIMEOUT, 0, 128);
  u8g2.drawBox(0, 63, progress, 1);

  u8g2.sendBuffer();
}

// ====================== LETTURA SENSORE ======================
void readPmsData() {
  if (pmsSerial.available() >= 32) {
    uint8_t data[32];
    pmsSerial.readBytes(data, 32);
    if (data[0] == 0x42 && data[1] == 0x4D) {
      pm25_val = data[12] << 8 | data[13];
      pm10_val = data[14] << 8 | data[15];
    }
    while (pmsSerial.available()) pmsSerial.read();
  }
}

// ====================== INVIO DATI ======================
void sendDataToServer(int pm25, int pm10, float lat, float lon) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.begin(client, serverUrl);
  https.addHeader("Content-Type", "application/json");
  String payload = "{\"node\":\"" + String(nodeId) + "\",\"pm25\":" + String(pm25) + ",\"pm10\":" + String(pm10) + ",\"lat\":" + String(lat, 6) + ",\"lon\":" + String(lon, 6) + "}";
  https.POST(payload);
  https.end();
}