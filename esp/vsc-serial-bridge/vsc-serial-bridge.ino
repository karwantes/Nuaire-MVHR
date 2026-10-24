// VSC serial bridge: ESP32 <-> Nuaire VSC Linux console, over WiFi.
//
//   telnet / raw TCP  port 23   - interactive console (PuTTY "Raw" mode)
//   http://<host>/              - live log, send a line, Ctrl-C, baud, TX on/off
//   http://<host>/log           - last 16 KB of console output as plain text
//   http://<host>/status        - JSON: uptime, RSSI, baud, byte counters
//   ArduinoOTA                  - reflash over WiFi once it is installed
//   http://<host>/bus           - RS485 bus listener: one line per frame, hex
//   http://<host>/buslog        - last 16 KB of bus frames as plain text
//   telnet / raw TCP  port 2323 - the same bus frames, live (read only)
//
// Wiring: the VSC console is RS232 level, so go through a MAX3232 module
// (or at least a 10k series resistor on RX), never the red bus wire:
//   ESP RX (VSC_RX_PIN) <- VSC TX
//   ESP TX (VSC_TX_PIN) -> VSC RX
//   ESP GND             -  VSC 0V
// RS485 tap, listen only, through a 3.3 V MAX3485 module (termination removed):
//   module A <- green, B <- yellow, GND <- blue and ESP GND, never red
//   module RO -> ESP BUS_RX_PIN, DE and /RE tied to GND, DI unconnected
//
// MQTT (optional, broker set at http://<host>/mqtt): Home Assistant discovery for
// fan speed 1/2/3, bypass auto/on/off, bypass setpoint and bypass state. It works
// through the /tmp control files of logger/i2clog.so, by typing shell lines on the
// console, so the console must be logged in (the bridge answers "login:" with root).

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include "driver/uart.h"
#include "mqtt_client.h"
#include <MD5Builder.h>

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

// RS485 bus listener (receive only, no TX pin is assigned).
#define BUS_RX_PIN  25
#define BUS_BAUD    1200
#define BUS_PORT    2323
#define BUS_GAP_MS  20      // 1200 baud is 8.3 ms per byte; a longer silence ends a frame
#define BUS_FRAME   64

static uint32_t baud = DEFAULT_BAUD;
static bool txEnabled = true;       // false = listen only, nothing reaches the VSC
// The VSC "LINUX TERMINAL" header is RS232 level (idle about -5 V), so its
// polarity is the opposite of TTL. Invert both lines; saved in flash.
static bool inverted = true;
static uint32_t rxBytes = 0, txBytes = 0;

static uint32_t busBaud = BUS_BAUD;
// The bus sends bytes MSB first, so a UART sees them bit-reversed (per the HA
// forum capture). With busRev on, frames are shown in the bus's own bit order.
static bool busRev = true;
static volatile uint32_t busBytes = 0, busFrames = 0, busDropped = 0;

struct Ring {
  char buf[LOG_SIZE];
  size_t head = 0;
  bool full = false;
};
static Ring conLog, busLog;

struct BusFrame {
  uint32_t t;
  uint8_t len;
  uint8_t d[BUS_FRAME];
};
static QueueHandle_t busQueue;

WiFiServer telnet(TELNET_PORT);
WiFiClient client;
WiFiServer busServer(BUS_PORT);
WiFiClient busClient;
WebServer web(80);
Preferences prefs;

static void ringPut(Ring &r, const uint8_t *d, size_t n) {
  for (size_t i = 0; i < n; i++) {
    r.buf[r.head++] = (char)d[i];
    if (r.head == LOG_SIZE) { r.head = 0; r.full = true; }
  }
}

static String ringText(const Ring &r) {
  String s;
  s.reserve(LOG_SIZE + 1);
  if (r.full)
    for (size_t i = r.head; i < LOG_SIZE; i++) s += r.buf[i];
  for (size_t i = 0; i < r.head; i++) s += r.buf[i];
  return s;
}

static uint8_t rev8(uint8_t b) {
  b = (b & 0xF0) >> 4 | (b & 0x0F) << 4;
  b = (b & 0xCC) >> 2 | (b & 0x33) << 2;
  return (b & 0xAA) >> 1 | (b & 0x55) << 1;
}

// Runs in its own task so frame gaps are timed even while the web server is
// busy sending a log. Complete frames go to loop() through busQueue.
static void busTask(void *) {
  BusFrame f;
  f.len = 0;
  uint32_t last = 0;
  for (;;) {
    int c = Serial1.read();
    uint32_t now = millis();
    if (c < 0) {
      if (f.len && now - last > BUS_GAP_MS) {
        if (xQueueSend(busQueue, &f, 0) != pdTRUE) busDropped++;
        busFrames++;
        f.len = 0;
      }
      vTaskDelay(1);
      continue;
    }
    if (f.len == BUS_FRAME) {
      if (xQueueSend(busQueue, &f, 0) != pdTRUE) busDropped++;
      busFrames++;
      f.len = 0;
    }
    if (!f.len) f.t = now;
    f.d[f.len++] = busRev ? rev8((uint8_t)c) : (uint8_t)c;
    last = now;
    busBytes++;
  }
}

// "  12.345  +700  3B C2 54 06": seconds since boot, ms since the previous frame, bytes
static void busDrain() {
  static uint32_t prevT = 0;
  BusFrame f;
  while (xQueueReceive(busQueue, &f, 0) == pdTRUE) {
    char line[32 + 3 * BUS_FRAME];
    int p = snprintf(line, sizeof line, "%6lu.%03lu %+6ld ",
                     (unsigned long)(f.t / 1000), (unsigned long)(f.t % 1000),
                     prevT ? (long)(f.t - prevT) : 0L);
    prevT = f.t;
    for (int i = 0; i < f.len; i++) p += snprintf(line + p, sizeof line - p, " %02X", f.d[i]);
    line[p++] = '\n';
    ringPut(busLog, (const uint8_t *)line, p);
    if (busClient && busClient.connected()) busClient.write((const uint8_t *)line, p);
  }
}

static void applyInvert() {
  uart_set_line_inverse(UART_NUM_2, inverted ? (UART_SIGNAL_RXD_INV | UART_SIGNAL_TXD_INV) : 0);
}

static void vscWrite(const uint8_t *d, size_t n) {
  if (!txEnabled) return;
  Serial2.write(d, n);
  txBytes += n;
}

// ---- MQTT / Home Assistant ----
#define MQ_BASE     "vsc"
#define MQ_POLL_MS  20000

struct MqMsg {
  char topic[40];
  char data[16];
};
static esp_mqtt_client_handle_t mq = nullptr;
static QueueHandle_t mqQueue;
static volatile bool mqConnected = false, mqAnnounce = false;
static String mqHost;
static uint32_t mqLastPoll = 0;
static volatile uint32_t mqManual = 0;   // last /send; the poll waits 30 s so it can't land inside a typed heredoc
static int mqBypassTemp = 0;    // last setpoint sent; the unit can't report it
// The VSC answers each poll with an @S line. After 3 polls with no answer (VSC off, unplugged
// or not logged in) vsc/vsc_status goes offline: comms shows OFF and the unit's entities unavailable.
#define MQ_NO_REPLY 3
static int mqNoReply = 0;
static bool mqVscOnline = false;
// Airflow % for supply speed 1/2/3 then extract speed 1/2/3, as /tmp/airflow_state reports it.
static const char *const AIR_KEY[6] = {"air_s1", "air_s2", "air_s3", "air_e1", "air_e2", "air_e3"};
static int mqAir[6];
static bool mqAirKnown = false;
// Fault bits from /tmp/sensors P8/P9 (active low: a clear bit is a fault). Heater fault, Cooler
// fault and "Test routine required" still need testing: the heater and cooler bits were only seen
// on a unit with neither fitted (names from es-lcd's fault text), and p9 0x04 is also what es-lcd
// draws as fan bar 3. Disable the heater/cooler entities in HA if the unit has none.
static const char *const FAULT_KEY[6] = {"fault_supply_fan", "fault_extract_fan", "fault_heater", "fault_cooler", "fault_frost", "test_required"};
static const char *const FAULT_NAME[6] = {"Supply fan fault", "Extract fan fault", "Heater fault", "Cooler fault", "Frost fault", "Test routine required"};
static const uint8_t FAULT_BYTE[6] = {8, 8, 8, 8, 9, 9}, FAULT_BIT[6] = {0x08, 0x20, 0x40, 0x80, 0x20, 0x04};

// One console line that reports the state. "@""S" so the echoed command line
// doesn't look like the answer.
#define POLL_CMD "echo \"@\"\"S\" $(cat /tmp/bypass_state 2>/dev/null) \"@\"\"T\" $(cat /tmp/sensors 2>/dev/null) \"@\"\"R\" $(cat /tmp/runtime 2>/dev/null) \"@\"\"C\" $(cat /tmp/screen_state 2>/dev/null) \"@\"\"M\" $(cat /tmp/modes 2>/dev/null) \"@\"\"A\" $(cat /tmp/airflow_state 2>/dev/null) $(ls /tmp/speed2 /tmp/speed3 /tmp/bypass_on /tmp/bypass_off /tmp/debug 2>/dev/null)"

static void mqPub(const char *topic, const char *payload, bool retain = true) {
  if (mq && mqConnected) esp_mqtt_client_publish(mq, topic, payload, 0, 0, retain);
}

// Debug log lines also go out once a second as one JSON batch, {"seq":N,"lines":"a\nb"},
// for the "Debug log" sensor: HA's recorder keeps each batch, so the log can be read
// back from HA history. Kept under HA's 16 KB attribute limit.
#define MQ_LOG_MS   1000
#define MQ_LOG_MAX  3500
static String mqLogBatch;
static uint32_t mqLogT = 0, mqLogSeq = 0;

static void mqLogFlush() {
  if (!mqLogBatch.length()) return;
  String j = "{\"seq\":" + String(++mqLogSeq) + ",\"lines\":\"" + mqLogBatch + "\"}";
  mqPub(MQ_BASE "/log_batch", j.c_str(), false);
  mqLogBatch = "";
}

static void mqLogAdd(const char *s) {
  if (mqLogBatch.length() > MQ_LOG_MAX) mqLogFlush();
  if (mqLogBatch.length()) mqLogBatch += "\\n";
  else mqLogT = millis();
  for (; *s; s++) {
    if (*s == '"' || *s == '\\') mqLogBatch += '\\';
    if ((uint8_t)*s >= 0x20) mqLogBatch += *s;
  }
}

static void vscLine(const String &s) {
  vscWrite((const uint8_t *)s.c_str(), s.length());
  const uint8_t cr = '\r';
  vscWrite(&cr, 1);
}

// ---- File upload to the unit ----
// POST /upload?to=/path with a file: the ESP types it to the shell as a uuencoded
// heredoc, decodes it to <to>.up, renames it over <to> (safe for a file in use)
// and checks the unit's md5 against its own. GET /upload reports progress.
#define UP_MAX      65536
#define UP_LINE_MS  30      // between heredoc lines, so the unit's tty keeps up
#define UP_WAIT_MS  20000   // for the md5 reply

static uint8_t *upBuf = nullptr;
static size_t upLen = 0, upPos = 0;
static bool upFull = false, upHead = false;
static int upState = 0;          // 0 idle, 1 sending, 2 waiting for the md5
static uint32_t upT = 0;
static String upTo, upMd5, upUnitMd5, upResult = "idle";

static bool upPathOk(const String &p) {
  if (p.length() < 2 || p.length() > 100 || p[0] != '/') return false;
  for (size_t i = 0; i < p.length(); i++) {
    char c = p[i];
    if (!isalnum((unsigned char)c) && c != '/' && c != '.' && c != '_' && c != '-') return false;
  }
  return true;
}

static void upStep() {
  if (!upState) return;
  uint32_t now = millis();
  mqManual = now;   // the MQTT poll stays away until 30 s after the upload
  if (upState == 2) {
    if (now - upT > UP_WAIT_MS) { upResult = "no reply from the unit"; upState = 0; }
    return;
  }
  if (now - upT < UP_LINE_MS) return;
  upT = now;
  if (!upHead) {
    vscLine("cat > /tmp/up.uu <<'XEOF'");
    vscLine("begin 644 " + upTo + ".up");
    upHead = true;
    return;
  }
  if (upPos < upLen) {
    size_t n = min((size_t)45, upLen - upPos);
    char l[64];
    int k = 0;
    l[k++] = 32 + n;
    for (size_t i = 0; i < n; i += 3) {
      uint8_t a = upBuf[upPos + i], b = i + 1 < n ? upBuf[upPos + i + 1] : 0, c = i + 2 < n ? upBuf[upPos + i + 2] : 0;
      uint8_t q[4] = {(uint8_t)(a >> 2), (uint8_t)((a << 4 | b >> 4) & 63), (uint8_t)((b << 2 | c >> 6) & 63), (uint8_t)(c & 63)};
      for (int j = 0; j < 4; j++) l[k++] = q[j] ? q[j] + 32 : '`';
    }
    l[k] = 0;
    vscLine(l);
    upPos += n;
    return;
  }
  vscLine("`");
  vscLine("end");
  vscLine("XEOF");
  vscLine("uudecode /tmp/up.uu && mv " + upTo + ".up " + upTo + "; rm -f /tmp/up.uu; echo \"@\"\"U $(md5sum < " + upTo + ")\"");
  free(upBuf);
  upBuf = nullptr;
  upState = 2;
  upResult = "checking";
}

// "@U <md5>  -" from the unit ends the upload.
static void upReply(const char *line) {
  if (upState != 2 || line[0] != '@' || line[1] != 'U' || line[2] != ' ') return;
  upUnitMd5 = String(line + 3).substring(0, 32);
  upResult = upUnitMd5 == upMd5 ? "ok" : "md5 mismatch";
  upState = 0;
}

static void mqEvent(void *, esp_event_base_t, int32_t id, void *data) {
  esp_mqtt_event_handle_t e = (esp_mqtt_event_handle_t)data;
  if (id == MQTT_EVENT_CONNECTED) {
    mqConnected = true;
    mqAnnounce = true;
    esp_mqtt_client_subscribe(mq, MQ_BASE "/+/set", 0);
    esp_mqtt_client_subscribe(mq, "homeassistant/status", 0);
  } else if (id == MQTT_EVENT_DISCONNECTED) {
    mqConnected = false;
  } else if (id == MQTT_EVENT_DATA && e->topic_len) {
    MqMsg m;
    snprintf(m.topic, sizeof m.topic, "%.*s", e->topic_len, e->topic);
    snprintf(m.data, sizeof m.data, "%.*s", e->data_len, e->data);
    xQueueSend(mqQueue, &m, 0);
  }
}

// vscAvty: the entity also needs the VSC to answer (vsc/vsc_status), not only the ESP online.
static void mqDiscovery(const char *comp, const char *key, const char *name, const char *extra, bool vscAvty = true) {
  char topic[80], j[768];
  snprintf(topic, sizeof topic, "homeassistant/%s/vsc_bridge/%s/config", comp, key);
  snprintf(j, sizeof j,
           "{\"name\":\"%s\",\"uniq_id\":\"vsc_bridge_%s\",\"obj_id\":\"mrxbox_%s\",%s,%s,"
           "\"dev\":{\"ids\":[\"vsc_bridge\"],\"name\":\"MRXBOX\",\"mf\":\"Nuaire\",\"mdl\":\"MRXBOX VSC\"}}",
           name, key, key,
           vscAvty ? "\"avty\":[{\"t\":\"" MQ_BASE "/status\"},{\"t\":\"" MQ_BASE "/vsc_status\"}],\"avty_mode\":\"all\""
                   : "\"avty_t\":\"" MQ_BASE "/status\"",
           extra);
  mqPub(topic, j);
}

static void mqVsc(bool online) {
  if (online == mqVscOnline) return;
  mqVscOnline = online;
  mqPub(MQ_BASE "/vsc_status", online ? "online" : "offline");
  if (!online) mqPub(MQ_BASE "/comms", "OFF");
}

static void mqAnnounceAll() {
  mqDiscovery("select", "speed", "Fan speed",
              "\"stat_t\":\"" MQ_BASE "/speed\",\"cmd_t\":\"" MQ_BASE "/speed/set\",\"options\":[\"1\",\"2\",\"3\"],\"ic\":\"mdi:fan\"");
  mqDiscovery("select", "bypass", "Bypass",
              "\"stat_t\":\"" MQ_BASE "/bypass\",\"cmd_t\":\"" MQ_BASE "/bypass/set\",\"options\":[\"Auto\",\"On\",\"Off\"],\"ic\":\"mdi:valve\"");
  mqDiscovery("number", "bypass_temp", "Bypass setpoint",
              "\"stat_t\":\"" MQ_BASE "/bypass_temp\",\"cmd_t\":\"" MQ_BASE "/bypass_temp/set\",\"min\":15,\"max\":30,\"step\":1,"
              "\"unit_of_meas\":\"°C\",\"mode\":\"box\",\"ic\":\"mdi:thermometer\"");
  mqDiscovery("binary_sensor", "bypass_state", "Bypass active",
              "\"stat_t\":\"" MQ_BASE "/bypass_state\",\"ic\":\"mdi:valve-open\"");
  mqDiscovery("switch", "debug", "Debug logging",
              "\"stat_t\":\"" MQ_BASE "/debug\",\"cmd_t\":\"" MQ_BASE "/debug/set\",\"ent_cat\":\"config\",\"ic\":\"mdi:text-box-search\"");
  mqDiscovery("sensor", "debug_log", "Debug log",
              "\"stat_t\":\"" MQ_BASE "/log_batch\",\"val_tpl\":\"{{ value_json.seq }}\",\"json_attr_t\":\"" MQ_BASE "/log_batch\","
              "\"ent_cat\":\"diagnostic\",\"ic\":\"mdi:text-long\"", false);
  mqDiscovery("sensor", "humidity", "Humidity",
              "\"stat_t\":\"" MQ_BASE "/humidity\",\"dev_cla\":\"humidity\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"%\"");
  mqDiscovery("sensor", "temp_extract", "Extract air temperature",
              "\"stat_t\":\"" MQ_BASE "/temp_extract\",\"dev_cla\":\"temperature\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"°C\"");
  mqDiscovery("sensor", "temp_intake", "Intake air temperature",
              "\"stat_t\":\"" MQ_BASE "/temp_intake\",\"dev_cla\":\"temperature\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"°C\"");
  mqDiscovery("sensor", "fan_running", "Running fan speed",
              "\"stat_t\":\"" MQ_BASE "/fan_running\",\"ic\":\"mdi:fan-auto\"");
  mqDiscovery("binary_sensor", "comms", "Communication with unit",
              "\"stat_t\":\"" MQ_BASE "/comms\",\"dev_cla\":\"connectivity\",\"ent_cat\":\"diagnostic\"", false);
  for (int i = 0; i < 6; i++) {
    char extra[200];
    snprintf(extra, sizeof extra, "\"stat_t\":\"" MQ_BASE "/%s\",\"dev_cla\":\"problem\",\"ent_cat\":\"diagnostic\"", FAULT_KEY[i]);
    mqDiscovery("binary_sensor", FAULT_KEY[i], FAULT_NAME[i], extra);
  }
  for (int i = 0; i < 6; i++) {
    char name[40], extra[256];
    snprintf(name, sizeof name, "%s speed %d airflow", i < 3 ? "Supply" : "Extract", i % 3 + 1);
    snprintf(extra, sizeof extra,
             "\"stat_t\":\"" MQ_BASE "/%s\",\"cmd_t\":\"" MQ_BASE "/%s/set\",\"min\":1,\"max\":100,\"step\":1,"
             "\"unit_of_meas\":\"%%\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:%s\"",
             AIR_KEY[i], AIR_KEY[i], i < 3 ? "fan-chevron-down" : "fan-chevron-up");
    mqDiscovery("number", AIR_KEY[i], name, extra);
  }
  mqDiscovery("number", "screen_timeout", "Screen timeout",
              "\"stat_t\":\"" MQ_BASE "/screen_timeout\",\"cmd_t\":\"" MQ_BASE "/screen_timeout/set\",\"min\":0,\"max\":120,\"step\":1,"
              "\"unit_of_meas\":\"min\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:monitor-off\"");
  mqDiscovery("sensor", "run_hours", "Run hours",
              "\"stat_t\":\"" MQ_BASE "/run_hours\",\"dev_cla\":\"duration\",\"stat_cla\":\"total_increasing\",\"unit_of_meas\":\"h\","
              "\"ent_cat\":\"diagnostic\",\"ic\":\"mdi:timer-outline\"");
  mqDiscovery("sensor", "filter_hours", "Filter hours",
              "\"stat_t\":\"" MQ_BASE "/filter_hours\",\"dev_cla\":\"duration\",\"stat_cla\":\"total_increasing\",\"unit_of_meas\":\"h\","
              "\"ic\":\"mdi:air-filter\"");
  mqDiscovery("binary_sensor", "filter_change", "Filter change due",
              "\"stat_t\":\"" MQ_BASE "/filter_change\",\"dev_cla\":\"problem\",\"ic\":\"mdi:air-filter\"");
  mqDiscovery("button", "filter_reset", "Reset filter hours",
              "\"cmd_t\":\"" MQ_BASE "/filter_reset/set\",\"ent_cat\":\"config\",\"ic\":\"mdi:restore\"");
  mqDiscovery("number", "humidity_sp", "Humidity setpoint",
              "\"stat_t\":\"" MQ_BASE "/humidity_sp\",\"cmd_t\":\"" MQ_BASE "/humidity_sp/set\",\"min\":50,\"max\":85,\"step\":1,"
              "\"unit_of_meas\":\"%\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:water-percent\"");
  mqDiscovery("number", "frost_sp", "Frost protection level",
              "\"stat_t\":\"" MQ_BASE "/frost_sp\",\"cmd_t\":\"" MQ_BASE "/frost_sp/set\",\"min\":-5,\"max\":0,\"step\":1,"
              "\"unit_of_meas\":\"°C\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:snowflake-thermometer\"");
  mqDiscovery("switch", "night", "Night mode",
              "\"stat_t\":\"" MQ_BASE "/night\",\"cmd_t\":\"" MQ_BASE "/night/set\",\"ic\":\"mdi:weather-night\"");
  mqDiscovery("switch", "holiday", "Holiday mode",
              "\"stat_t\":\"" MQ_BASE "/holiday\",\"cmd_t\":\"" MQ_BASE "/holiday/set\",\"ic\":\"mdi:bag-suitcase\"");
  mqPub(MQ_BASE "/status", "online");
  mqPub(MQ_BASE "/vsc_status", mqVscOnline ? "online" : "offline");
  if (!mqVscOnline) mqPub(MQ_BASE "/comms", "OFF");
  if (mqBypassTemp) mqPub(MQ_BASE "/bypass_temp", String(mqBypassTemp).c_str());
  mqLastPoll = 0;   // poll now
}

// A command from HA: type the shell line, then poll so HA sees the result.
static void mqHandle(const char *topic, const char *data) {
  String t = topic, d = data;
  if (t == "homeassistant/status") {
    if (d == "online") mqAnnounce = true;
    return;
  }
  String cmd;
  if (t == MQ_BASE "/speed/set") {
    if (d == "1") cmd = "rm -f /tmp/speed2 /tmp/speed3";
    else if (d == "2") cmd = "rm -f /tmp/speed3; touch /tmp/speed2";
    else if (d == "3") cmd = "rm -f /tmp/speed2; touch /tmp/speed3";
  } else if (t == MQ_BASE "/bypass/set") {
    if (d == "Auto") cmd = "rm -f /tmp/bypass_on /tmp/bypass_off";
    else if (d == "On") cmd = "rm -f /tmp/bypass_off; touch /tmp/bypass_on";
    else if (d == "Off") cmd = "rm -f /tmp/bypass_on; touch /tmp/bypass_off";
  } else if (t == MQ_BASE "/bypass_temp/set") {
    int v = (int)d.toFloat();
    if (v >= 15 && v <= 30) {
      cmd = "echo " + String(v) + " > /tmp/bypasstemp";
      mqBypassTemp = v;
      mqPub(MQ_BASE "/bypass_temp", String(v).c_str());
    }
  } else if (t == MQ_BASE "/debug/set") {
    if (d == "ON") cmd = "touch /tmp/debug";
    else if (d == "OFF") cmd = "rm -f /tmp/debug";
  } else if (t == MQ_BASE "/screen_timeout/set") {
    int v = (int)d.toFloat();
    if (v >= 0 && v <= 120) cmd = "echo " + String(v) + " > /tmp/screen_timeout; sleep 2";
  } else if (t == MQ_BASE "/humidity_sp/set") {
    int v = (int)d.toFloat();
    if (v >= 50 && v <= 85) cmd = "echo " + String(v) + " > /tmp/humidity_sp; sleep 2";
  } else if (t == MQ_BASE "/frost_sp/set") {
    int v = (int)d.toFloat();
    if (v >= -5 && v <= 0) cmd = "echo " + String(-v) + " > /tmp/frost_sp; sleep 2";
  } else if (t == MQ_BASE "/night/set" || t == MQ_BASE "/holiday/set") {
    const char *f = t == MQ_BASE "/night/set" ? "/tmp/night" : "/tmp/holiday";
    if (d == "ON" || d == "OFF") cmd = String("echo ") + (d == "ON" ? "1" : "0") + " > " + f + "; sleep 2";
  } else if (t == MQ_BASE "/filter_reset/set") {
    cmd = "touch /tmp/filter_reset; sleep 2";
  } else if (t.startsWith(MQ_BASE "/air_") && t.endsWith("/set") && mqAirKnown) {
    // The unit takes all six at once; the poll then puts HA back to what the unit has.
    int v = (int)d.toFloat();
    for (int i = 0; i < 6; i++)
      if (t == String(MQ_BASE "/") + AIR_KEY[i] + "/set" && v >= 1 && v <= 100) {
        int a[6];
        for (int k = 0; k < 6; k++) a[k] = k == i ? v : mqAir[k];
        cmd = "echo";
        for (int k = 0; k < 6; k++) cmd += " " + String(a[k]);
        cmd += " > /tmp/airflow; sleep 2";   // es-lcd picks it up on its next frame
      }
  }
  if (!cmd.length()) return;
  vscLine(cmd + "; " POLL_CMD);
  mqLastPoll = millis();
}

// "@T EXT IN RH SPD P8 P9" (/tmp/sensors) -> sensor topics. "-" is a sensor fault: HA shows
// "None" as unknown. P8 = P9 = 255 is no communications with the unit.
static void mqSensors(const char *t) {
  if (!t) return;
  char tok[6][8];
  if (sscanf(t + 2, "%7s %7s %7s %7s %7s %7s", tok[0], tok[1], tok[2], tok[3], tok[4], tok[5]) != 6) return;
  int p8 = atoi(tok[4]), p9 = atoi(tok[5]);
  bool comms = !(p8 == 255 && p9 == 255);
  mqPub(MQ_BASE "/comms", comms ? "ON" : "OFF");
  static const char *const KEY[4] = {"temp_extract", "temp_intake", "humidity", "fan_running"};
  for (int i = 0; i < 4; i++) {
    char topic[32];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", KEY[i]);
    bool fault = tok[i][0] == '-' && !tok[i][1];   // "-5" is a temperature, "-" a fault
    mqPub(topic, !comms || fault ? "None" : tok[i]);
  }
  for (int i = 0; i < 6; i++) {
    char topic[40];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", FAULT_KEY[i]);
    int b = FAULT_BYTE[i] == 8 ? p8 : p9;
    mqPub(topic, !comms ? "None" : (b & FAULT_BIT[i]) ? "OFF" : "ON");
  }
}

// "@L <log line>" -> vsc/log (only while debug logging is on);
// "@S 1 @A 18 32 100 18 32 100 /tmp/speed2 /tmp/bypass_on" -> state topics
static void mqParse(const char *line) {
  if (line[0] == '@' && line[1] == 'L' && line[2] == ' ') {
    mqPub(MQ_BASE "/log", line + 3, false);
    if (mqConnected) mqLogAdd(line + 3);
    return;
  }
  const char *p = strstr(line, "@S");
  if (!p || (p[2] != ' ' && p[2] != 0)) return;
  p += 2;
  mqNoReply = 0;
  mqVsc(true);
  bool s2 = strstr(p, "/tmp/speed2"), s3 = strstr(p, "/tmp/speed3");
  bool bon = strstr(p, "/tmp/bypass_on"), boff = strstr(p, "/tmp/bypass_off");
  while (*p == ' ') p++;
  mqPub(MQ_BASE "/speed", s3 ? "3" : s2 ? "2" : "1");
  mqPub(MQ_BASE "/bypass", bon ? "On" : boff ? "Off" : "Auto");
  mqPub(MQ_BASE "/debug", strstr(p, "/tmp/debug") ? "ON" : "OFF");
  if (*p == '0' || *p == '1') mqPub(MQ_BASE "/bypass_state", *p == '1' ? "ON" : "OFF");
  mqSensors(strstr(p, "@T"));
  // "@R RUN FILTER" (/tmp/runtime): es-lcd shows the filter icon above 8759 hours (one year)
  unsigned long run, filt;
  const char *r = strstr(p, "@R");
  if (r && sscanf(r + 2, "%lu %lu", &run, &filt) == 2) {
    mqPub(MQ_BASE "/run_hours", String(run).c_str());
    mqPub(MQ_BASE "/filter_hours", String(filt).c_str());
    mqPub(MQ_BASE "/filter_change", filt > 8759 ? "ON" : "OFF");
  }
  int scr;
  const char *c = strstr(p, "@C");
  if (c && sscanf(c + 2, "%d", &scr) == 1) mqPub(MQ_BASE "/screen_timeout", String(scr).c_str());
  // "@M HUM FROST NIGHT HOLIDAY" (/tmp/modes): frost as 0-5 (= 0 to -5 °C), night/holiday minutes left
  int hum, frost, night, hol;
  const char *m = strstr(p, "@M");
  if (m && sscanf(m + 2, "%d %d %d %d", &hum, &frost, &night, &hol) == 4) {
    mqPub(MQ_BASE "/humidity_sp", String(hum).c_str());
    mqPub(MQ_BASE "/frost_sp", String(-frost).c_str());
    mqPub(MQ_BASE "/night", night ? "ON" : "OFF");
    mqPub(MQ_BASE "/holiday", hol ? "ON" : "OFF");
  }
  const char *a = strstr(p, "@A");
  if (!a) return;
  int v[6];
  if (sscanf(a + 2, "%d %d %d %d %d %d", &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]) != 6) return;
  for (int i = 0; i < 6; i++) {
    mqAir[i] = v[i];
    char topic[24];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", AIR_KEY[i]);
    mqPub(topic, String(v[i]).c_str());
  }
  mqAirKnown = true;
}

// Console bytes: assemble lines for mqParse, and log in when "login:" shows up.
static void mqConsole(const uint8_t *d, size_t n) {
  static char line[320];
  static size_t len = 0;
  for (size_t i = 0; i < n; i++) {
    char c = (char)d[i];
    if (c == '\n' || c == '\r') {
      line[len] = 0;
      if (len) {
        upReply(line);
        mqParse(line);
      }
      len = 0;
      continue;
    }
    if (len < sizeof line - 1) line[len++] = c;
    if (len >= 6 && !memcmp(line + len - 6, "login:", 6) && mq) {
      vscLine("root");
      mqLastPoll = millis() - MQ_POLL_MS + 3000;   // poll 3 s after logging in
    }
  }
}

static void setupMqtt() {
  mqHost = prefs.getString("mqhost", "");
  mqBypassTemp = prefs.getInt("mqbtemp", 0);
  if (!mqHost.length() || WiFi.status() != WL_CONNECTED) return;
  static String user, pass;
  user = prefs.getString("mquser", "");
  pass = prefs.getString("mqpass", "");
  mqQueue = xQueueCreate(8, sizeof(MqMsg));
  esp_mqtt_client_config_t c = {};
  c.broker.address.hostname = mqHost.c_str();
  c.broker.address.port = prefs.getUInt("mqport", 1883);
  c.broker.address.transport = MQTT_TRANSPORT_OVER_TCP;
  c.credentials.client_id = HOSTNAME;
  if (user.length()) c.credentials.username = user.c_str();
  if (pass.length()) c.credentials.authentication.password = pass.c_str();
  c.session.last_will.topic = MQ_BASE "/status";
  c.session.last_will.msg = "offline";
  c.session.last_will.retain = 1;
  c.session.keepalive = 30;
  c.buffer.out_size = 4096;   // a log batch in one message
  mq = esp_mqtt_client_init(&c);
  esp_mqtt_client_register_event(mq, MQTT_EVENT_ANY, mqEvent, nullptr);
  esp_mqtt_client_start(mq);
}

static void mqLoop() {
  if (!mq || upState) return;   // HA commands wait until an upload is done
  MqMsg m;
  while (xQueueReceive(mqQueue, &m, 0) == pdTRUE) mqHandle(m.topic, m.data);
  if (!mqConnected) return;
  if (mqAnnounce) {
    mqAnnounce = false;
    mqAnnounceAll();
  }
  if (mqLogBatch.length() && millis() - mqLogT >= MQ_LOG_MS) mqLogFlush();
  if ((!mqLastPoll || millis() - mqLastPoll >= MQ_POLL_MS) && (!mqManual || millis() - mqManual >= 30000)) {
    mqLastPoll = millis();
    if (mqNoReply >= MQ_NO_REPLY) mqVsc(false);
    else mqNoReply++;
    vscLine(POLL_CMD);
  }
  static int savedTemp = 0;
  if (mqBypassTemp != savedTemp) {
    savedTemp = mqBypassTemp;
    prefs.putInt("mqbtemp", mqBypassTemp);
  }
}

static const char MQTT_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VSC bridge MQTT</title>
<style>body{font-family:sans-serif;margin:16px;background:#111;color:#ddd}input,button{font-size:16px;margin:4px 0;width:100%;max-width:320px}</style>
</head><body><h3>VSC bridge: MQTT broker</h3>
<p>Home Assistant finds the MRXBOX by MQTT discovery. Leave the host empty to turn MQTT off.</p>
<form method="POST" action="/mqtt">
<input name="host" placeholder="broker host or IP" autocomplete="off"><br>
<input name="port" placeholder="port (1883)" autocomplete="off"><br>
<input name="user" placeholder="user" autocomplete="off"><br>
<input name="pass" type="password" placeholder="password"><br>
<button>Save and restart</button></form>
<p><a href="/" style="color:#9cf">Back to console</a></p></body></html>)HTML";

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
<a href="/bus" style="color:#9cf">RS485 bus</a>
<form id="uf">Upload to unit: <input type="file" id="uff"> as <input id="uto" placeholder="/path/on/unit" autocomplete="off">
<button>Upload</button> <span id="ust"></span></form>
<script>
document.getElementById('uf').onsubmit=async e=>{e.preventDefault();
 const f=document.getElementById('uff').files[0],to=document.getElementById('uto').value,st=document.getElementById('ust');
 if(!f||!to){st.textContent='pick a file and a path';return}
 const d=new FormData();d.append('f',f);
 const r=await fetch('/upload?to='+encodeURIComponent(to),{method:'POST',body:d});
 st.textContent=await r.text();if(!r.ok)return;
 const t=setInterval(async()=>{const s=await (await fetch('/upload')).json();
  st.textContent=s.state+'  '+s.sent+'/'+s.size+(s.unit_md5?'  unit md5 '+s.unit_md5:'');
  if(!/^(sending|checking)/.test(s.state))clearInterval(t)},1000)};
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

static const char BUS_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VSC bus</title>
<style>
body{font-family:sans-serif;margin:12px;background:#111;color:#ddd}
pre{background:#000;color:#fd8;padding:8px;height:70vh;overflow:auto;white-space:pre;font-size:12px}
select,button{font-size:15px;margin:2px}
#st{font-size:12px;color:#aaa}
</style></head><body>
<div id="st">...</div>
<pre id="l"></pre>
<select id="b" onchange="post('/busbaud?b='+this.value)">
<option>1200</option><option>2400</option><option>4800</option><option>9600</option><option>19200</option></select>
<button onclick="post('/busrev?on='+(rev?0:1))" id="revb">rev</button>
<button onclick="post('/busclear')">Clear</button>
<label><input type="checkbox" id="fol" checked>follow</label>
<a href="/" style="color:#9cf">Console</a>
<script>
let rev=true;
const l=document.getElementById('l');
function post(u){return fetch(u,{method:'POST'}).then(upd)}
async function upd(){
 try{
  l.textContent=await (await fetch('/buslog')).text();
  if(document.getElementById('fol').checked)l.scrollTop=l.scrollHeight;
  const s=await (await fetch('/status')).json();
  rev=s.bus_rev;
  document.getElementById('revb').textContent=rev?'Bits: MSB first (reversed)':'Bits: as received';
  document.getElementById('b').value=s.bus_baud;
  document.getElementById('st').textContent=
   `RS485 GPIO25  ${s.bus_baud} baud  bytes ${s.bus_bytes}  frames ${s.bus_frames}  dropped ${s.bus_dropped}  telnet 2323 ${s.bus_telnet?'connected':'free'}  |  time  +ms since previous frame  bytes`;
 }catch(e){}
}
setInterval(upd,1000);upd();
</script></body></html>)HTML";

static void handleStatus() {
  char j[360];
  snprintf(j, sizeof j,
           "{\"uptime\":%lu,\"rssi\":%d,\"baud\":%lu,\"tx\":%s,\"inv\":%s,\"rx\":%lu,\"tx_bytes\":%lu,\"telnet\":%s,"
           "\"bus_baud\":%lu,\"bus_rev\":%s,\"bus_bytes\":%lu,\"bus_frames\":%lu,\"bus_dropped\":%lu,\"bus_telnet\":%s}",
           (unsigned long)(millis() / 1000), WiFi.RSSI(), (unsigned long)baud,
           txEnabled ? "true" : "false", inverted ? "true" : "false",
           (unsigned long)rxBytes, (unsigned long)txBytes,
           (client && client.connected()) ? "true" : "false",
           (unsigned long)busBaud, busRev ? "true" : "false",
           (unsigned long)busBytes, (unsigned long)busFrames, (unsigned long)busDropped,
           (busClient && busClient.connected()) ? "true" : "false");
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
  web.on("/mqtt", HTTP_GET, [] { web.send_P(200, "text/html", MQTT_PAGE); });
  web.on("/mqtt", HTTP_POST, [] {
    prefs.putString("mqhost", web.arg("host"));
    prefs.putUInt("mqport", web.arg("port").length() ? web.arg("port").toInt() : 1883);
    prefs.putString("mquser", web.arg("user"));
    prefs.putString("mqpass", web.arg("pass"));
    web.send(200, "text/plain", "Saved. Restarting...");
    delay(500);
    ESP.restart();
  });
  web.on("/log", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", ringText(conLog)); });
  web.on("/bus", HTTP_GET, [] { web.send_P(200, "text/html", BUS_PAGE); });
  web.on("/buslog", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", ringText(busLog)); });
  web.on("/busbaud", HTTP_POST, [] {
    uint32_t b = web.arg("b").toInt();
    if (b >= 300 && b <= 115200) {
      busBaud = b;
      prefs.putUInt("busbaud", busBaud);
      Serial1.updateBaudRate(busBaud);
    }
    web.send(200, "text/plain", "ok");
  });
  web.on("/busrev", HTTP_POST, [] {
    busRev = web.arg("on") == "1";
    prefs.putBool("busrev", busRev);
    web.send(200, "text/plain", "ok");
  });
  web.on("/busclear", HTTP_POST, [] {
    busLog.head = 0;
    busLog.full = false;
    web.send(200, "text/plain", "ok");
  });
  web.on("/status", HTTP_GET, handleStatus);
  // curl -F f=@file 'http://<bridge>/upload?to=/path', then GET /upload until "ok"
  web.on("/upload", HTTP_GET, [] {
    String j = "{\"state\":\"" + upResult + "\",\"to\":\"" + upTo + "\",\"sent\":" + String(upPos) +
               ",\"size\":" + String(upLen) + ",\"md5\":\"" + upMd5 + "\",\"unit_md5\":\"" + upUnitMd5 + "\"}";
    web.send(200, "application/json", j);
  });
  web.on("/upload", HTTP_POST, [] {
    String to = web.arg("to");
    String err;
    if (upState) err = "busy";
    else if (!upPathOk(to)) err = "bad target path (absolute, letters, digits, / . _ - only)";
    else if (!upBuf || !upLen) err = "no file";
    else if (upFull) err = "file too big (max " + String(UP_MAX) + " bytes)";
    else if (!txEnabled) err = "TX is off";
    if (err.length()) {
      if (!upState && upBuf) { free(upBuf); upBuf = nullptr; }
      web.send(400, "text/plain", err + "\n");
      return;
    }
    MD5Builder md;
    md.begin();
    md.add(upBuf, upLen);
    md.calculate();
    upMd5 = md.toString();
    upTo = to;
    upUnitMd5 = "";
    upPos = 0;
    upHead = false;
    upT = millis();
    upState = 1;
    upResult = "sending";
    web.send(200, "text/plain", "sending " + String(upLen) + " bytes to " + upTo + ", md5 " + upMd5 + "\n");
  }, [] {
    if (upState) return;
    HTTPUpload &u = web.upload();
    if (u.status == UPLOAD_FILE_START) {
      if (!upBuf) upBuf = (uint8_t *)malloc(UP_MAX);
      upLen = 0;
      upFull = false;
    } else if (u.status == UPLOAD_FILE_WRITE && upBuf) {
      if (upLen + u.currentSize > UP_MAX) upFull = true;
      else { memcpy(upBuf + upLen, u.buf, u.currentSize); upLen += u.currentSize; }
    }
  });
  web.on("/send", HTTP_POST, [] {
    if (upState) { web.send(409, "text/plain", "busy: upload running"); return; }
    mqManual = millis();
    vscLine(web.arg("line"));
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
    conLog.head = 0;
    conLog.full = false;
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

  busBaud = prefs.getUInt("busbaud", BUS_BAUD);
  busRev = prefs.getBool("busrev", true);
  Serial1.setRxBufferSize(1024);
  Serial1.begin(busBaud, SERIAL_8N1, BUS_RX_PIN, -1);
  gpio_pullup_en((gpio_num_t)BUS_RX_PIN);   // idle high while nothing is connected
  busQueue = xQueueCreate(32, sizeof(BusFrame));
  xTaskCreatePinnedToCore(busTask, "bus", 4096, nullptr, 2, nullptr, 0);

  setupWifi();
  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.begin();
  setupWeb();
  setupMqtt();
  telnet.begin();
  telnet.setNoDelay(true);
  busServer.begin();
  busServer.setNoDelay(true);
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

  if (busServer.hasClient()) {
    if (busClient && busClient.connected()) {
      WiFiClient extra = busServer.available();
      extra.print("busy: one bus client at a time\r\n");
      extra.stop();
    } else {
      busClient = busServer.available();
      busClient.setNoDelay(true);
      busClient.printf("[vsc-bridge] RS485 GPIO%d, %lu baud, read only\r\n", BUS_RX_PIN, (unsigned long)busBaud);
    }
  }
  while (busClient && busClient.connected() && busClient.available()) busClient.read();
  busDrain();

  uint8_t buf[256];
  while (Serial2.available()) {
    size_t n = Serial2.readBytes(buf, min((size_t)Serial2.available(), sizeof buf));
    ringPut(conLog, buf, n);
    rxBytes += n;
    if (client && client.connected()) client.write(buf, n);
    mqConsole(buf, n);
  }
  upStep();
  mqLoop();

  while (client && client.connected() && client.available()) {
    uint8_t c = (uint8_t)client.read();
    if (iacState == 0 && c == 0xFF) { iacState = 1; continue; }
    if (iacState == 1) { iacState = (c >= 0xFB && c <= 0xFE) ? 2 : 0; continue; }
    if (iacState == 2) { iacState = 0; continue; }
    vscWrite(&c, 1);
  }
}
