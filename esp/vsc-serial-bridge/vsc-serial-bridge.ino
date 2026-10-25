// VSC serial bridge: ESP32 for the Nuaire MRXBOX, two ways (docs/option1-no-vsc.md,
// docs/option2-vsc-console.md): on the VSC's Linux console, or on the RS485 bus in the
// VSC's place (VSC emulation).
//
//   telnet / raw TCP  port 23   - interactive console (PuTTY "Raw" mode)
//   http://<host>/              - setup and status: WiFi (scan and join), MQTT, restart
//   http://<host>/console       - live log, send a line, Ctrl-C, baud, TX on/off
//   http://<host>/log           - last 16 KB of console output as plain text
//   http://<host>/status        - JSON: uptime, RSSI, baud, byte counters
//   ArduinoOTA                  - reflash over WiFi once it is installed
//   http://<host>/bus           - RS485 bus listener: one line per frame, hex
//   http://<host>/buslog        - last 16 KB of bus frames as plain text
//   http://<host>/bustiming     - bit timing of each frame, measured from pin edges
//   http://<host>/busbytes      - the same, byte by byte
//   telnet / raw TCP  port 2323 - the same bus frames, live (read only)
//   http://<host>/emu           - VSC emulation (no VSC on the bus): JSON state; POST to change
//   http://<host>/unit          - MRXBOX readings and controls, in either option
//
// Power: VIN from a 5 V buck module on the bus's red (+10 V) and blue (0 V), or USB.
// Red never goes to an ESP pin directly.
// Option 2, VSC console (RS232 level, polarity RS232 (inverted) by default):
//   ESP RX (VSC_RX_PIN) <- 10k <- VSC TX   (or through a MAX3232 module, polarity TTL)
//   ESP TX (VSC_TX_PIN) -> VSC RX
//   ESP GND             -  VSC 0V
// Option 1, RS485 bus, auto-direction module (XY-485):
//   A+ <- yellow, B- <- green, GND <- blue and ESP GND, VCC <- ESP VIN
//   RXD -> BUS_RX_PIN, TXD <- BUS_TX_PIN (held high while not sending)
//
// MQTT (optional, broker set at http://<host>/): Home Assistant discovery for the
// MRXBOX device. In option 2 it works through the /tmp control files of
// logger/i2clog.so, by typing shell lines on the console, so the console must be
// logged in (the bridge answers "login:" with root). In option 1 it drives the emulation.

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include "driver/uart.h"
#include "mqtt_client.h"
#include <MD5Builder.h>
#include "soc/gpio_reg.h"

// WiFi credentials are not in the code. On first boot, when the saved network
// can't be joined for a minute, or when the BOOT button is held for 3 s, the ESP
// starts its own network HOSTNAME / AP_PASS. A phone that joins it is sent to the
// setup page (http://192.168.4.1/), which scans for networks and stores the
// choice in flash. The setup network goes off again once the ESP is on the saved
// network and nobody has used the setup network for 5 minutes.
#define HOSTNAME    "vsc-bridge"
#define AP_PASS     "nuaire123"
#define AP_BUTTON   0         // BOOT button: hold 3 s for the setup network
#define FW_BUILD    __DATE__ " " __TIME__

// GPIO16/17 are used by PSRAM on WROVER modules; pick e.g. 25/26 there.
#define VSC_RX_PIN  16
#define VSC_TX_PIN  17
#define DEFAULT_BAUD 115200

#define TELNET_PORT 23
#define LOG_SIZE    16384

// RS485 bus. BUS_TX_PIN is held high except while the emulation sends:
// on an auto-direction module (XY-485) a high TXD keeps it in receive.
#define BUS_RX_PIN  25
#define BUS_TX_PIN  26
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
static volatile uint32_t busEdges = 0;   // level changes on BUS_RX_PIN, whatever the baud

// VSC emulation, for when the VSC is off the bus. The unit polls each VSC slot
// (88, 8A, AE, C5) with its ID byte, and if nobody answers it sends its own
// default bytes, starting about 25 us after the ID. The XY-485 only drives the
// bus while TXD is low, so our 1 bits are passive and our 0 bits win, as the
// VSC's bus chip does. The ID is sampled bit by bit in a timer interrupt and
// the answer is bit-banged on BUS_TX_PIN in step with the unit's first byte.
struct Emu {
  bool on;
  uint8_t speed;      // 1..3
  uint8_t mode;       // AE byte 1, active low: 01 bypass on, 10 bypass off, 08 night, 04 holiday, 02 rising boost
  uint8_t bypassSp;   // deg C
  uint8_t humSp;      // %
  uint8_t frost;      // AE byte 4
  uint8_t air[6];     // airflow %, C5 order: supply 3, extract 3, supply 1, supply 2, extract 1, extract 2
};
static Emu emu = {false, 1, 0x7F, 24, 66, 0, {100, 100, 18, 32, 18, 32}};
static const uint8_t EMU_ID[4] = {0x88, 0x8A, 0xAE, 0xC5};
static uint8_t emuFrame[4][8], emuLen[4];   // data bytes per slot, checksum last
static portMUX_TYPE emuMux = portMUX_INITIALIZER_UNLOCKED;
// The unit sends its own default bytes under ours and checks the bus between
// bytes, so each of our bytes starts on the unit's start bit. If the unit has
// stopped, we keep its timing: first byte +30 us after the ID, then +100 us,
// checksum +78 us (measured with the VSC off).
static volatile int32_t emuOffUs = 30, emuGapUs = 100, emuLastGapUs = 78;
static volatile uint32_t emuSent[4], emuLate, emuSynced, emuOwn;
static volatile uint8_t emuState;           // 0 idle, 1 reading an ID, 2 sending
static volatile bool emuWait;               // sending, between bytes: waiting for the unit's start bit
static volatile uint32_t emuStart, emuPrevEdge, emuByteT, emuDue;
static hw_timer_t *emuTimer;

// Edge timestamps (µs) from the BUS_RX_PIN interrupt. Each sender has its own
// clock and driver, so the bit length and low/high widths tell senders apart.
#define EDGE_RING   2048
#define EDGE_GAP_US 10000   // longest run inside a frame is 9 bits (7.5 ms)
static volatile uint32_t edgeT[EDGE_RING];
static volatile uint32_t edgeHead = 0;

struct Ring {
  char buf[LOG_SIZE];
  size_t head = 0;
  bool full = false;
};
static Ring conLog, busLog, timLog;
static Ring *byteLog;   // on the heap: static DRAM is full

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

// Every 25 us while emuState is set: sample the ID at its bit centres, then
// send the slot's bytes, MSB first, start bit low, stop bit high. Each byte
// starts on the unit's start bit (busEdgeIsr), or at emuDue if it has none.
static void IRAM_ATTR emuTick() {
  static uint8_t bit, id, slot, len, out[8], j;
  if (!emuState) { bit = id = j = 0; return; }
  uint32_t dt = micros() - emuStart;
  if (emuState == 1) {
    if (dt < (3 + 2 * bit) * 1000000UL / (2 * BUS_BAUD)) return;
    int lv = (REG_READ(GPIO_IN_REG) & BIT(BUS_RX_PIN)) ? 1 : 0;
    if (bit < 8) { id = id << 1 | lv; bit++; return; }
    slot = id == 0x88 ? 0 : id == 0x8A ? 1 : id == 0xAE ? 2 : id == 0xC5 ? 3 : 255;
    if (!lv || slot == 255) { emuState = 0; return; }   // no stop bit, or not our slot
    portENTER_CRITICAL_ISR(&emuMux);
    len = emuLen[slot];
    for (int i = 0; i < len; i++) out[i] = emuFrame[slot][i];
    portEXIT_CRITICAL_ISR(&emuMux);
    bit = 1;
    j = 0;
    emuDue = emuStart + 10 * 1000000UL / BUS_BAUD + emuOffUs;
    emuWait = true;
    emuState = 2;
    return;
  }
  if (emuWait) {
    if ((int32_t)(micros() - emuDue) < 60) return;
    emuByteT = emuDue;   // the unit has not started a byte: send on its timing
    emuWait = false;
    emuOwn++;
    REG_WRITE(GPIO_OUT_W1TC_REG, BIT(BUS_TX_PIN));
    bit = 1;
  }
  uint32_t t = bit * 1000000UL / BUS_BAUD;
  dt = micros() - emuByteT;
  if (dt < t) return;
  if (dt - t > 100) emuLate++;
  int lv = bit == 9 ? 1 : (out[j] >> (8 - bit)) & 1;
  REG_WRITE(lv ? GPIO_OUT_W1TS_REG : GPIO_OUT_W1TC_REG, BIT(BUS_TX_PIN));
  if (++bit < 10) return;
  bit = 1;
  if (++j < len) {
    emuDue = emuByteT + 10 * 1000000UL / BUS_BAUD + (j == len - 1 ? emuLastGapUs : emuGapUs);
    emuWait = true;
    return;
  }
  emuSent[slot]++;
  emuState = 0;
}

// Bus bytes from the emulated settings. A bus byte is the VSC's I2C byte
// bit-reversed; each frame XORs to D5.
static void emuBuild() {
  uint8_t f[4][8], n[4];
  f[0][0] = emu.speed == 1 ? 0x6F : 0x6B;
  n[0] = 1;
  f[1][0] = 0x7F;
  f[1][1] = emu.speed == 1 ? 0x7F : emu.speed == 2 ? 0x1F : 0x17;
  f[1][2] = 0x7F;
  n[1] = 3;
  f[2][0] = emu.mode;
  f[2][1] = rev8(emu.bypassSp << 2);
  f[2][2] = rev8(emu.humSp << 1);
  f[2][3] = rev8(emu.frost << 4);
  n[2] = 4;
  for (int i = 0; i < 6; i++) f[3][i] = rev8(emu.air[i] << 1);
  n[3] = 6;
  for (int k = 0; k < 4; k++) {
    uint8_t x = 0xD5 ^ EMU_ID[k];
    for (int i = 0; i < n[k]; i++) x ^= f[k][i];
    f[k][n[k]++] = x;
  }
  portENTER_CRITICAL(&emuMux);
  memcpy(emuFrame, f, sizeof f);
  memcpy(emuLen, n, sizeof n);
  portEXIT_CRITICAL(&emuMux);
}

static void emuSave() {
  prefs.putBytes("emu", &emu, sizeof emu);
  emuBuild();
}

static void IRAM_ATTR busEdgeIsr() {
  uint32_t now = micros();
  // an ID's start bit: the first falling edge after a silence longer than a byte
  if (emu.on && !emuState && now - emuPrevEdge > 12000 && !(REG_READ(GPIO_IN_REG) & BIT(BUS_RX_PIN))) {
    emuStart = now;
    emuState = 1;
  } else if (emuState == 2 && emuWait && !(REG_READ(GPIO_IN_REG) & BIT(BUS_RX_PIN))) {
    // the unit's start bit: start ours with it
    REG_WRITE(GPIO_OUT_W1TC_REG, BIT(BUS_TX_PIN));
    emuByteT = now;
    emuWait = false;
    emuSynced++;
  }
  emuPrevEdge = now;
  edgeT[edgeHead % EDGE_RING] = now;
  edgeHead++;
  busEdges++;
}

// One line per burst of edges (a frame): seconds since boot, µs of silence
// before it, µs from first to last edge, edge count, bytes, bit length in ns
// (from falling edges inside each byte, so neither a stretched low level nor
// idle between bytes biases it), how much longer each low run inside a byte
// is than that (ns), and the idle between bytes beyond one stop bit (µs).
// The first edge after a silence is a start bit; an edge more than 9.5 bits
// after the current start bit is the next start bit.
static void timFrame(const uint32_t *t, int n, uint32_t gap) {
  if (n < 3) return;
  double nom = 1e6 / busBaud, sumDt = 0, sumBits = 0, idle = 0;
  int bytes = 1, s = 0;
  for (int i = 1; i < n; i++) {
    double dt = (double)(t[i] - t[s]);
    if (dt > 9.5 * nom) { idle += dt - 10 * nom; bytes++; s = i; continue; }
    if (!((i - s) & 1)) { sumDt += dt; sumBits += (double)lround(dt / nom); }
  }
  if (sumBits < 1) return;
  double bit = sumDt / sumBits, resLo = 0;
  int nLo = 0;
  s = 0;
  for (int i = 1; i < n; i++) {
    if ((double)(t[i] - t[s]) > 9.5 * nom) { s = i; continue; }
    if ((i - s) & 1) {
      double dt = (double)(t[i] - t[i - 1]);
      resLo += dt - lround(dt / nom) * bit;
      nLo++;
    }
  }
  char line[96];
  int p = snprintf(line, sizeof line, "%6lu.%03lu %6lu %6lu %3d %2d %7.1f %+6.0f %+7.1f\n",
                   (unsigned long)(t[0] / 1000000), (unsigned long)(t[0] / 1000 % 1000),
                   (unsigned long)gap, (unsigned long)(t[n - 1] - t[0]), n, bytes,
                   bit * 1000, nLo ? resLo * 1000 / nLo : 0.0,
                   bytes > 1 ? idle / (bytes - 1) : 0.0);
  ringPut(timLog, (const uint8_t *)line, p);
}

// The same frame byte by byte, to see whether one frame has two senders (for
// example the unit sending the ID as a poll and the VSC the data): seconds
// since boot, µs of silence before it, then per byte its bit length in ns
// (from falling edges inside the byte, "---" if it has none) and, after "/",
// the µs from its start bit to the next byte's start bit beyond 10 nominal bits.
static void byteFrame(const uint32_t *t, int n, uint32_t gap) {
  if (n < 3) return;
  double nom = 1e6 / busBaud;
  char line[256];
  int p = snprintf(line, sizeof line, "%6lu.%03lu %6lu",
                   (unsigned long)(t[0] / 1000000), (unsigned long)(t[0] / 1000 % 1000),
                   (unsigned long)gap);
  int s = 0;
  while (s < n && p < (int)sizeof line - 24) {
    int e = s + 1;
    double sumDt = 0, sumBits = 0;
    for (; e < n && (double)(t[e] - t[s]) <= 9.5 * nom; e++)
      if (!((e - s) & 1)) { sumDt += (double)(t[e] - t[s]); sumBits += (double)lround((t[e] - t[s]) / nom); }
    if (sumBits >= 1) p += snprintf(line + p, sizeof line - p, "  %4.0f", sumDt / sumBits * 1000);
    else p += snprintf(line + p, sizeof line - p, "   ---");
    if (e < n) p += snprintf(line + p, sizeof line - p, "/%+4.0f", (double)(t[e] - t[s]) - 10 * nom);
    s = e;
  }
  line[p++] = '\n';
  if (byteLog) ringPut(*byteLog, (const uint8_t *)line, p);
}

// Collects edges from the ring into frames, split at EDGE_GAP_US of silence.
static void timPoll() {
  static uint32_t tail = 0, prevEnd = 0;
  static uint32_t t[400];
  static int n = 0;
  uint32_t head = edgeHead;
  if (head - tail > EDGE_RING) tail = head - EDGE_RING;   // overrun: skip ahead
  for (; tail != head; tail++) {
    uint32_t e = edgeT[tail % EDGE_RING];
    if (n && e - t[n - 1] > EDGE_GAP_US) {
      timFrame(t, n, prevEnd ? t[0] - prevEnd : 0);
      byteFrame(t, n, prevEnd ? t[0] - prevEnd : 0);
      prevEnd = t[n - 1];
      n = 0;
    }
    if (n < 400) t[n++] = e;
  }
  if (n && micros() - t[n - 1] > EDGE_GAP_US) {
    timFrame(t, n, prevEnd ? t[0] - prevEnd : 0);
    byteFrame(t, n, prevEnd ? t[0] - prevEnd : 0);
    prevEnd = t[n - 1];
    n = 0;
  }
}

// Runs in its own task so frame gaps are timed even while the web server is
// busy sending a log. Complete frames go to loop() through busQueue.
static void busTask(void *) {
  BusFrame f;
  f.len = 0;
  uint32_t last = 0;
  for (;;) {
    timPoll();
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

// The unit's own frames, decoded for MQTT while the VSC is emulated (docs/protocol.md):
// 84 = fault flags p8/p9 (p9 0x08 = bypass), A1 = extract and intake temperature,
// DC = humidity. Frames with a bad checksum are ignored.
struct BusState {
  uint32_t t84, tA1, tDC;   // millis() of the last good frame, 0 = none yet
  uint8_t p8, p9;
  int ext, in, hum;
};
static BusState bus;
static bool busChanged = false;   // p8/p9 changed: publish now

static int busTemp(uint8_t b) {   // p5/p16: >>1, signed 7 bit, -63 = sensor fault
  int v = rev8(b) >> 1;
  return v & 0x40 ? v - 128 : v;
}

static void busParse(const BusFrame &f) {
  uint8_t d[BUS_FRAME], x = 0;
  for (int i = 0; i < f.len; i++) {
    d[i] = busRev ? f.d[i] : rev8(f.d[i]);
    x ^= d[i];
  }
  if (x != 0xD5) return;
  uint32_t now = millis();
  if (d[0] == 0x84 && f.len == 4) {
    uint8_t p8 = rev8(d[1]), p9 = rev8(d[2]);
    if (!bus.t84 || p8 != bus.p8 || p9 != bus.p9) busChanged = true;
    bus.p8 = p8;
    bus.p9 = p9;
    bus.t84 = now;
  } else if (d[0] == 0xA1 && f.len == 7) {
    bus.ext = busTemp(d[1]);
    bus.in = busTemp(d[3]);
    bus.tA1 = now;
  } else if (d[0] == 0xDC && f.len == 4) {
    bus.hum = d[1] ^ 0x7F;   // p18: same as rev8 >> 1, active low
    bus.tDC = now;
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
    busParse(f);
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
// True once a "# " prompt or a poll answer shows the console is at a root shell; false again on a
// boot banner or a login prompt. Until then the poll only sends Enter: a poll typed during boot or
// at "login:" would be taken as the user name.
static bool vscShell = false;
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
#define POLL_CMD "echo \"@\"\"S\" $(cat /tmp/bypass_state 2>/dev/null) \"@\"\"T\" $(cat /tmp/sensors 2>/dev/null) \"@\"\"R\" $(cat /tmp/runtime 2>/dev/null) \"@\"\"C\" $(cat /tmp/screen_state 2>/dev/null) \"@\"\"M\" $(cat /tmp/modes 2>/dev/null) \"@\"\"A\" $(cat /tmp/airflow_state 2>/dev/null) \"@\"\"K\" $(cat /tmp/clock 2>/dev/null) $(ls /tmp/speed2 /tmp/speed3 /tmp/bypass_on /tmp/bypass_off /tmp/debug 2>/dev/null)"

// The last value of each vsc/... state topic, for the /unit page. Kept with or without MQTT, so
// the page works on its own. While the page is open (a /unit/state in the last 2 min) the
// console is polled and logged into even with no broker.
#define WEB_KEYS 48
static String webKey[WEB_KEYS], webVal[WEB_KEYS];
static int webKeys = 0;
static uint32_t webUnitT = 0;

static void webPut(const char *topic, const char *payload) {
  if (strncmp(topic, MQ_BASE "/", sizeof MQ_BASE)) return;   // not discovery
  const char *k = topic + sizeof MQ_BASE;
  if (!strcmp(k, "log") || !strcmp(k, "log_batch") || !strcmp(k, "status")) return;
  for (int i = 0; i < webKeys; i++)
    if (webKey[i] == k) { webVal[i] = payload; return; }
  if (webKeys < WEB_KEYS) { webKey[webKeys] = k; webVal[webKeys++] = payload; }
}

static bool pollWanted() { return mqConnected || (webUnitT && millis() - webUnitT < 120000); }

static void mqPub(const char *topic, const char *payload, bool retain = true) {
  webPut(topic, payload);
  if (mq && mqConnected) esp_mqtt_client_publish(mq, topic, payload, 0, 0, retain);
}

// The VSC clock: es-lcd's copy of the bus chip's clock (hours and minutes), which the library writes
// to /tmp/clock. That clock can stop (one was stuck at 04:00), and with it every per-minute
// countdown: screen sleep, the speed 2/3 timers, night and holiday. So once NTP time is known and
// the VSC is more than a minute out, the bridge sets it through /tmp/settime (HHMMDD), at most
// every 5 minutes. es-lcd only reads the clock at speed 1, so the check waits for two polls in a
// row at speed 1. The time zone is POSIX TZ, set on the MQTT page (default UK).
#define CLOCK_TZ    "GMT0BST,M3.5.0/1,M10.5.0"
#define CLOCK_SET_MS 300000
static String clockTz;
static uint32_t clockSetT = 0;
static int clockSpeed1 = 0;

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

// Availability: AV_ESP needs only the ESP online. AV_UNIT also needs the unit to answer
// (vsc/vsc_status: the VSC console, or the unit's frames while the VSC is emulated).
// AV_CONSOLE is for what only the VSC's console has (vsc/console_status), AV_EMU for what
// only the emulation has (vsc/emu_status).
enum { AV_ESP, AV_UNIT, AV_CONSOLE, AV_EMU };
static void mqDiscovery(const char *comp, const char *key, const char *name, const char *extra, int avty = AV_UNIT) {
  char topic[80], j[900];
  snprintf(topic, sizeof topic, "homeassistant/%s/vsc_bridge/%s/config", comp, key);
  snprintf(j, sizeof j,
           "{\"name\":\"%s\",\"uniq_id\":\"vsc_bridge_%s\",\"obj_id\":\"mrxbox_%s\",%s,%s,"
           "\"dev\":{\"ids\":[\"vsc_bridge\"],\"name\":\"MRXBOX\",\"mf\":\"Nuaire\",\"mdl\":\"MRXBOX VSC\"}}",
           name, key, key,
           avty == AV_ESP ? "\"avty_t\":\"" MQ_BASE "/status\""
           : avty == AV_UNIT ? "\"avty\":[{\"t\":\"" MQ_BASE "/status\"},{\"t\":\"" MQ_BASE "/vsc_status\"}],\"avty_mode\":\"all\""
           : avty == AV_CONSOLE ? "\"avty\":[{\"t\":\"" MQ_BASE "/status\"},{\"t\":\"" MQ_BASE "/vsc_status\"},"
                                  "{\"t\":\"" MQ_BASE "/console_status\"}],\"avty_mode\":\"all\""
           : "\"avty\":[{\"t\":\"" MQ_BASE "/status\"},{\"t\":\"" MQ_BASE "/vsc_status\"},"
             "{\"t\":\"" MQ_BASE "/emu_status\"}],\"avty_mode\":\"all\"",
           extra);
  mqPub(topic, j);
}

static void mqVsc(bool online) {
  if (online == mqVscOnline) return;
  mqVscOnline = online;
  mqPub(MQ_BASE "/vsc_status", online ? "online" : "offline");
  if (!online) mqPub(MQ_BASE "/comms", "OFF");
}

// Emulation turned on or off: what HA shows comes from the other source now, so it stays
// unavailable until that source answers (the unit's frames, or a console poll).
static void emuSwitch(bool on) {
  if (on == emu.on) return;
  emu.on = on;
  emuSave();
  mqVsc(false);
  mqNoReply = 0;
  mqLastPoll = 0;
  mqAnnounce = true;
}

// ---- MQTT while the VSC is emulated ----
// With emu.on the controls go to the emulated VSC's answers (88/8A speed, AE modes and
// setpoints, C5 airflow) and the state comes from those and from the unit's own frames.
// The console isn't polled. Run and filter hours are counted here, as es-lcd does, while
// the unit answers.
static const uint8_t AIR_C5[6] = {2, 3, 0, 4, 5, 1};   // AIR_KEY index -> emu.air (C5 order)
#define EMU_PUB_MS  20000
#define EMU_BUS_MS  5000    // no good 84 frame for this long = no communications
#define EMU_SAVE_MS 900000  // run/filter minutes to flash every 15 min
static bool mqEmuDirty = true;
static uint32_t emuRunMin, emuFiltMin;

static void emuTmSave();

static void emuHoursSave() {
  prefs.putUInt("erun", emuRunMin);
  prefs.putUInt("efilt", emuFiltMin);
  emuTmSave();   // and the minutes left on the timers
}

static bool emuComms() { return emu.on && bus.t84 && millis() - bus.t84 < EMU_BUS_MS; }

// Count a minute of running while the unit answers; save now and then.
static void emuHours() {
  static uint32_t minT = millis(), saveT = millis();
  uint32_t now = millis();
  if (now - minT < 60000) return;
  minT += 60000;
  if (!emuComms()) return;
  emuRunMin++;
  emuFiltMin++;
  if (now - saveT >= EMU_SAVE_MS) {
    saveT = now;
    emuHoursSave();
  }
}

// The VSC's own timers. es-lcd counts these down and only the resulting speed and mode bits
// reach the bus, so the emulation runs them too: speed 3, night, holiday and the bypass
// On/Off override fall back when their time is up. A length of 0 means no limit, as when
// the VSC is in HA mode. Starting the bypass override cancels night, holiday and rising
// boost, as es-lcd does.
enum { TM_BOOST, TM_NIGHT, TM_HOLIDAY, TM_BYPASS, TM_N };
static const char *const TM_KEY[TM_N] = {"boost_min", "night_h", "holiday_d", "bypass_h"};
static const uint8_t TM_MIN[TM_N] = {1, 4, 1, 1}, TM_MAX[TM_N] = {59, 8, 21, 12};   // or 0
static const uint16_t TM_UNIT[TM_N] = {1, 60, 1440, 60};   // minutes per step
static uint8_t emuTmLen[TM_N];     // lengths in TM_UNIT steps; 0 = no limit
static uint32_t emuTmLeft[TM_N];   // minutes left; 0 = not running
static uint8_t emuPrevSpeed = 1;   // speed to go back to when speed 3 ends
static uint8_t tmSpeed, tmMode;    // emu.speed and emu.mode as the timers last saw them

static void emuTmSave() {
  prefs.putBytes("etlen", emuTmLen, sizeof emuTmLen);
  prefs.putBytes("etleft", emuTmLeft, sizeof emuTmLeft);
  prefs.putUChar("eprev", emuPrevSpeed);
}

static void emuTmLoad() {
  if (prefs.getBytesLength("etlen") == sizeof emuTmLen) prefs.getBytes("etlen", emuTmLen, sizeof emuTmLen);
  if (prefs.getBytesLength("etleft") == sizeof emuTmLeft) prefs.getBytes("etleft", emuTmLeft, sizeof emuTmLeft);
  emuPrevSpeed = constrain(prefs.getUChar("eprev", 1), 1, 2);
  tmSpeed = emu.speed;   // a timer left running before a restart carries on
  tmMode = emu.mode;
}

static bool emuTmValid(int i, int v) { return v == 0 || (v >= TM_MIN[i] && v <= TM_MAX[i]); }

static void emuTmRun(int i, bool run) {
  emuTmLeft[i] = run && emuTmLen[i] ? (uint32_t)emuTmLen[i] * TM_UNIT[i] : 0;
}

// Called from loop(): start or stop the timers on any change of speed or modes (from HA,
// the web page or a timer), and count them down once a minute.
static void emuTimers() {
  static uint32_t minT = millis();
  if (!emu.on) {
    minT = millis();
    tmSpeed = emu.speed;
    tmMode = emu.mode;
    return;
  }
  bool changed = false;
  if ((tmMode & 0x01) && !(emu.mode & 0x01) && (~emu.mode & 0x0E)) {
    emu.mode |= 0x0E;   // bypass override started: night, holiday and rising boost off
    changed = true;
  }
  if (emu.speed != tmSpeed) {
    if (emu.speed == 3) emuPrevSpeed = tmSpeed;
    emuTmRun(TM_BOOST, emu.speed == 3);
  }
  uint8_t ch = emu.mode ^ tmMode;
  if (ch & 0x08) emuTmRun(TM_NIGHT, !(emu.mode & 0x08));
  if (ch & 0x04) emuTmRun(TM_HOLIDAY, !(emu.mode & 0x04));
  if (ch & 0x11) emuTmRun(TM_BYPASS, (emu.mode & 0x11) != 0x11);
  bool started = emu.speed != tmSpeed || (ch & 0x1D);
  if (millis() - minT >= 60000) {
    minT += 60000;
    for (int i = 0; i < TM_N; i++) {
      if (!emuTmLeft[i]) continue;
      mqEmuDirty = true;   // HA's time left, once a minute
      if (--emuTmLeft[i]) continue;
      if (i == TM_BOOST) emu.speed = emuPrevSpeed;
      else if (i == TM_NIGHT) emu.mode |= 0x08;
      else if (i == TM_HOLIDAY) emu.mode |= 0x04;
      else emu.mode |= 0x11;
      changed = true;
    }
  }
  tmSpeed = emu.speed;
  tmMode = emu.mode;
  if (changed) emuSave();
  if (changed || started) {
    emuTmSave();
    mqEmuDirty = true;
  }
}

// {"boost_min_left":0,...,"text":"Night 5 h 59 min, Bypass 12 min"} or "text":"None running"
static String emuTmJson() {
  static const char *const name[TM_N] = {"Speed 3", "Night", "Holiday", "Bypass"};
  String txt, j = "{";
  for (int i = 0; i < TM_N; i++) {
    uint32_t m = emuTmLeft[i];
    j += String("\"") + TM_KEY[i] + "_left\":" + m + ",";
    if (!m) continue;
    if (txt.length()) txt += ", ";
    txt += name[i];
    if (m >= 1440) txt += String(" ") + m / 1440 + " d";
    if (m % 1440 >= 60) txt += String(" ") + m % 1440 / 60 + " h";
    if (m % 60 || m < 60) txt += String(" ") + m % 60 + " min";
  }
  return j + "\"text\":\"" + (txt.length() ? txt : "None running") + "\"}";
}

static void mqEmuPub(bool comms) {
  mqVsc(comms);
  mqPub(MQ_BASE "/comms", comms ? "ON" : "OFF");
  mqPub(MQ_BASE "/speed", String(emu.speed).c_str());
  mqPub(MQ_BASE "/bypass", !(emu.mode & 0x01) ? "On" : !(emu.mode & 0x10) ? "Off" : "Auto");
  mqPub(MQ_BASE "/bypass_temp", String(emu.bypassSp).c_str());
  mqPub(MQ_BASE "/humidity_sp", String(emu.humSp).c_str());
  mqPub(MQ_BASE "/frost_sp", String(-(int)emu.frost).c_str());
  mqPub(MQ_BASE "/night", emu.mode & 0x08 ? "OFF" : "ON");
  mqPub(MQ_BASE "/holiday", emu.mode & 0x04 ? "OFF" : "ON");
  mqPub(MQ_BASE "/rising_boost", emu.mode & 0x02 ? "OFF" : "ON");
  for (int i = 0; i < 6; i++) {
    char topic[24];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", AIR_KEY[i]);
    mqPub(topic, String(emu.air[AIR_C5[i]]).c_str());
  }
  for (int i = 0; i < TM_N; i++) {
    char topic[24];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", TM_KEY[i]);
    mqPub(topic, String(emuTmLen[i]).c_str());
  }
  mqPub(MQ_BASE "/timers", emuTmJson().c_str());
  mqPub(MQ_BASE "/run_hours", String(emuRunMin / 60).c_str());
  mqPub(MQ_BASE "/filter_hours", String(emuFiltMin / 60).c_str());
  mqPub(MQ_BASE "/filter_change", emuFiltMin / 60 > 8759 ? "ON" : "OFF");
  uint32_t now = millis();
  bool t = comms && bus.tA1 && now - bus.tA1 < EMU_BUS_MS, h = comms && bus.tDC && now - bus.tDC < EMU_BUS_MS;
  mqPub(MQ_BASE "/temp_extract", t && bus.ext != -63 ? String(bus.ext).c_str() : "None");
  mqPub(MQ_BASE "/temp_intake", t && bus.in != -63 ? String(bus.in).c_str() : "None");
  mqPub(MQ_BASE "/humidity", h && bus.hum > 0 && bus.hum < 127 ? String(bus.hum).c_str() : "None");
  mqPub(MQ_BASE "/fan_running", comms ? String(emu.speed).c_str() : "None");
  mqPub(MQ_BASE "/bypass_state", !comms ? "None" : (bus.p9 & 0x08) ? "ON" : "OFF");
  for (int i = 0; i < 6; i++) {
    char topic[40];
    snprintf(topic, sizeof topic, MQ_BASE "/%s", FAULT_KEY[i]);
    int b = FAULT_BYTE[i] == 8 ? bus.p8 : bus.p9;
    mqPub(topic, !comms ? "None" : (b & FAULT_BIT[i]) ? "OFF" : "ON");
  }
}

static void mqEmuLoop() {
  static uint32_t pubT = 0;
  bool comms = emuComms();
  if (comms != mqVscOnline || busChanged) mqEmuDirty = true;
  busChanged = false;
  if (!mqEmuDirty && millis() - pubT < EMU_PUB_MS) return;
  mqEmuDirty = false;
  pubT = millis();
  mqEmuPub(comms);
}

// A command from HA while the VSC is emulated: change the answers, then publish.
static void mqEmuHandle(const String &t, const String &d) {
  int v = (int)d.toFloat();
  bool on = d == "ON", sw = on || d == "OFF";
  if (t == MQ_BASE "/speed/set" && v >= 1 && v <= 3) emu.speed = v;
  else if (t == MQ_BASE "/bypass/set" && (d == "Auto" || d == "On" || d == "Off"))
    emu.mode = (emu.mode | 0x11) & ~(d == "On" ? 0x01 : d == "Off" ? 0x10 : 0);
  else if (t == MQ_BASE "/bypass_temp/set" && v >= 15 && v <= 30) emu.bypassSp = v;
  else if (t == MQ_BASE "/humidity_sp/set" && v >= 50 && v <= 85) emu.humSp = v;
  else if (t == MQ_BASE "/frost_sp/set" && v >= -5 && v <= 0) emu.frost = -v;
  else if (sw && (t == MQ_BASE "/night/set" || t == MQ_BASE "/holiday/set" || t == MQ_BASE "/rising_boost/set")) {
    uint8_t bit = t == MQ_BASE "/night/set" ? 0x08 : t == MQ_BASE "/holiday/set" ? 0x04 : 0x02;
    emu.mode = on ? emu.mode & ~bit : emu.mode | bit;
  } else if (t == MQ_BASE "/filter_reset/set") {
    emuFiltMin = 0;
    emuHoursSave();
  } else if (t.startsWith(MQ_BASE "/air_") && t.endsWith("/set") && v >= 1 && v <= 100) {
    for (int i = 0; i < 6; i++)
      if (t == String(MQ_BASE "/") + AIR_KEY[i] + "/set") emu.air[AIR_C5[i]] = v;
  } else {
    for (int i = 0; i < TM_N; i++)
      if (t == String(MQ_BASE "/") + TM_KEY[i] + "/set" && emuTmValid(i, v)) {
        emuTmLen[i] = v;   // a running timer keeps its time; the length applies from the next start
        emuTmSave();
      }
    mqEmuDirty = true;   // and put HA back to what we have
    return;
  }
  emuSave();
  mqEmuDirty = true;
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
              "\"stat_t\":\"" MQ_BASE "/debug\",\"cmd_t\":\"" MQ_BASE "/debug/set\",\"ent_cat\":\"config\",\"ic\":\"mdi:text-box-search\"", AV_CONSOLE);
  mqDiscovery("sensor", "debug_log", "Debug log",
              "\"stat_t\":\"" MQ_BASE "/log_batch\",\"val_tpl\":\"{{ value_json.seq }}\",\"json_attr_t\":\"" MQ_BASE "/log_batch\","
              "\"ent_cat\":\"diagnostic\",\"ic\":\"mdi:text-long\"", AV_ESP);
  mqDiscovery("sensor", "humidity", "Humidity",
              "\"stat_t\":\"" MQ_BASE "/humidity\",\"dev_cla\":\"humidity\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"%\"");
  mqDiscovery("sensor", "temp_extract", "Extract air temperature",
              "\"stat_t\":\"" MQ_BASE "/temp_extract\",\"dev_cla\":\"temperature\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"°C\"");
  mqDiscovery("sensor", "temp_intake", "Intake air temperature",
              "\"stat_t\":\"" MQ_BASE "/temp_intake\",\"dev_cla\":\"temperature\",\"stat_cla\":\"measurement\",\"unit_of_meas\":\"°C\"");
  mqDiscovery("sensor", "fan_running", "Running fan speed",
              "\"stat_t\":\"" MQ_BASE "/fan_running\",\"ic\":\"mdi:fan-auto\"");
  mqDiscovery("binary_sensor", "comms", "Communication with unit",
              "\"stat_t\":\"" MQ_BASE "/comms\",\"dev_cla\":\"connectivity\",\"ent_cat\":\"diagnostic\"", AV_ESP);
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
              "\"unit_of_meas\":\"min\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:monitor-off\"", AV_CONSOLE);
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
  mqDiscovery("sensor", "clock", "Clock",
              "\"stat_t\":\"" MQ_BASE "/clock\",\"ent_cat\":\"diagnostic\",\"ic\":\"mdi:clock-outline\"", AV_CONSOLE);
  mqDiscovery("switch", "rising_boost", "Rising humidity boost",
              "\"stat_t\":\"" MQ_BASE "/rising_boost\",\"cmd_t\":\"" MQ_BASE "/rising_boost/set\",\"ent_cat\":\"config\","
              "\"ic\":\"mdi:water-plus\"", AV_EMU);
  static const char *const tmName[TM_N] = {"Speed 3 time limit", "Night mode length", "Holiday length",
                                            "Bypass override length"};
  static const char *const tmUnit[TM_N] = {"min", "h", "d", "h"};
  static const char *const tmIcon[TM_N] = {"fan-clock", "weather-night", "bag-suitcase", "valve"};
  for (int i = 0; i < TM_N; i++) {
    char extra[280];
    snprintf(extra, sizeof extra,
             "\"stat_t\":\"" MQ_BASE "/%s\",\"cmd_t\":\"" MQ_BASE "/%s/set\",\"min\":0,\"max\":%d,\"step\":1,"
             "\"unit_of_meas\":\"%s\",\"mode\":\"box\",\"ent_cat\":\"config\",\"ic\":\"mdi:%s\"",
             TM_KEY[i], TM_KEY[i], TM_MAX[i], tmUnit[i], tmIcon[i]);
    mqDiscovery("number", TM_KEY[i], tmName[i], extra, AV_EMU);
  }
  mqDiscovery("sensor", "timers", "Time left",
              "\"stat_t\":\"" MQ_BASE "/timers\",\"val_tpl\":\"{{ value_json.text }}\","
              "\"json_attr_t\":\"" MQ_BASE "/timers\",\"ic\":\"mdi:timer-sand\"", AV_EMU);
  mqDiscovery("switch", "emulation", "VSC emulation",
              "\"stat_t\":\"" MQ_BASE "/emulation\",\"ent_cat\":\"diagnostic\",\"ic\":\"mdi:chip\","
              "\"cmd_t\":\"" MQ_BASE "/emulation/set\"", AV_ESP);
  mqPub(MQ_BASE "/status", "online");
  mqPub(MQ_BASE "/console_status", emu.on ? "offline" : "online");
  mqPub(MQ_BASE "/emu_status", emu.on ? "online" : "offline");
  mqPub(MQ_BASE "/emulation", emu.on ? "ON" : "OFF");
  mqEmuDirty = true;
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
  if (t == MQ_BASE "/emulation/set") {
    if (d != "ON" && d != "OFF") return;
    emuSwitch(d == "ON");
    return;
  }
  if (emu.on) {
    mqEmuHandle(t, d);
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
  if (!cmd.length() || !vscShell) return;
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

// "@K HH MM" (/tmp/clock) -> vsc/clock, and set the VSC clock if it is out (see CLOCK_TZ).
static void mqClock(const char *k, bool speed1) {
  int h, m;
  if (!k || sscanf(k + 2, "%d %d", &h, &m) != 2 || h < 0 || h > 23 || m < 0 || m > 59) return;
  char s[8];
  snprintf(s, sizeof s, "%02d:%02d", h, m);
  mqPub(MQ_BASE "/clock", s);
  clockSpeed1 = speed1 ? clockSpeed1 + 1 : 0;
  struct tm t;
  if (clockSpeed1 < 2 || !getLocalTime(&t, 0) || t.tm_year < 120) return;
  if (clockSetT && millis() - clockSetT < CLOCK_SET_MS) return;
  int d = abs(t.tm_hour * 60 + t.tm_min - (h * 60 + m));
  if (min(d, 1440 - d) < 2) return;   // a minute apart is the poll landing on the minute
  char cmd[40];
  snprintf(cmd, sizeof cmd, "echo %02d%02d%02d > /tmp/settime", t.tm_hour, t.tm_min, t.tm_mday);
  vscLine(cmd);
  clockSetT = millis();
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
  vscShell = true;
  mqVsc(true);
  bool s2 = strstr(p, "/tmp/speed2"), s3 = strstr(p, "/tmp/speed3");
  bool bon = strstr(p, "/tmp/bypass_on"), boff = strstr(p, "/tmp/bypass_off");
  while (*p == ' ') p++;
  mqPub(MQ_BASE "/speed", s3 ? "3" : s2 ? "2" : "1");
  mqPub(MQ_BASE "/bypass", bon ? "On" : boff ? "Off" : "Auto");
  mqPub(MQ_BASE "/debug", strstr(p, "/tmp/debug") ? "ON" : "OFF");
  if (*p == '0' || *p == '1') mqPub(MQ_BASE "/bypass_state", *p == '1' ? "ON" : "OFF");
  mqSensors(strstr(p, "@T"));
  mqClock(strstr(p, "@K"), !s2 && !s3);
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

// Console bytes: assemble lines for mqParse, log in when "login:" shows up, and follow
// whether the console is at a shell (vscShell).
static void mqConsole(const uint8_t *d, size_t n) {
  static char line[320];
  static size_t len = 0;
  for (size_t i = 0; i < n; i++) {
    char c = (char)d[i];
    if (c == '\n' || c == '\r') {
      line[len] = 0;
      if (len) {
        if (strstr(line, "Starting Kernel") || strstr(line, "INIT: Entering runlevel")) vscShell = false;
        upReply(line);
        mqParse(line);
      }
      len = 0;
      continue;
    }
    if (len < sizeof line - 1) line[len++] = c;
    if (len >= 6 && !memcmp(line + len - 6, "login:", 6) && (mq || pollWanted())) {
      vscShell = false;
      vscLine("root");
    } else if (len >= 9 && !memcmp(line + len - 9, "Password:", 9)) {
      vscShell = false;   // the next Enter gives "Login incorrect" and a new "login:"
    } else if (len == 2 && line[0] == '#' && line[1] == ' ' && !vscShell) {
      vscShell = true;
      mqLastPoll = millis() - MQ_POLL_MS + 1000;   // poll 1 s after reaching the shell
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
  if (upState) return;   // HA commands wait until an upload is done
  MqMsg m;
  if (mq)
    while (xQueueReceive(mqQueue, &m, 0) == pdTRUE) mqHandle(m.topic, m.data);
  if (mqConnected && mqAnnounce) {
    mqAnnounce = false;
    mqAnnounceAll();
  }
  if (mqLogBatch.length() && millis() - mqLogT >= MQ_LOG_MS) mqLogFlush();
  if (!pollWanted()) return;
  if (emu.on) {
    mqEmuLoop();
  } else if ((!mqLastPoll || millis() - mqLastPoll >= MQ_POLL_MS) && (!mqManual || millis() - mqManual >= 30000)) {
    mqLastPoll = millis();
    if (mqNoReply >= MQ_NO_REPLY) mqVsc(false);
    else mqNoReply++;
    vscLine(vscShell ? POLL_CMD : "");
  }
  static int savedTemp = 0;
  if (mqBypassTemp != savedTemp) {
    savedTemp = mqBypassTemp;
    prefs.putInt("mqbtemp", mqBypassTemp);
  }
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
<a href="/bus" style="color:#9cf">RS485 bus</a> <a href="/" style="color:#9cf">Setup</a>
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
const upd=async()=>{
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
<a href="/console" style="color:#9cf">Console</a>
<script>
let rev=true;
const l=document.getElementById('l');
function post(u){return fetch(u,{method:'POST'}).then(upd)}
const upd=async()=>{
 try{
  l.textContent=await (await fetch('/buslog')).text();
  if(document.getElementById('fol').checked)l.scrollTop=l.scrollHeight;
  const s=await (await fetch('/status')).json();
  rev=s.bus_rev;
  document.getElementById('revb').textContent=rev?'Bits: MSB first (reversed)':'Bits: as received';
  document.getElementById('b').value=s.bus_baud;
  document.getElementById('st').textContent=
   `RS485 GPIO25  ${s.bus_baud} baud  bytes ${s.bus_bytes}  frames ${s.bus_frames}  edges ${s.bus_edges}  pin ${s.bus_level?'high':'low'}  dropped ${s.bus_dropped}  telnet 2323 ${s.bus_telnet?'connected':'free'}  |  time  +ms since previous frame  bytes`;
 }catch(e){}
}
setInterval(upd,1000);upd();
</script></body></html>)HTML";

static void handleEmu() {
  char j[800];
  snprintf(j, sizeof j,
           "{\"on\":%s,\"speed\":%d,\"mode\":\"%02X\",\"bypass_sp\":%d,\"humidity_sp\":%d,\"frost\":%d,"
           "\"air\":[%d,%d,%d,%d,%d,%d],\"off_us\":%ld,\"gap_us\":%ld,"
           "\"run_h\":%lu,\"filter_h\":%lu,\"comms\":%s,\"p8\":\"%02X\",\"p9\":\"%02X\",\"extract\":%d,\"intake\":%d,\"humidity\":%d,"
           "\"tm_len\":[%d,%d,%d,%d],\"timers\":%s,"
           "\"sent\":{\"88\":%lu,\"8A\":%lu,\"AE\":%lu,\"C5\":%lu},\"late\":%lu,\"synced\":%lu,\"own\":%lu}",
           emu.on ? "true" : "false", emu.speed, emu.mode, emu.bypassSp, emu.humSp, emu.frost,
           emu.air[0], emu.air[1], emu.air[2], emu.air[3], emu.air[4], emu.air[5],
           (long)emuOffUs, (long)emuGapUs,
           (unsigned long)(emuRunMin / 60), (unsigned long)(emuFiltMin / 60), emuComms() ? "true" : "false",
           bus.p8, bus.p9, bus.ext, bus.in, bus.hum,
           emuTmLen[0], emuTmLen[1], emuTmLen[2], emuTmLen[3], emuTmJson().c_str(),
           (unsigned long)emuSent[0], (unsigned long)emuSent[1], (unsigned long)emuSent[2],
           (unsigned long)emuSent[3], (unsigned long)emuLate, (unsigned long)emuSynced, (unsigned long)emuOwn);
  web.send(200, "application/json", j);
}

static void handleStatus() {
  char j[420];
  snprintf(j, sizeof j,
           "{\"uptime\":%lu,\"rssi\":%d,\"baud\":%lu,\"tx\":%s,\"inv\":%s,\"rx\":%lu,\"tx_bytes\":%lu,\"telnet\":%s,"
           "\"bus_baud\":%lu,\"bus_rev\":%s,\"bus_bytes\":%lu,\"bus_frames\":%lu,\"bus_dropped\":%lu,\"bus_telnet\":%s,"
           "\"bus_edges\":%lu,\"bus_level\":%d}",
           (unsigned long)(millis() / 1000), WiFi.RSSI(), (unsigned long)baud,
           txEnabled ? "true" : "false", inverted ? "true" : "false",
           (unsigned long)rxBytes, (unsigned long)txBytes,
           (client && client.connected()) ? "true" : "false",
           (unsigned long)busBaud, busRev ? "true" : "false",
           (unsigned long)busBytes, (unsigned long)busFrames, (unsigned long)busDropped,
           (busClient && busClient.connected()) ? "true" : "false",
           (unsigned long)busEdges, digitalRead(BUS_RX_PIN));
  web.send(200, "application/json", j);
}

static const char SETUP_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VSC bridge setup</title>
<style>
body{font-family:sans-serif;margin:0 auto;padding:8px 16px 24px;max-width:520px;background:#111;color:#ddd}
h2{font-size:20px;margin:12px 0}h3{font-size:16px;margin:22px 0 6px;color:#9cf}
table{border-collapse:collapse;width:100%;font-size:14px}td{padding:4px;border-bottom:1px solid #222;vertical-align:top}
td:first-child{color:#999;width:38%}
input,button{font-size:16px;box-sizing:border-box;width:100%;margin:4px 0;padding:7px;background:#1c1c1c;color:#ddd;border:1px solid #444;border-radius:4px}
input[type=checkbox]{width:auto;margin-right:6px}
button{background:#245;border-color:#368;cursor:pointer}button:disabled{opacity:.6}button.w{background:#422;border-color:#744}
.ok{color:#8d8}.bad{color:#f99}.dim{color:#888;font-size:13px}a{color:#9cf}
#nets div{padding:7px 4px;border-bottom:1px solid #222;cursor:pointer}#nets div:hover{background:#1c1c1c}
</style></head><body>
<h2>VSC bridge</h2>
<p><a href="/unit">MRXBOX readings and controls &rarr;</a></p>
<h3>Status</h3><table id="st"><tr><td>Loading...</td></tr></table>
<h3>WiFi</h3>
<form method="POST" action="/wifi" id="wf">
<button type="button" id="scan">Scan for networks</button><div id="nets"></div>
<input name="ssid" id="ssid" placeholder="Network name (SSID)" maxlength="32" autocomplete="off" required>
<input name="pass" id="wp" type="password" placeholder="Password" maxlength="64" autocomplete="new-password">
<button>Save and join</button></form>
<p class="dim">The bridge restarts and joins the network. Then open http://<span class="hn">vsc-bridge</span>.local/
(or the address your router gives it). If it can't join within a minute, its setup network comes back.</p>
<h3>MQTT (Home Assistant)</h3>
<form method="POST" action="/mqtt">
<input name="host" id="mh" placeholder="Broker host or IP (empty turns MQTT off)" maxlength="64" autocomplete="off">
<input name="port" id="mp" placeholder="Port (1883)" inputmode="numeric" maxlength="5" autocomplete="off">
<input name="user" id="mu" placeholder="User" maxlength="64" autocomplete="off">
<input name="pass" id="mw" type="password" placeholder="Password" maxlength="64" autocomplete="new-password">
<label class="dim"><input type="checkbox" name="nopass" value="1">No password</label>
<input name="tz" id="tz" placeholder="Time zone, POSIX TZ" maxlength="64" autocomplete="off">
<button>Save and restart</button></form>
<p class="dim">Home Assistant finds the MRXBOX by MQTT discovery.</p>
<h3>Device</h3>
<form method="POST" action="/setup/ap"><button>Start the setup network</button></form>
<form method="POST" action="/reboot" onsubmit="return confirm('Restart the bridge?')"><button class="w">Restart</button></form>
<p class="dim"><a href="/console">Console</a> &middot; <a href="/bus">RS485 bus</a> &middot; <a href="/emu">Emulation (JSON)</a></p>
<script>
const $=i=>document.getElementById(i);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const row=(k,v,c)=>`<tr><td>${k}</td><td class="${c||''}">${v}</td></tr>`;
const dur=s=>{const d=s/86400|0,h=s%86400/3600|0,m=s%3600/60|0;return(d?d+' d ':'')+(d||h?h+' h ':'')+m+' min'};
let filled=false;
const upd=async()=>{
 try{
  const s=await(await fetch('/setup/status')).json(),w=s.wifi,a=s.ap,m=s.mqtt;
  let h=row('WiFi',w.conn?`Connected to ${esc(w.ssid)}, ${w.rssi} dBm`:w.saved?`Not connected, trying ${esc(w.saved)}`:'Not set up',w.conn?'ok':'bad');
  if(w.conn)h+=row('Address',`${w.ip}<br>${esc(w.host)}.local`);
  h+=row('Setup network',a.on?`On: ${esc(w.host)}, ${a.clients} connected`:'Off');
  h+=row('MQTT',!m.host?'Off':`${m.conn?'Connected to':'Not connected to'} ${esc(m.host)}:${m.port}`,m.host?(m.conn?'ok':'bad'):'');
  h+=row('Unit (RS485)',s.bus.unit?'Talking':'No frames from the unit',s.bus.unit?'ok':'bad');
  h+=row('Control',s.emu.on?`ESP in place of the VSC, speed ${s.emu.speed}`:`VSC console ${s.vsc?'online':'offline'}`);
  h+=row('Uptime',dur(s.up))+row('Firmware',esc(s.fw))+row('Free memory',(s.heap/1024|0)+' KB');
  $('st').innerHTML=h;
  if(!filled){
   filled=true;$('ssid').value=w.saved;$('mh').value=m.host;$('mp').value=m.port;$('mu').value=m.user;$('tz').value=m.tz;
   if(w.saved)$('wp').placeholder='Password (empty keeps the saved one)';
   if(m.pass)$('mw').placeholder='Password (empty keeps the saved one)';
   document.querySelectorAll('.hn').forEach(e=>e.textContent=w.host);
  }
 }catch(e){$('st').innerHTML=row('Status','No answer from the bridge','bad')}
}
setInterval(upd,3000);upd();
$('scan').onclick=async()=>{
 const b=$('scan');b.disabled=true;b.textContent='Scanning...';
 for(let i=0;i<20;i++){
  try{const r=await(await fetch('/scan')).json();
   if(r.nets){$('nets').innerHTML=r.nets.length?r.nets.map(n=>
    `<div data-s="${esc(n.ssid)}">${esc(n.ssid)} <span class="dim">${n.rssi} dBm${n.open?', open':''}</span></div>`).join(''):
    '<p class="dim">No networks found</p>';break}}catch(e){}
  await new Promise(r=>setTimeout(r,1000));
 }
 b.disabled=false;b.textContent='Scan again';
};
$('nets').onclick=e=>{const d=e.target.closest('div[data-s]');if(d){$('ssid').value=d.dataset.s;$('wp').value='';$('wp').focus()}};
</script></body></html>)HTML";

// The unit: readings and the everyday controls, from the same state and through the same
// commands as HA (console with the VSC, or the emulated VSC's answers).
static const char UNIT_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MRXBOX</title>
<style>
body{font-family:sans-serif;margin:0 auto;padding:8px 16px 24px;max-width:520px;background:#111;color:#ddd}
h2{font-size:20px;margin:12px 0}h3{font-size:16px;margin:22px 0 6px;color:#9cf}
table{border-collapse:collapse;width:100%;font-size:14px}td{padding:4px;border-bottom:1px solid #222}
td:first-child{color:#999;width:45%}
.seg{display:flex;gap:6px;margin:4px 0 10px}.seg button{flex:1}
button,input{font-size:16px;box-sizing:border-box;padding:8px;background:#1c1c1c;color:#ddd;border:1px solid #444;border-radius:4px}
button{cursor:pointer}button.on{background:#245;border-color:#5ad;color:#fff}button:disabled{opacity:.5}
.sp{display:flex;gap:6px;align-items:center;margin:4px 0}.sp span{flex:1;color:#999;font-size:14px}.sp input{width:80px}
.ok{color:#8d8}.bad{color:#f99}.dim{color:#888;font-size:13px}a{color:#9cf}
</style></head><body>
<h2>MRXBOX</h2>
<table id="st"><tr><td>Loading...</td></tr></table>
<h3>Fan speed</h3><div class="seg" data-k="speed"><button>1</button><button>2</button><button>3</button></div>
<h3>Bypass</h3><div class="seg" data-k="bypass"><button>Auto</button><button>On</button><button>Off</button></div>
<h3>Modes</h3><div class="seg"><button data-t="night">Night</button><button data-t="holiday">Holiday</button><button data-t="rising_boost" id="rb">Rising boost</button></div>
<h3>Setpoints</h3>
<div class="sp"><span>Bypass (°C, 15-30)</span><input data-n="bypass_temp" inputmode="numeric"><button>Set</button></div>
<div class="sp"><span>Humidity (%, 50-85)</span><input data-n="humidity_sp" inputmode="numeric"><button>Set</button></div>
<div class="sp"><span>Frost (°C, -5 to 0)</span><input data-n="frost_sp" inputmode="numeric"><button>Set</button></div>
<h3>Airflow %</h3><table id="air"></table>
<p class="dim" id="msg"></p>
<p class="dim"><a href="/">Setup</a> &middot; <a href="/console">Console</a> &middot; <a href="/bus">RS485 bus</a></p>
<script>
const $=i=>document.getElementById(i),Q=s=>document.querySelectorAll(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const row=(k,v,c)=>`<tr><td>${k}</td><td class="${c||''}">${v}</td></tr>`;
let v={},live=false,busy=0;
const g=(k,u)=>v[k]===undefined||v[k]==='None'?'&ndash;':esc(v[k])+(u||'');
const send=async(k,x)=>{
 busy=Date.now();$('msg').textContent='Sending...';
 try{const r=await fetch('/unit/set',{method:'POST',body:new URLSearchParams({k,v:x})});
  $('msg').textContent=r.ok?'Sent. The state updates within a few seconds.':'Not accepted: '+await r.text()}
 catch(e){$('msg').textContent='No answer from the bridge'}
 setTimeout(upd,emu?1500:6000);
};
let emu=false;
const upd=async()=>{
 try{
  const s=await(await fetch('/unit/state')).json();v=s.v;emu=s.emu;
  const comms=v.comms==='ON';live=v.vsc_status==='online';
  let h=row('Control',emu?'ESP in place of the VSC':'VSC console '+(live?'online':(s.shell?'waiting for an answer':'not at a shell yet')),live?'ok':'bad');
  h+=row('Unit',comms?'Connected':'No communication',comms?'ok':'bad');
  h+=row('Running speed',g('fan_running'))+row('Extract air',g('temp_extract',' °C'))+row('Intake air',g('temp_intake',' °C'));
  h+=row('Humidity',g('humidity',' %'))+row('Bypass',v.bypass_state==='ON'?'Open':v.bypass_state==='OFF'?'Closed':'&ndash;');
  const f=['fault_supply_fan','fault_extract_fan','fault_heater','fault_cooler','fault_frost'].filter(k=>v[k]==='ON');
  h+=row('Faults',f.length?f.map(k=>k.slice(6).replace('_',' ')).join(', '):comms?'None':'&ndash;',f.length?'bad':'');
  if(emu&&v.timers){try{h+=row('Time left',esc(JSON.parse(v.timers).text))}catch(e){}}
  h+=row('Run hours',g('run_hours'))+row('Filter hours',g('filter_hours')+(v.filter_change==='ON'?' <span class="bad">change due</span>':''));
  if(v.clock&&!emu)h+=row('VSC clock',g('clock'));
  $('st').innerHTML=h;
  Q('.seg[data-k] button').forEach(b=>{b.classList.toggle('on',v[b.parentNode.dataset.k]===b.textContent);b.disabled=!live});
  Q('button[data-t]').forEach(b=>{b.classList.toggle('on',v[b.dataset.t]==='ON');b.disabled=!live});
  $('rb').style.display=emu?'':'none';
  Q('input[data-n]').forEach(i=>{if(document.activeElement!==i&&v[i.dataset.n]!==undefined)i.value=v[i.dataset.n];i.nextElementSibling.disabled=!live});
  const a=k=>g(k);
  $('air').innerHTML=row('','Supply / extract')+[1,2,3].map(n=>row('Speed '+n,a('air_s'+n)+' / '+a('air_e'+n))).join('');
 }catch(e){$('st').innerHTML=row('Status','No answer from the bridge','bad')}
};
Q('.seg[data-k] button').forEach(b=>b.onclick=()=>send(b.parentNode.dataset.k,b.textContent));
Q('button[data-t]').forEach(b=>b.onclick=()=>send(b.dataset.t,v[b.dataset.t]==='ON'?'OFF':'ON'));
Q('input[data-n]').forEach(i=>i.nextElementSibling.onclick=()=>send(i.dataset.n,i.value));
setInterval(upd,3000);upd();
</script></body></html>)HTML";

// ---- setup network (access point with a captive portal) ----
static DNSServer dns;
static bool apOn = false;
static uint32_t apIdleT;        // last time a phone was on the setup network
static bool staPaused = false;  // stopped retrying the saved network while a phone is on ours
static uint32_t rebootAt = 0;   // restart once the reply has gone out

static void apStart() {
  if (apOn) return;
  WiFi.mode(WIFI_AP_STA);   // the station side keeps trying the saved network, and scans
  WiFi.softAP(HOSTNAME, AP_PASS);
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", WiFi.softAPIP());   // every name points here, so phones open the setup page
  apOn = true;
  apIdleT = millis();
  Serial.printf("Setup network %s  http://%s/\n", HOSTNAME, WiFi.softAPIP().toString().c_str());
}

static void apStop() {
  if (!apOn) return;
  dns.stop();
  WiFi.softAPdisconnect(true);
  apOn = false;
}

static void staBegin() {
  String ssid = prefs.getString("ssid", ""), pass = prefs.getString("pass", "");
  if (ssid.length()) WiFi.begin(ssid.c_str(), pass.c_str());
  staPaused = false;
}

static void startNetServices();

// Called from loop(): the setup network, the BOOT button, and what starts once WiFi is up.
static void wifiLoop() {
  static uint32_t downT = millis(), btnT = 0;
  static bool wasUp = false;
  bool up = WiFi.status() == WL_CONNECTED;
  if (up && !wasUp) startNetServices();
  wasUp = up;
  if (up) downT = millis();
  else if (!apOn && millis() - downT > 60000) apStart();

  if (!digitalRead(AP_BUTTON)) {
    if (!btnT) btnT = millis();
    else if (millis() - btnT > 3000) apStart();
  } else {
    btnT = 0;
  }

  if (!apOn) return;
  dns.processNextRequest();
  if (WiFi.softAPgetStationNum()) {
    apIdleT = millis();
    // While the saved network can't be joined, each retry moves the radio off our channel and
    // drops the phone. Stop retrying while someone is on the setup network.
    if (!up && !staPaused) {
      WiFi.disconnect();
      staPaused = true;
    }
  } else if (staPaused && millis() - apIdleT > 30000) {
    staBegin();
  }
  if (up && millis() - apIdleT > 300000) apStop();
}

static String jsonStr(const String &v) {
  String o = "\"";
  for (size_t i = 0; i < v.length(); i++) {
    char c = v[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if ((uint8_t)c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += c;
  }
  return o + "\"";
}

static void handleSetupStatus() {
  bool up = WiFi.status() == WL_CONNECTED;
  String j = "{\"fw\":\"" FW_BUILD "\",\"up\":" + String(millis() / 1000) + ",\"heap\":" + String(ESP.getFreeHeap());
  j += ",\"wifi\":{\"conn\":" + String(up ? "true" : "false") + ",\"ssid\":" + jsonStr(up ? WiFi.SSID() : String()) +
       ",\"saved\":" + jsonStr(prefs.getString("ssid", "")) + ",\"ip\":\"" + (up ? WiFi.localIP().toString() : String()) +
       "\",\"rssi\":" + String(up ? WiFi.RSSI() : 0) + ",\"host\":\"" HOSTNAME "\"}";
  j += ",\"ap\":{\"on\":" + String(apOn ? "true" : "false") + ",\"clients\":" + String(apOn ? WiFi.softAPgetStationNum() : 0) + "}";
  j += ",\"mqtt\":{\"host\":" + jsonStr(mqHost) + ",\"port\":" + String(prefs.getUInt("mqport", 1883)) +
       ",\"user\":" + jsonStr(prefs.getString("mquser", "")) + ",\"pass\":" +
       (prefs.getString("mqpass", "").length() ? "true" : "false") + ",\"conn\":" + (mqConnected ? "true" : "false") +
       ",\"tz\":" + jsonStr(clockTz) + "}";
  j += ",\"bus\":{\"unit\":" + String(bus.t84 && millis() - bus.t84 < EMU_BUS_MS ? "true" : "false") +
       ",\"frames\":" + String(busFrames) + "}";
  j += ",\"emu\":{\"on\":" + String(emu.on ? "true" : "false") + ",\"speed\":" + String(emu.speed) + "}";
  j += ",\"vsc\":" + String(mqVscOnline ? "true" : "false") + "}";
  web.send(200, "application/json", j);
}

// The scan runs in the background: the first GET starts it, later ones get the list.
static void handleScan() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) { web.send(200, "application/json", "{\"scanning\":true}"); return; }
  if (n < 0) {
    WiFi.scanNetworks(true);
    web.send(200, "application/json", "{\"scanning\":true}");
    return;
  }
  String j = "{\"nets\":[";
  int shown = 0;
  for (int i = 0; i < n && shown < 30; i++) {
    String ss = WiFi.SSID(i);
    if (!ss.length()) continue;   // hidden network
    bool dup = false;
    for (int k = 0; k < n && !dup; k++)   // the same network on several access points: the strongest only
      dup = k != i && WiFi.SSID(k) == ss && (WiFi.RSSI(k) > WiFi.RSSI(i) || (WiFi.RSSI(k) == WiFi.RSSI(i) && k < i));
    if (dup) continue;
    if (shown++) j += ",";
    j += "{\"ssid\":" + jsonStr(ss) + ",\"rssi\":" + String(WiFi.RSSI(i)) +
         ",\"open\":" + (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  WiFi.scanDelete();
  web.send(200, "application/json", j + "]}");
}

static void sendDone(const String &msg) {
  web.send(200, "text/html",
           "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,"
           "initial-scale=1\"><meta http-equiv=\"refresh\" content=\"20;url=/\"><title>VSC bridge</title><style>body{"
           "font-family:sans-serif;margin:16px;background:#111;color:#ddd}a{color:#9cf}</style></head><body><p>" +
               msg + "</p><p><a href=\"/\">Back to setup</a></p></body></html>");
}

// Captive portal: a phone on the setup network checks some address of its own (for example
// /generate_204); anything not ours is sent to the setup page, which makes the phone show it.
static void handleNotFound() {
  String h = web.hostHeader();
  if (apOn && h != WiFi.softAPIP().toString() && h != WiFi.localIP().toString() && h != HOSTNAME &&
      h != HOSTNAME ".local") {
    web.sendHeader("Location", "http://" + WiFi.softAPIP().toString() + "/", true);
    web.send(302, "text/plain", "");
    return;
  }
  web.send(404, "text/plain", "not found");
}

static void setupWeb() {
  web.on("/", HTTP_GET, [] { web.send_P(200, "text/html", SETUP_PAGE); });
  web.on("/console", HTTP_GET, [] { web.send_P(200, "text/html", PAGE); });
  web.on("/unit", HTTP_GET, [] { web.send_P(200, "text/html", UNIT_PAGE); });
  web.on("/unit/state", HTTP_GET, [] {
    if (!webUnitT || millis() - webUnitT >= 120000) mqLastPoll = 0;   // page just opened: poll now
    webUnitT = millis();
    if (!emu.on && mqBypassTemp) webPut(MQ_BASE "/bypass_temp", String(mqBypassTemp).c_str());
    String j = "{\"emu\":" + String(emu.on ? "true" : "false") + ",\"shell\":" + (vscShell ? "true" : "false") + ",\"v\":{";
    for (int i = 0; i < webKeys; i++) {
      if (i) j += ",";
      j += jsonStr(webKey[i]) + ":" + jsonStr(webVal[i]);
    }
    web.send(200, "application/json", j + "}}");
  });
  web.on("/unit/set", HTTP_POST, [] {
    // The everyday controls only: no filter reset, emulation switch or debug from this page.
    static const char *const OK[] = {"speed", "bypass", "bypass_temp", "humidity_sp", "frost_sp", "night", "holiday", "rising_boost"};
    String k = web.arg("k");
    bool ok = false;
    for (const char *o : OK) ok |= k == o;
    if (!ok || !web.hasArg("v")) { web.send(400, "text/plain", "unknown setting"); return; }
    if (!emu.on && !vscShell) { web.send(503, "text/plain", "the VSC console isn't at a shell"); return; }
    mqHandle((String(MQ_BASE "/") + k + "/set").c_str(), web.arg("v").c_str());
    web.send(200, "text/plain", "ok");
  });
  web.on("/setup/status", HTTP_GET, handleSetupStatus);
  web.on("/scan", HTTP_GET, handleScan);
  auto toSetup = [] {
    web.sendHeader("Location", "/", true);
    web.send(302, "text/plain", "");
  };
  web.on("/wifi", HTTP_GET, toSetup);
  web.on("/mqtt", HTTP_GET, toSetup);
  web.on("/wifi", HTTP_POST, [] {
    String ssid = web.arg("ssid");
    ssid.trim();
    if (!ssid.length() || ssid.length() > 32 || web.arg("pass").length() > 64) {
      web.send(400, "text/plain", "network name 1-32 characters, password up to 64");
      return;
    }
    // an empty password keeps the saved one for the same network; another network gets it as it is
    if (web.arg("pass").length() || ssid != prefs.getString("ssid", "")) prefs.putString("pass", web.arg("pass"));
    prefs.putString("ssid", ssid);
    sendDone("Saved. The bridge is restarting to join the network. Put this phone or computer back on that "
             "network, then open http://" HOSTNAME ".local/ or the address your router gives the bridge.");
    rebootAt = millis();
  });
  web.on("/mqtt", HTTP_POST, [] {
    long port = web.arg("port").length() ? web.arg("port").toInt() : 1883;
    if (port < 1 || port > 65535) {
      web.send(400, "text/plain", "port 1-65535");
      return;
    }
    String host = web.arg("host");
    host.trim();
    prefs.putString("mqhost", host);
    prefs.putUInt("mqport", port);
    prefs.putString("mquser", web.arg("user"));
    if (web.hasArg("nopass")) prefs.putString("mqpass", "");
    else if (web.arg("pass").length()) prefs.putString("mqpass", web.arg("pass"));   // empty keeps it
    if (web.arg("tz").length()) prefs.putString("tz", web.arg("tz"));
    sendDone("Saved. Restarting...");
    rebootAt = millis();
  });
  web.on("/setup/ap", HTTP_POST, [] {   // as the BOOT button; on=0 stops it
    if (web.arg("on") == "0") apStop();
    else apStart();
    sendDone(apOn ? "The setup network " HOSTNAME " is on. It goes off by itself 5 minutes after the last phone "
                    "leaves it, while the bridge is on its WiFi."
                  : "The setup network is off.");
  });
  web.on("/reboot", HTTP_POST, [] {
    sendDone("Restarting...");
    rebootAt = millis();
  });
  web.onNotFound(handleNotFound);
  web.on("/log", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", ringText(conLog)); });
  web.on("/bus", HTTP_GET, [] { web.send_P(200, "text/html", BUS_PAGE); });
  web.on("/buslog", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", ringText(busLog)); });
  web.on("/bustiming", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", ringText(timLog)); });
  web.on("/busbytes", HTTP_GET, [] { web.send(200, "text/plain; charset=utf-8", byteLog ? ringText(*byteLog) : String()); });
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
  web.on("/emu", HTTP_GET, handleEmu);
  web.on("/emu", HTTP_POST, [] {
    if (web.hasArg("speed")) emu.speed = constrain(web.arg("speed").toInt(), 1, 3);
    if (web.hasArg("mode")) emu.mode = (strtol(web.arg("mode").c_str(), nullptr, 16) & 0x7F) | 0x60;
    if (web.hasArg("bsp")) emu.bypassSp = constrain(web.arg("bsp").toInt(), 0, 31);
    if (web.hasArg("hsp")) emu.humSp = constrain(web.arg("hsp").toInt(), 0, 99);
    if (web.hasArg("frost")) emu.frost = constrain(web.arg("frost").toInt(), 0, 15);
    if (web.hasArg("air")) {
      String a = web.arg("air");
      for (int i = 0, p = 0; i < 6 && p >= 0; i++) {
        emu.air[i] = constrain(a.substring(p).toInt(), 0, 100);
        p = a.indexOf(',', p);
        if (p >= 0) p++;
      }
    }
    if (web.hasArg("off")) emuOffUs = web.arg("off").toInt();
    if (web.hasArg("gap")) emuGapUs = web.arg("gap").toInt();
    if (web.hasArg("lgap")) emuLastGapUs = web.arg("lgap").toInt();
    for (int i = 0; i < TM_N; i++)
      if (web.hasArg(TM_KEY[i]) && emuTmValid(i, web.arg(TM_KEY[i]).toInt())) {
        emuTmLen[i] = web.arg(TM_KEY[i]).toInt();
        emuTmSave();
      }
    if (web.hasArg("run") || web.hasArg("filt")) {   // hours, e.g. carried over from the VSC
      if (web.hasArg("run")) emuRunMin = web.arg("run").toInt() * 60;
      if (web.hasArg("filt")) emuFiltMin = web.arg("filt").toInt() * 60;
      emuHoursSave();
    }
    mqEmuDirty = true;
    emuSave();
    if (web.hasArg("on")) emuSwitch(web.arg("on") == "1");
    handleEmu();
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

// Joins the saved network, waiting up to 20 s so MQTT and NTP can start in setup(). If there is
// none, the setup network starts now; if it can't be joined, wifiLoop() starts it after a minute
// and the ESP keeps trying the saved network meanwhile.
static void setupWifi() {
  pinMode(AP_BUTTON, INPUT_PULLUP);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.setAutoReconnect(true);
  if (!prefs.getString("ssid", "").length()) {
    apStart();
    return;
  }
  staBegin();
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(250);
  if (WiFi.status() == WL_CONNECTED) Serial.printf("WiFi IP %s\n", WiFi.localIP().toString().c_str());
}

// NTP and MQTT, the first time WiFi is up (at boot, or later if the network was down then).
static void startNetServices() {
  static bool done = false;
  if (done) return;
  done = true;
  configTzTime(clockTz.c_str(), "pool.ntp.org", "time.google.com");
  if (!mq) setupMqtt();
}

void setup() {
  pinMode(BUS_TX_PIN, OUTPUT);       // first thing: keep an auto-direction module in receive
  digitalWrite(BUS_TX_PIN, HIGH);
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
  if (prefs.getBytesLength("emu") == sizeof emu) prefs.getBytes("emu", &emu, sizeof emu);
  emuRunMin = prefs.getUInt("erun", 0);
  emuTmLoad();
  emuFiltMin = prefs.getUInt("efilt", 0);
  emuBuild();
  emuTimer = timerBegin(1000000);
  timerAttachInterrupt(emuTimer, emuTick);
  timerAlarm(emuTimer, 25, true, 0);
  attachInterrupt(BUS_RX_PIN, busEdgeIsr, CHANGE);
  byteLog = new Ring;
  busQueue = xQueueCreate(32, sizeof(BusFrame));
  xTaskCreatePinnedToCore(busTask, "bus", 4096, nullptr, 2, nullptr, 0);

  clockTz = prefs.getString("tz", CLOCK_TZ);
  mqHost = prefs.getString("mqhost", "");
  setupWifi();
  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.begin();
  setupWeb();
  if (WiFi.status() == WL_CONNECTED) startNetServices();
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
  wifiLoop();
  if (rebootAt && millis() - rebootAt > 1000) {
    emuHoursSave();
    ESP.restart();
  }

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
  emuHours();
  emuTimers();
  mqLoop();

  while (client && client.connected() && client.available()) {
    uint8_t c = (uint8_t)client.read();
    if (iacState == 0 && c == 0xFF) { iacState = 1; continue; }
    if (iacState == 1) { iacState = (c >= 0xFB && c <= 0xFE) ? 2 : 0; continue; }
    if (iacState == 2) { iacState = 0; continue; }
    vscWrite(&c, 1);
  }
}
