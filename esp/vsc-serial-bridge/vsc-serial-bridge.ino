// VSC serial bridge: ESP32 <-> Nuaire VSC Linux console, over WiFi.
//
//   telnet / raw TCP  port 23   - interactive console (PuTTY "Raw" mode)
//   http://<host>/              - live log, send a line, Ctrl-C, baud, TX on/off
//   http://<host>/log           - last 16 KB of console output as plain text
//   http://<host>/status        - JSON: uptime, RSSI, baud, byte counters
//   ArduinoOTA                  - reflash over WiFi once it is installed
//
// Wiring: the VSC console is RS232 level, so go through a MAX3232 module
// (or at least a 10k series resistor on RX), never the red bus wire:
//   ESP RX (VSC_RX_PIN) <- VSC TX
//   ESP TX (VSC_TX_PIN) -> VSC RX
//   ESP GND             -  VSC 0V

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include "driver/uart.h"

// WiFi credentials are not in the code: on first boot (or if the saved network
// can't be joined) the ESP starts access point HOSTNAME / AP_PASS, and
// http://192.168.4.1/wifi stores them in flash.
#define HOSTNAME    "vsc-bridge"
#define AP_PASS     "nuaire123"

// GPIO16/17 are used by PSRAM on WROVER modules; pick e.g. 25/26 there.
#define VSC_RX_PIN  16
#define VSC_TX_PIN  17
#define DEFAULT_BAUD 115200

#define TELNET_PORT 23
#define LOG_SIZE    16384

static uint32_t baud = DEFAULT_BAUD;
static bool txEnabled = true;       // false = listen only, nothing reaches the VSC
// The VSC "LINUX TERMINAL" header is RS232 level (idle about -5 V), so its
// polarity is the opposite of TTL. Invert both lines; saved in flash.
static bool inverted = true;
static uint32_t rxBytes = 0, txBytes = 0;

static char logbuf[LOG_SIZE];
static size_t logHead = 0;
static bool logFull = false;

WiFiServer telnet(TELNET_PORT);
WiFiClient client;
WebServer web(80);
Preferences prefs;

static void logPut(const uint8_t *d, size_t n) {
  for (size_t i = 0; i < n; i++) {
    logbuf[logHead++] = (char)d[i];
    if (logHead == LOG_SIZE) { logHead = 0; logFull = true; }
  }
}

static String logText() {
  String s;
  s.reserve(LOG_SIZE + 1);
  if (logFull)
    for (size_t i = logHead; i < LOG_SIZE; i++) s += logbuf[i];
  for (size_t i = 0; i < logHead; i++) s += logbuf[i];
  return s;
}

static void applyInvert() {
  uart_set_line_inverse(UART_NUM_2, inverted ? (UART_SIGNAL_RXD_INV | UART_SIGNAL_TXD_INV) : 0);
}

static void vscWrite(const uint8_t *d, size_t n) {
  if (!txEnabled) return;
  Serial2.write(d, n);
  txBytes += n;
}

static const char PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VSC bridge</title>
<style>
body{font-family:sans-serif;margin:12px;background:#111;color:#ddd}
pre{background:#000;color:#9f9;padding:8px;height:65vh;overflow:auto;white-space:pre-wrap;word-break:break-all;font-size:12px}
input,select,button{font-size:15px;margin:2px}
#line{width:60%}
#st{font-size:12px;color:#aaa}
</style></head><body>
<div id="st">...</div>
<pre id="l"></pre>
<form id="f"><input id="line" autocomplete="off" placeholder="command, Enter to send">
<button>Send</button></form>
<button onclick="ctl(3)">Ctrl-C</button>
<button onclick="ctl(13)">Enter</button>
<select id="b" onchange="post('/baud?b='+this.value)">
<option>9600</option><option>38400</option><option>57600</option><option selected>115200</option></select>
<button onclick="post('/tx?on='+(tx?0:1))" id="txb">TX</button>
<button onclick="post('/inv?on='+(inv?0:1))" id="invb">inv</button>
<button onclick="post('/clear')">Clear log</button>
<label><input type="checkbox" id="fol" checked>follow</label>
<script>
let tx=true,inv=true;
const l=document.getElementById('l');
function post(u){return fetch(u,{method:'POST'}).then(upd)}
function ctl(c){post('/ctrl?c='+c)}
document.getElementById('f').onsubmit=e=>{e.preventDefault();
 const i=document.getElementById('line');
 post('/send?line='+encodeURIComponent(i.value));i.value='';};
async function upd(){
 try{
  const t=await (await fetch('/log')).text();
  l.textContent=t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
  if(document.getElementById('fol').checked)l.scrollTop=l.scrollHeight;
  const s=await (await fetch('/status')).json();
  tx=s.tx;
  document.getElementById('txb').textContent=tx?'TX on':'TX off (listen only)';
  inv=s.inv;
  document.getElementById('invb').textContent=inv?'RS232 (inverted)':'TTL (normal)';
  document.getElementById('b').value=s.baud;
  document.getElementById('st').textContent=
   `up ${s.uptime}s  rssi ${s.rssi} dBm  ${s.baud} baud  rx ${s.rx}  tx ${s.tx_bytes}  telnet ${s.telnet?'connected':'free'}`;
 }catch(e){}
}
setInterval(upd,1000);upd();
</script></body></html>)HTML";

static void handleStatus() {
  char j[200];
  snprintf(j, sizeof j,
           "{\"uptime\":%lu,\"rssi\":%d,\"baud\":%lu,\"tx\":%s,\"inv\":%s,\"rx\":%lu,\"tx_bytes\":%lu,\"telnet\":%s}",
           (unsigned long)(millis() / 1000), WiFi.RSSI(), (unsigned long)baud,
           txEnabled ? "true" : "false", inverted ? "true" : "false",
           (unsigned long)rxBytes, (unsigned long)txBytes,
           (client && client.connected()) ? "true" : "false");
  web.send(200, "application/json", j);
}

static const char WIFI_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VSC bridge WiFi</title>
<style>body{font-family:sans-serif;margin:16px;background:#111;color:#ddd}input,button{font-size:16px;margin:4px 0;width:100%;max-width:320px}</style>
</head><body><h3>VSC bridge: WiFi setup</h3>
<form method="POST" action="/wifi">
<input name="ssid" placeholder="WiFi name (SSID)" autocomplete="off"><br>
<input name="pass" type="password" placeholder="WiFi password"><br>
<button>Save and restart</button></form>
<p><a href="/" style="color:#9cf">Back to console</a></p></body></html>)HTML";

static void setupWeb() {
  web.on("/", HTTP_GET, [] { web.send_P(200, "text/html", PAGE); });
  web.on("/wifi", HTTP_GET, [] { web.send_P(200, "text/html", WIFI_PAGE); });
  web.on("/wifi", HTTP_POST, [] {
    prefs.putString("ssid", web.arg("ssid"));
    prefs.putString("pass", web.arg("pass"));
    web.send(200, "text/plain", "Saved. Restarting and joining the network...");
    delay(500);
    ESP.restart();
  });
  web.on("/log", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", logText()); });
  web.on("/status", HTTP_GET, handleStatus);
  web.on("/send", HTTP_POST, [] {
    String line = web.arg("line");
    vscWrite((const uint8_t *)line.c_str(), line.length());
    const uint8_t cr = '\r';
    vscWrite(&cr, 1);
    web.send(200, "text/plain", "ok");
  });
  web.on("/ctrl", HTTP_POST, [] {
    uint8_t c = (uint8_t)web.arg("c").toInt();
    vscWrite(&c, 1);
    web.send(200, "text/plain", "ok");
  });
  web.on("/baud", HTTP_POST, [] {
    uint32_t b = web.arg("b").toInt();
    if (b >= 1200 && b <= 921600) {
      baud = b;
      Serial2.updateBaudRate(baud);
    }
    web.send(200, "text/plain", "ok");
  });
  web.on("/tx", HTTP_POST, [] {
    txEnabled = web.arg("on") == "1";
    web.send(200, "text/plain", "ok");
  });
  web.on("/inv", HTTP_POST, [] {
    inverted = web.arg("on") == "1";
    prefs.putBool("inv", inverted);
    applyInvert();
    web.send(200, "text/plain", "ok");
  });
  web.on("/clear", HTTP_POST, [] {
    logHead = 0;
    logFull = false;
    web.send(200, "text/plain", "ok");
  });
  web.begin();
}

static void setupWifi() {
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  if (ssid.length()) {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(HOSTNAME);
    WiFi.setAutoReconnect(true);
    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi %s  IP %s\n", ssid.c_str(), WiFi.localIP().toString().c_str());
  } else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(HOSTNAME, AP_PASS);
    Serial.printf("AP %s (password %s)  setup page http://%s/wifi\n",
                  HOSTNAME, AP_PASS, WiFi.softAPIP().toString().c_str());
  }
}

void setup() {
  Serial.begin(115200);
  prefs.begin("bridge", false);
  Serial2.setRxBufferSize(4096);
  Serial2.begin(baud, SERIAL_8N1, VSC_RX_PIN, VSC_TX_PIN);
  inverted = prefs.getBool("inv", true);
  applyInvert();

  setupWifi();
  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.begin();
  setupWeb();
  telnet.begin();
  telnet.setNoDelay(true);
}

// Drop telnet option negotiation (IAC sequences) so it never reaches the console.
static int iacState = 0;

void loop() {
  ArduinoOTA.handle();
  web.handleClient();

  if (telnet.hasClient()) {
    if (client && client.connected()) {
      WiFiClient extra = telnet.available();
      extra.print("busy: one telnet client at a time\r\n");
      extra.stop();
    } else {
      client = telnet.available();
      client.setNoDelay(true);
      iacState = 0;
      client.printf("[vsc-bridge] %lu baud, TX %s\r\n", (unsigned long)baud, txEnabled ? "on" : "off");
    }
  }

  uint8_t buf[256];
  while (Serial2.available()) {
    size_t n = Serial2.readBytes(buf, min((size_t)Serial2.available(), sizeof buf));
    logPut(buf, n);
    rxBytes += n;
    if (client && client.connected()) client.write(buf, n);
  }

  while (client && client.connected() && client.available()) {
    uint8_t c = (uint8_t)client.read();
    if (iacState == 0 && c == 0xFF) { iacState = 1; continue; }
    if (iacState == 1) { iacState = (c >= 0xFB && c <= 0xFE) ? 2 : 0; continue; }
    if (iacState == 2) { iacState = 0; continue; }
    vscWrite(&c, 1);
  }
}
