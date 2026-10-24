/* LD_PRELOAD shim: logs traffic on /dev/i2c/0 (open/ioctl/read/write). Freestanding, raw EABI syscalls. */
typedef unsigned int u32;
typedef long ssize_t_;
#define MAXLOG (3u * 1024 * 1024)

/* errno goes through es-lcd's own GOT slot for __errno_location (non-PIE, fixed address). Our own
   PLT import is never bound by the unit's ld-2.3.3 when preloaded at boot, so calling it jumped to 0.
   The slot may still point at the lazy resolver, which wants ip = slot address, so call it like a PLT stub. */
#define ESLCD_GOT_ERRNO 0x1e1a4

__attribute__((noinline, target("arm"))) static int *errno_loc(void)
{
    register int *r0 __asm__("r0");
    __asm__ volatile("mov ip, %1\n\tmov lr, pc\n\tldr pc, [ip]"
                     : "=r"(r0) : "r"(ESLCD_GOT_ERRNO)
                     : "r1", "r2", "r3", "ip", "lr", "memory", "cc");
    return r0;
}
#define __errno_location errno_loc

static inline long sc4(long n, long a, long b, long c, long d)
{
    register long r7 __asm__("r7") = n;
    register long r0 __asm__("r0") = a;
    register long r1 __asm__("r1") = b;
    register long r2 __asm__("r2") = c;
    register long r3 __asm__("r3") = d;
    __asm__ volatile("svc #0" : "+r"(r0) : "r"(r7), "r"(r1), "r"(r2), "r"(r3) : "memory");
    return r0;
}
static long fin(long r)
{
    if (r < 0 && r > -4096) { *__errno_location() = (int)-r; return -1; }
    return r;
}

static int i2cfd = -1, logfd = -2;
static u32 logged;

static int streq(const char *a, const char *b) { while (*a && *a == *b) a++, b++; return *a == *b; }

/* Entries are buffered and written to the page cache about once a second; fsync every ~15 s. */
static char lbuf[16384];
static u32 lused, now_sec, last_flush, last_sync;

static void flush(int force_sync)
{
    if (lused) { sc4(4, logfd, (long)lbuf, lused, 0); lused = 0; }
    if (force_sync || now_sec - last_sync >= 15) { sc4(118, logfd, 0, 0, 0); last_sync = now_sec; }
    last_flush = now_sec;
}

static void to_file(const char *s, int n)
{
    if (logfd == -2) /* O_WRONLY|O_CREAT|O_APPEND */
        logfd = (int)sc4(5, (long)"/i2clog.txt", 0x1 | 0x40 | 0x400, 0644, 0);
    if (logfd < 0 || logged > MAXLOG) return;
    if (lused + n > sizeof(lbuf)) flush(0);
    for (int i = 0; i < n; i++) lbuf[lused + i] = s[i];
    lused += n;
    logged += n;
    if (logged < 65536) flush(1); /* start-up: nothing lost if es-lcd exits or the unit resets */
    else if (now_sec - last_flush >= 1 || lused > 12000) flush(0);
}

/* Debug logging is off unless /tmp/debug exists (checked once a second, so it is off again after a
   restart). When on, each line goes to /i2clog.txt and to the console as "@L <line>", where the
   bridge publishes it to MQTT. Start, exit and crash notes always go to the file. */
static int dlog, confd = -2;
static u32 dlog_t = 0xffffffff;
static char cbuf[600];

static void emit(const char *s, int n)
{
    if (now_sec != dlog_t) {
        int on = sc4(33, (long)"/tmp/debug", 0, 0, 0) == 0;
        if (dlog && !on && logfd >= 0) flush(1);
        dlog = on; dlog_t = now_sec;
    }
    if (!dlog) return;
    to_file(s, n);
    if (confd == -2) /* O_WRONLY|O_NOCTTY|O_NONBLOCK: a full console drops the line, never stalls es-lcd */
        confd = (int)sc4(5, (long)"/dev/console", 0x1 | 0x100 | 0x800, 0, 0);
    if (confd < 0 || n > (int)sizeof(cbuf) - 3) return;
    cbuf[0] = '@'; cbuf[1] = 'L'; cbuf[2] = ' ';
    for (int i = 0; i < n; i++) cbuf[3 + i] = s[i];
    sc4(4, confd, (long)cbuf, n + 3, 0);
}

static char *putstr(char *p, const char *s) { while (*s) *p++ = *s++; return p; }
static char *putdec(char *p, u32 v)
{
    char t[12]; int n = 0;
    do { t[n++] = '0' + v % 10; v /= 10; } while (v);
    while (n) *p++ = t[--n];
    return p;
}
static char *puthex(char *p, const unsigned char *b, long n)
{
    static const char H[] = "0123456789abcdef";
    for (long i = 0; i < n; i++) { *p++ = H[b[i] >> 4]; *p++ = H[b[i] & 15]; if (i + 1 < n) *p++ = ' '; }
    return p;
}
static void stamp(char **pp)
{
    long tv[2] = {0, 0};
    sc4(78, (long)tv, 0, 0, 0);
    now_sec = tv[0];
    char *p = *pp;
    p = putdec(p, tv[0]); *p++ = '.';
    u32 us = tv[1];
    *p++ = '0' + us / 100000 % 10; *p++ = '0' + us / 10000 % 10; *p++ = '0' + us / 1000 % 10;
    *p++ = '0' + us / 100 % 10; *p++ = '0' + us / 10 % 10; *p++ = '0' + us % 10;
    *p++ = ' ';
    *pp = p;
}
/* Touch-controller frames (5 bytes) are skipped; repeats of an identical frame are logged only every 30 s. */
static unsigned char lastb[4][64];
static long lastn[4], lastret[4];
static u32 lastt[4];

static void logdata(const char *tag, const unsigned char *b, long n, long ret)
{
    char line[512], *p = line;
    if (n == 5) return;
    {
        int slot = (tag[0] == 'W' ? 0 : 2) + (n > 3 && n != 13 ? 1 : 0), same = lastn[slot] == n && lastret[slot] == ret && lastt[slot];
        for (long i = 0; same && i < n && i < 64; i++) if (lastb[slot][i] != b[i]) same = 0;
        stamp(&p); p = line;
        if (same && now_sec - lastt[slot] < 30) return;
        for (long i = 0; i < n && i < 64; i++) lastb[slot][i] = b[i];
        lastn[slot] = n; lastret[slot] = ret; lastt[slot] = now_sec;
    }
    stamp(&p);
    p = putstr(p, tag); *p++ = ' ';
    p = putdec(p, n); p = putstr(p, " ret="); 
    if (ret < 0) { *p++ = '-'; ret = -ret; }
    p = putdec(p, ret); *p++ = ':'; *p++ = ' ';
    if (n > 64) n = 64;
    p = puthex(p, b, n);
    *p++ = '\n';
    emit(line, p - line);
}

/* ---- Debug page: tap the Nuaire logo on the Maintenance screen, Home to leave.
   Calls straight into es-lcd (non-PIE, fixed addresses) and swaps the Maintenance
   entries in its screen tables. ---- */
typedef int (*f_text_create)(int x, int y, int size, const char *s, void **h);
typedef int (*f_text_show)(void *h, void *screen, int grey, int a4, int a5);
typedef int (*f_text_delete)(void *h);
typedef int (*f_box)(int x0, int y0, int x1, int y1, int r, int g, int b);
typedef int (*f_key)(int key);
typedef int (*f_etr)(int a, int b, int c, int d);
#define BODY_TBL ((volatile u32 *)0x70810)
#define ETR_TBL ((volatile u32 *)0x70914)
#define SCR_MAINT 35
#define BODY_MAINT 0xcf18u
#define ETR_MAINT 0xad1cu
#define U8(a) (*(volatile unsigned char *)(a))
#define U16(a) (*(volatile unsigned short *)(a))

static int themed;
/* Hidden so calls stay inside the .so and never go through the PLT. */
__attribute__((visibility("hidden"))) int hassos_get(void);
__attribute__((visibility("hidden"))) int hassos_toggle(void);
static void hassos_show(void);
typedef int (*f_touch)(int x0, int y0, int x1, int y1, int key);
#define KEY_HASSOS 0x7a
static u32 hassos_tap;

static unsigned char rx[28], txf[13], rq[3];
static u32 nrx, ntx, t_rx;
/* Last full reply per request type: 01 normal, 0c boost, 0d boost with 0x708ca set. */
static const unsigned char REQS[3] = {0x01, 0x0c, 0x0d};
static unsigned char rxk[3][28];
static u32 nk[3], tk[3];
static int dbg, page;
static u32 dbg_t0, dbg_last, dbg_nrx;

static u32 nowsec(void) { long tv[2] = {0, 0}; sc4(78, (long)tv, 0, 0, 0); return tv[0]; }

static char *hx(char *p, unsigned v) { static const char H[] = "0123456789abcdef"; *p++ = H[(v >> 4) & 15]; *p++ = H[v & 15]; return p; }
static char *hxs(char *p, const unsigned char *b, int n) { for (int i = 0; i < n; i++) { p = hx(p, b[i]); *p++ = ' '; } return p; }
static char *half(char *p, unsigned char v) /* signed half-degrees */
{
    int t = (signed char)v;
    if (t < 0) { *p++ = '-'; t = -t; }
    p = putdec(p, t >> 1); *p++ = '.'; *p++ = t & 1 ? '5' : '0';
    return p;
}

static void line(int i, char *end, char *buf, int grey)
{
    int x = i >= 11 ? 66 : 2, y = 11 + 14 * i; /* rows 11+ leave the Home key free */
    void *h = 0;
    *end = 0;
    ((f_box)0xec4c)(x, y - 11, 319, y + 3, 0, 0, 0);
    if (((f_text_create)0x11994)(x, y, 9, buf, &h) == 0 && h) {
        ((f_text_show)0x11a10)(h, *(void **)0x1e378, grey, 0x3f, 0xf);
        ((f_text_delete)0x11aa4)(h);
    }
}

/* p18/p19: (v >> 1) is active low and bit-reversed, bit 6 clear = +1 ... bit 0 clear = +64 */
static u32 rh(unsigned char v)
{
    u32 r = 0;
    v >>= 1;
    for (int i = 0; i < 7; i++) if (!(v & (0x40 >> i))) r += 1u << i;
    return r;
}

/* Page 2: the full 28-byte reply for each request type, 7 bytes per row. */
static void draw_replies(u32 now)
{
    char b[80], *p;
    p = putstr(b, "REPLIES BY REQ  (logo: page 1)"); line(0, p, b, 0xa0);
    for (int k = 0; k < 3; k++) {
        int r0 = 1 + 5 * k;
        p = putstr(b, "req "); p = hx(p, REQS[k]); p = putstr(p, "  n "); p = putdec(p, nk[k]);
        if (nk[k]) { p = putstr(p, "  age "); p = putdec(p, now - tk[k]); *p++ = 's'; }
        else p = putstr(p, "  (none yet)");
        line(r0, p, b, 0xa0);
        for (int r = 0; r < 4; r++) {
            p = hx(b, r * 7); p = putstr(p, ": "); p = hxs(p, rxk[k] + r * 7, 7);
            line(r0 + 1 + r, p, b, nk[k] ? 0xff : 0x60);
        }
    }
}

static void draw(void)
{
    char b[80], *p;
    const unsigned char *q = rx + 8, *d = txf + 1;
    u32 now = nowsec();
    dbg_last = now; dbg_nrx = nrx;
    if (page) { draw_replies(now); return; }
    p = putstr(b, "MVHR DEBUG  rx "); p = putdec(p, nrx); p = putstr(p, "  tx "); p = putdec(p, ntx);
    p = putstr(p, "  age "); p = putdec(p, nrx ? now - t_rx : 0); *p++ = 's'; line(0, p, b, 0xa0);
    for (int r = 0; r < 4; r++) {
        p = putstr(b, "RX "); p = hx(p, r * 8); p = putstr(p, ": "); p = hxs(p, rx + r * 8, r == 3 ? 4 : 8);
        if (r == 3) { p = putstr(p, "  req "); p = hxs(p, rq, 3); }
        line(1 + r, p, b, 0xff);
    }
    p = putstr(b, "Clock "); p = hx(p, q[1] & 0x3f); *p++ = ':'; p = hx(p, q[0] & 0x7f); *p++ = ' ';
    p = hx(p, q[2] & 0x3f); *p++ = '/'; p = hx(p, q[3] & 0x1f); *p++ = '/'; p = hx(p, q[4]);
    p = putstr(p, "  RH "); p = putdec(p, rh(q[18])); p = putstr(p, "% p19 "); p = putdec(p, rh(q[19]));
    line(5, p, b, 0xff);
    p = putstr(b, "Inside  p5 "); p = hx(p, q[5]); p = putstr(p, " ~"); p = hx(p, q[6]); p = putstr(p, " = ");
    p = half(p, q[5]); p = putstr(p, (q[5] ^ q[6]) == 0xff ? " C" : " C (bad inv)"); line(6, p, b, 0xff);
    p = putstr(b, "Outside p16 "); p = hx(p, q[16]); p = putstr(p, " ~"); p = hx(p, q[17]); p = putstr(p, " = ");
    p = half(p, q[16]); p = putstr(p, (q[16] ^ q[17]) == 0xff ? " C" : " C (bad inv)"); line(7, p, b, 0xff);
    /* p7 bit 0x20 and p11 bits 0x02/0x04/0x10 clear while the unit is boosting */
    p = putstr(b, "p7-15: "); p = hxs(p, q + 7, 9); if (!(q[7] & 0x20)) p = putstr(p, "BST"); line(8, p, b, 0xff);
    /* p8/p9 fault bits are active when clear; p9 bits 1-2 are speed bits but stayed at speed 1
       during a shell speed 2, so the shell sensor uses p7 instead (sensors_state) */
    p = putstr(b, "Spd "); *p++ = !(q[9] & 4) ? '3' : !(q[9] & 2) ? '2' : '1'; p = putstr(p, " Flt:");
    if ((q[8] & 0xe8) == 0xe8 && (q[9] & 0x24) == 0x24) p = putstr(p, " none");
    if (!(q[8] & 0x40)) p = putstr(p, " Htr");
    if (!(q[8] & 0x80)) p = putstr(p, " Cool");
    if (!(q[8] & 0x08)) p = putstr(p, " Sup");
    if (!(q[8] & 0x20)) p = putstr(p, " Ext");
    if (!(q[9] & 0x20)) p = putstr(p, " Frst");
    if (!(q[9] & 0x04)) p = putstr(p, " Test");
    line(9, p, b, 0xff);
    p = putstr(b, "TX "); p = hx(p, txf[0]); p = putstr(p, " d0-4: "); p = hxs(p, d, 5); line(10, p, b, 0xff);
    p = putstr(b, "d5-10: "); p = hxs(p, d + 5, 6); line(11, p, b, 0xff);
    /* d0 flag bits are active when clear */
    p = putstr(b, "Ovr"); *p++ = '0' + !(d[0] & 0x80); p = putstr(p, " RBst"); *p++ = '0' + !(d[0] & 0x40);
    p = putstr(p, " Nite"); *p++ = '0' + !(d[0] & 0x10); p = putstr(p, " Hol"); *p++ = '0' + !(d[0] & 0x20);
    p = putstr(p, " b3:"); *p++ = '0' + !(d[0] & 8); p = putstr(p, " b2:"); *p++ = '0' + !(d[0] & 4); line(12, p, b, 0xff);
    p = putstr(b, "Bypass "); p = putdec(p, d[1] >> 2); p = putstr(p, "C Hum "); p = putdec(p, d[2] >> 1);
    p = putstr(p, "% Frost "); p = putdec(p, d[3] >> 4);
    p = putstr(p, (q[9] & 0x08) ? "  BYP ON" : "  BYP off"); line(13, p, b, 0xff);
    p = putstr(b, "Air%");
    for (int i = 5; i < 11; i++) { *p++ = ' '; p = putdec(p, d[i] >> 1); }
    line(14, p, b, 0xff);
    p = putstr(b, "Tmr o"); p = putdec(p, U16(0x1e320)); p = putstr(p, " h"); p = putdec(p, U16(0x1e322));
    p = putstr(p, " n"); p = putdec(p, U16(0x1e324)); p = putstr(p, " s"); p = putdec(p, U16(0x1e31c));
    p = putstr(p, " f"); p = putdec(p, U16(0x1e31e)); line(15, p, b, 0xa0);
}

static void frame(void)
{
    ((f_box)0xec4c)(0, 0, 319, 239, 0, 0, 0);
    ((f_box)0xec4c)(4, 200, 60, 236, 0x30, 0x30, 0x30);
    { char b[8], *p = putstr(b, "BACK"); void *h = 0; *p = 0;
      if (((f_text_create)0x11994)(12, 223, 9, b, &h) == 0 && h) { ((f_text_show)0x11a10)(h, *(void **)0x1e378, 0xff, 0x3f, 0xf); ((f_text_delete)0x11aa4)(h); } }
    draw();
}

static int body_maint(int key)
{
    key &= 0xff;
    if (!dbg) {
        if (key == KEY_HASSOS) {
            u32 now = nowsec();
            if (now - hassos_tap >= 1) { hassos_tap = now; hassos_toggle(); hassos_show(); }
            return 0;
        }
        if (key != 0x4e) return ((f_key)BODY_MAINT)(key);
        dbg = 1; page = 0; dbg_t0 = nowsec();
        frame();
        return 0;
    }
    U16(0x1e2da) = 0; /* keep the sleep screen away while watching */
    if (key == 0x68 && nowsec() - dbg_t0 >= 2) { dbg = 0; return SCR_MAINT; }
    if (key == 0x4e) { page ^= 1; frame(); return 0; } /* logo again: switch page */
    if (nowsec() != dbg_last || nrx != dbg_nrx) draw();
    return 0;
}
static int etr_maint(int a, int b, int c, int d)
{
    dbg = 0;
    int r = ((f_etr)ETR_MAINT)(a, b, c, d);
    if (themed == 1) {
        if (hassos_get()) hassos_show();
        ((f_touch)0xf964)(78, 155, 307, 187, KEY_HASSOS);
    }
    return r;
}

/* ---- Dark theme: es-lcd draws runtime text and erase boxes for a white screen. When the dark
   images are installed (images/.dark exists) its drawing calls are redirected here: dark text
   becomes light, white or light-grey fills take the colour under the box and the fan speed bars
   use the theme colours. Each patched function starts with "ldr pc,[pc,#-4]; .word fn". ---- */
typedef struct { volatile unsigned short *px; int w, h; } scr_t;
typedef int (*f_font_init)(const char *path, int size);
typedef int (*f_render)(const char *s, int x, int y, int grey, int a4, void *screen);
typedef int (*f_img)(const char *name);
#define RGB565(r, g, b) ((((r) >> 3) << 11) | (((g) >> 2) << 5) | ((b) >> 3))
#define C_NAVY 0x08c6   /* #081831 page background */
#define C_BAR_OFF 0x2a2b /* #29455a */
#define C_BAR_ON 0x05dd  /* #00baef */
#define C_MUTED 0x5b90   /* #5a7184 */
#define C_SELECT 0x0aaf  /* #08557b */

static void fill(scr_t *s, int x, int y, int w, int h, unsigned c)
{
    if (x < 0) w += x, x = 0;
    if (y < 0) h += y, y = 0;
    if (x + w > s->w) w = s->w - x;
    if (y + h > s->h) h = s->h - y;
    for (int j = 0; j < h; j++) {
        volatile unsigned short *p = s->px + (y + j) * s->w + x;
        for (int i = 0; i < w; i++) p[i] = c;
    }
}

/* Colour under a box: the one most of its four corners share. */
static unsigned under(scr_t *s, int x, int y, int w, int h)
{
    int x1 = x + w - 1, y1 = y + h - 1;
    if (x < 0 || y < 0 || w < 1 || h < 1 || x1 >= s->w || y1 >= s->h) return C_NAVY;
    unsigned c[4] = {s->px[y * s->w + x], s->px[y * s->w + x1], s->px[y1 * s->w + x], s->px[y1 * s->w + x1]};
    for (int i = 0; i < 3; i++)
        for (int k = i + 1; k < 4; k++) if (c[i] == c[k]) return c[i];
    return C_NAVY;
}

static unsigned theme(scr_t *s, int x, int y, int w, int h, int r, int g, int b)
{
    r &= 0xff; g &= 0xff; b &= 0xff;
    if (r == 0xd6 && g == 0x7d) return C_BAR_OFF;            /* fan bars, off */
    if (r == 0xaf && g == 0xd6 && b == 0x7d) return C_BAR_ON; /* fan bars, on */
    if (r == 0x3c && g == 0xdc && b == 0x3c) return 0xffff;   /* timed speed mark inside a bar */
    if (r == 0xc0 && g == 0xc0 && b == 0xc0) return C_MUTED;
    if (r >= 0xb0 && g >= 0xb0 && b >= 0xb0) return under(s, x, y, w, h);
    return RGB565(r, g, b);
}

static int my_box(scr_t *s, int x, int y, int w, int h, int r, int g, int b) /* simplewidget_box */
{
    if (!s || y + h > s->h || x + w > s->w) return -1;
    fill(s, x, y, w, h, theme(s, x, y, w, h, r, g, b));
    return 0;
}
static int my_rect(scr_t *s, int x, int y, int w, int h, int r, int g, int b) /* simplewidget_screen_draw_rectangle */
{
    if (!s) return -1;
    fill(s, x, y, w, h, theme(s, x, y, w, h, r, g, b));
    return 0;
}
static int my_white(scr_t *s, int x, int y, int w, int h) /* simplewidget_screen_set */
{
    if (!s || y + h > s->h || x + w > s->w) return -1;
    fill(s, x, y, w, h, under(s, x, y, w, h));
    return 0;
}
static int my_green(scr_t *s, int x, int y, int w, int h) /* simplewidget_screen_green */
{
    if (!s || y + h > s->h || x + w > s->w) return -1;
    fill(s, x, y, w, h, C_SELECT);
    return 0;
}
/* simplewidget_text_show: the colour is one grey level (0x1f,0,0 is red); dark greys are inverted. */
static int my_text(int *h, void *screen, int grey, int a4, int a5)
{
    if (!screen || !h) return -1;
    ((f_font_init)0x11db8)((const char *)0x1563c, -1);
    grey &= 0xffff;
    if (grey == 0x1f && !(a4 & 0xffff) && !(a5 & 0xffff)) grey = 1;
    else if (grey < 0x80) grey = 0xff - grey;
    return ((f_render)0x11ef0)((const char *)(h + 3), h[0], h[1], grey, h[2], screen) >= 0 ? 0 : -1;
}

static void patch(u32 at, void *fn)
{
    volatile u32 *p = (volatile u32 *)at;
    p[0] = 0xe51ff004; /* ldr pc, [pc, #-4] */
    p[1] = (u32)fn;
}
static int themed = -1;
static void theme_init(void)
{
    if (themed >= 0) return;
    themed = sc4(33, (long)"/opt/dvsdk/dm355/images/.dark", 0, 0, 0) == 0;
    if (!themed) return;
    if (sc4(125, 0x11000, 0x1000, 7, 0) != 0) { themed = 0; return; } /* mprotect rwx */
    patch(0x1122c, my_white);
    patch(0x112d8, my_green);
    patch(0x11384, my_box);
    patch(0x115c8, my_rect);
    patch(0x11a10, my_text);
    sc4(0xf0002, 0x11000, 0x12000, 0, 0); /* cacheflush */
}
/* Crash and exit logging: a fatal signal logs pc/lr/fault address, an exit logs EXIT. */
static void note(const char *s)
{
    char line[96], *p = line;
    stamp(&p); p = putstr(p, s); *p++ = '\n'; to_file(line, p - line);
}
static char *put32(char *p, u32 v) { for (int s = 24; s >= 0; s -= 8) p = hx(p, v >> s); return p; }
static void on_crash(int sig, void *info, void *uc)
{
    const u32 *sc = (const u32 *)((char *)uc + 20); /* ucontext: flags, link, stack_t, sigcontext */
    char line[160], *p = line;
    (void)info;
    stamp(&p); p = putstr(p, "CRASH sig="); p = putdec(p, sig);
    p = putstr(p, " pc="); p = put32(p, sc[18]); p = putstr(p, " lr="); p = put32(p, sc[17]);
    p = putstr(p, " sp="); p = put32(p, sc[16]); p = putstr(p, " addr="); p = put32(p, sc[20]);
    p = putstr(p, " r0="); p = put32(p, sc[3]); p = putstr(p, " r1="); p = put32(p, sc[4]);
    *p++ = '\n'; to_file(line, p - line); flush(1);
    sc4(37, sc4(20, 0, 0, 0, 0), sig, 0, 0); /* handler was reset: dies with the same signal */
}
__attribute__((constructor)) static void init(void)
{
    static const int SIGS[] = {4, 6, 7, 8, 11};
    u32 act[5] = {(u32)on_crash, 0x4 | 0x40000000 | 0x80000000u, 0, 0, 0}; /* SIGINFO|NODEFER|RESETHAND */
    for (int i = 0; i < 5; i++) sc4(174, SIGS[i], (long)act, 0, 8);
    note("START");
    theme_init();
    note(themed ? "THEME dark" : "THEME off");
}
__attribute__((destructor)) static void fini(void) { note("EXIT"); flush(1); }

/* Settings page (screen 35): redraws the "Controlled by HASSOS" tick box state. */
static void hassos_show(void)
{
    if (themed == 1) ((f_img)0xee58)(hassos_get() ? "images/Settings-HASSOS-checked.png" : "images/Maintenance.png");
}

static void hook(void)
{
    theme_init();
    if (BODY_TBL[SCR_MAINT] == BODY_MAINT) BODY_TBL[SCR_MAINT] = (u32)body_maint;
    if (ETR_TBL[SCR_MAINT] == ETR_MAINT) ETR_TBL[SCR_MAINT] = (u32)etr_maint;
}

int open(const char *path, int flags, unsigned mode)
{
    long r = fin(sc4(5, (long)path, flags, mode, 0));
    if (r >= 0 && streq(path, "/dev/i2c/0")) {
        i2cfd = (int)r;
        char line[96], *p = line; stamp(&p); p = putstr(p, "OPEN /dev/i2c/0\n"); emit(line, p - line);
    }
    return (int)r;
}
int ioctl(int fd, unsigned long req, long arg)
{
    long r = fin(sc4(54, fd, req, arg, 0));
    if (fd == i2cfd) {
        char line[96], *p = line; stamp(&p); p = putstr(p, "IOCTL 0x");
        static const char H[] = "0123456789abcdef";
        for (int s = 12; s >= 0; s -= 4) *p++ = H[(req >> s) & 15];
        p = putstr(p, " arg=0x"); *p++ = H[(arg >> 4) & 15]; *p++ = H[arg & 15];
        *p++ = '\n'; emit(line, p - line);
    }
    return (int)r;
}
/* Shell speed: creating /tmp/speed2 or /tmp/speed3 starts es-lcd's own timed speed (as the Home
   fan key 0x66 does), so the screen shows it; removing the file goes back to speed 1. Only acts
   when the files change, so the screen key keeps working. 0x708c0 is the countdown in minutes
   (es-lcd sends req 0c/0d while it is non-zero), 0x708c2 the timer setting, 0x708ca the 0c/0d
   selector. */
#define BST_LEFT U16(0x708c0)
#define BST_MINS U8(0x708c2)
#define BST_SEL U8(0x708ca)
static int shell_spd = 1;

static void shell_speed(void)
{
    int spd = sc4(33, (long)"/tmp/speed3", 0, 0, 0) == 0 ? 3
            : sc4(33, (long)"/tmp/speed2", 0, 0, 0) == 0 ? 2 : 1;
    if (spd == shell_spd) return;
    shell_spd = spd;
    BST_SEL = spd == 3;
    BST_LEFT = spd > 1 ? (BST_MINS ? BST_MINS : 20) : 0;
}

/* Logs every change of the speed countdown and selector, to see what the screen keys do. */
static unsigned bst_last = 0xffffffff;

static void log_bst(void)
{
    unsigned cur = BST_LEFT | BST_SEL << 16 | BST_MINS << 24;
    if (cur == bst_last) return;
    bst_last = cur;
    char line[96], *p = line;
    stamp(&p);
    p = putstr(p, "BST left="); p = putdec(p, BST_LEFT);
    p = putstr(p, " sel="); p = putdec(p, BST_SEL);
    p = putstr(p, " mins="); p = putdec(p, BST_MINS);
    *p++ = '\n';
    emit(line, p - line);
}

/* Shell clock: /tmp/settime holding "HHMMDD" (e.g. 002024) is sent to the MSP430 the way the Set
   time screen does (msp430lib_put_time: 02 00 MM HH DD ~xor), then deleted. Sent just before a
   3-byte request so the i2c fd is pointed at the MSP430. */
static void shell_time(void)
{
    char t[8];
    long fd = sc4(5, (long)"/tmp/settime", 0, 0, 0);
    if (fd < 0) return;
    long n = sc4(3, fd, (long)t, 6, 0);
    sc4(6, fd, 0, 0, 0);
    sc4(10, (long)"/tmp/settime", 0, 0, 0);
    if (n != 6) return;
    for (int i = 0; i < 6; i++) if (t[i] < '0' || t[i] > '9') return;
    unsigned char f[6] = {0x02, 0x00, (t[2] - '0') << 4 | (t[3] - '0'), (t[0] - '0') << 4 | (t[1] - '0'),
                          (t[4] - '0') << 4 | (t[5] - '0'), 0};
    f[5] = ~(f[1] ^ f[2] ^ f[3] ^ f[4]);
    logdata("W", f, 6, sc4(4, i2cfd, (long)f, 6, 0));
}

/* Shell bypass: /tmp/bypass_on forces bypass ON (air skips the heat exchanger) by running the User
   Options override timer 0x1e320; /tmp/bypass_off forces heat recovery by running the Commissioning
   "disable" timer 0x1e31c; with neither file the unit decides from the setpoint (bypass_on wins if
   both exist). byFsa turns a running 0x1e320 into d0 0x80 clear and 0x1e31c into d0 0x08 clear. Like
   the speed files it only acts when the files change, so the screen keys keep working. Outside
   HASSOS mode the timers still run out (12 h and 8 h). /tmp/bypasstemp holding "NN" (15-30 °C) sets
   the setpoint (S0 bits 10-15, sent as d1) and is then deleted. It is not saved to the card, so a
   restart goes back to the stored setpoint. */
#define BYP_OVR U16(0x1e320)
#define BYP_DIS U16(0x1e31c)
#define S0_D1 U8(0x6ab71)
static int shell_byp;

static void shell_bypass(void)
{
    int m = sc4(33, (long)"/tmp/bypass_on", 0, 0, 0) == 0 ? 1
          : sc4(33, (long)"/tmp/bypass_off", 0, 0, 0) == 0 ? 2 : 0;
    if (m != shell_byp) {
        shell_byp = m;
        BYP_OVR = m == 1 ? 720 : 0;
        BYP_DIS = m == 2 ? 480 : 0;
    }
    char t[4];
    long fd = sc4(5, (long)"/tmp/bypasstemp", 0, 0, 0);
    if (fd < 0) return;
    long n = sc4(3, fd, (long)t, 2, 0);
    sc4(6, fd, 0, 0, 0);
    sc4(10, (long)"/tmp/bypasstemp", 0, 0, 0);
    if (n != 2 || t[0] < '0' || t[0] > '9' || t[1] < '0' || t[1] > '9') return;
    int c = (t[0] - '0') * 10 + t[1] - '0';
    if (c >= 15 && c <= 30) S0_D1 = (S0_D1 & 3) | c << 2;
}

/* Shell airflow: /tmp/airflow holding "S1 S2 S3 E1 E2 E3" (supply and extract speed 1/2/3, in %)
   sets the commissioning airflow and is then deleted. 0x708ac holds % << 1 (bit 0 kept) in the
   order S3 E3 S1 S2 E1 E2 and goes out as d5-d10; the Air Flow screens read the % from 0x1e2aa-af.
   A set is ignored unless every value is 1-100. Like the setpoint
   it is not saved to the card, so a restart goes back to the stored values. */
#define AIR U8(0x708ac)
static const unsigned char AIR_IDX[6] = {2, 3, 0, 4, 5, 1};
static const u32 AIR_UI[6] = {0x1e2af, 0x1e2ae, 0x1e2ad, 0x1e2ac, 0x1e2ab, 0x1e2aa};

static void shell_airflow(void)
{
    char t[32];
    int v[6], k = 0, cur = -1;
    long fd = sc4(5, (long)"/tmp/airflow", 0, 0, 0);
    if (fd < 0) return;
    long n = sc4(3, fd, (long)t, sizeof(t) - 1, 0);
    sc4(6, fd, 0, 0, 0);
    sc4(10, (long)"/tmp/airflow", 0, 0, 0);
    for (long i = 0; i < n && k < 6; i++) {
        if (t[i] >= '0' && t[i] <= '9') cur = (cur < 0 ? 0 : cur * 10) + t[i] - '0';
        else if (cur >= 0) { v[k++] = cur; cur = -1; }
        if (cur > 999) return;
    }
    if (cur >= 0 && k < 6) v[k++] = cur;
    if (k != 6) return;
    for (int i = 0; i < 6; i++) if (v[i] < 1 || v[i] > 100) return;
    for (int i = 0; i < 6; i++) {
        volatile unsigned char *b = &AIR + AIR_IDX[i];
        *b = (*b & 1) | v[i] << 1;
        U8(AIR_UI[i]) = v[i];
    }
}

/* Airflow for the shell: /tmp/airflow_state "S1 S2 S3 E1 E2 E3" in %, written when 0x708ac changes. */
static unsigned char air_last[6], air_seen;

static void airflow_state(void)
{
    volatile unsigned char *a = &AIR;
    int same = air_seen;
    for (int i = 0; i < 6; i++) if (air_last[i] != a[i]) same = 0;
    if (same) return;
    for (int i = 0; i < 6; i++) air_last[i] = a[i];
    air_seen = 1;
    char line[40], *p = line;
    for (int i = 0; i < 6; i++) { if (i) *p++ = ' '; p = putdec(p, a[AIR_IDX[i]] >> 1); }
    *p++ = '\n';
    long fd = sc4(5, (long)"/tmp/airflow_state", 0x1 | 0x40 | 0x200, 0644, 0); /* O_WRONLY|O_CREAT|O_TRUNC */
    if (fd >= 0) { sc4(4, fd, (long)line, p - line, 0); sc4(6, fd, 0, 0, 0); }
    char l2[64], *q = l2;
    stamp(&q); q = putstr(q, "AIR "); for (char *s = line; s < p; s++) *q++ = *s;
    emit(l2, q - l2);
}

/* Bypass status for the shell: p9 0x08 set = the unit has the bypass ON. Written to /tmp/bypass_state
   ("1" or "0") only when it changes, from replies with a good checksum and working comms. It is the
   unit's own decision; the damper itself (wax actuator) follows over about a minute. */
static int byp_state = -1;

static void bypass_state(const unsigned char *q)
{
    unsigned char x = 0xff;
    for (int i = 7; i < 15; i++) x ^= q[i];
    if (x != q[15] || (q[8] == 0xff && q[9] == 0xff)) return;
    int s = (q[9] & 0x08) != 0;
    if (s == byp_state) return;
    byp_state = s;
    long fd = sc4(5, (long)"/tmp/bypass_state", 0x1 | 0x40 | 0x200, 0644, 0); /* O_WRONLY|O_CREAT|O_TRUNC */
    if (fd >= 0) { sc4(4, fd, (long)(s ? "1\n" : "0\n"), 2, 0); sc4(6, fd, 0, 0, 0); }
    char line[48], *p = line;
    stamp(&p); p = putstr(p, s ? "BYPASS on\n" : "BYPASS off\n"); emit(line, p - line);
}

/* Sensors for the shell: /tmp/sensors "EXT IN RH SPD P8 P9", written when it changes, from replies
   with a good checksum. EXT = extract-air temp (p5), IN = fresh-air intake temp (p16), both in °C;
   RH = humidity % (p18); "-" when the sensor reports a fault or its check byte is wrong. SPD = the
   running fan speed: 1 unless the unit acknowledges the timed speed (p7 bit 0x20 clear), then 2 or
   3 from es-lcd's 0c/0d selector. p9 bits 1-2 stay at speed 1 while it runs, so they are not used.
   P8/P9 = the raw fault bytes in decimal (active low; both 255 =
   no communications), decoded by the bridge. */
static char sens_last[48];

static char *puttemp(char *p, unsigned char v, unsigned char chk)
{
    int t = v >> 1;
    if (t & 0x40) t -= 128;
    if ((unsigned char)~v != chk || t == -63) { *p++ = '-'; return p; }
    if (t < 0) { *p++ = '-'; t = -t; }
    return putdec(p, t);
}

static void sensors_state(const unsigned char *q)
{
    unsigned char x = 0xff;
    for (int i = 7; i < 15; i++) x ^= q[i];
    if (x != q[15]) return;
    char line[48], *p = line;
    p = puttemp(p, q[5], q[6]); *p++ = ' ';
    p = puttemp(p, q[16], q[17]); *p++ = ' ';
    u32 h = rh(q[18]);
    if (h == 0 || h == 127) *p++ = '-'; else p = putdec(p, h);
    *p++ = ' ';
    *p++ = q[7] & 0x20 ? '1' : BST_SEL ? '3' : '2';
    *p++ = ' '; p = putdec(p, q[8]);
    *p++ = ' '; p = putdec(p, q[9]);
    *p++ = '\n'; *p = 0;
    int same = 1;
    for (int i = 0; i <= p - line; i++) if (sens_last[i] != line[i]) { same = 0; break; }
    if (same) return;
    for (int i = 0; i <= p - line; i++) sens_last[i] = line[i];
    long fd = sc4(5, (long)"/tmp/sensors", 0x1 | 0x40 | 0x200, 0644, 0); /* O_WRONLY|O_CREAT|O_TRUNC */
    if (fd >= 0) { sc4(4, fd, (long)line, p - line, 0); sc4(6, fd, 0, 0, 0); }
    char l2[64], *r = l2;
    stamp(&r); r = putstr(r, "SENS "); for (char *s = line; s < p; s++) *r++ = *s;
    emit(l2, r - l2);
}

/* HASSOS mode ("Controlled by HASSOS"): while /etc/hassos exists es-lcd only follows touches and
   the shell files. es-lcd's own automations are its minute countdowns, which end a mode or a
   timed speed without a touch: 0x1e320 summer bypass override, 0x1e322 holiday, 0x1e324 night,
   0x1e31c summer bypass enable, 0x1e31e frost protection enable (8 h each) and 0x708c0 the speed
   2/3 timer. byFsa takes 1 off each once per MSP430 minute; a drop of exactly 1 is put back, so a
   mode or speed stays until a touch or a shell file changes it. The rising humidity bit (d0 0x40,
   clear = on) is also forced off in the 0x20 frame and both checksums redone, so the MSP430 does
   not go to speed 3 on its own. The flag is on the rootfs (/ is mounted rw, /etc is kept across
   reboots and updates of es-lcd) and is re-read before each 3-byte request. */
#define HASSOS_FLAG "/etc/hassos"
static int hassos = -1;
static const u32 HOLD[6] = {0x1e320, 0x1e322, 0x1e324, 0x1e31c, 0x1e31e, 0x708c0};
static unsigned short held[6];
static unsigned char held_sel;

static void hassos_read(void) { hassos = sc4(33, (long)HASSOS_FLAG, 0, 0, 0) == 0; }

/* For the Settings page: flips the flag, saves it, returns the new state. */
int hassos_toggle(void)
{
    if (hassos_read(), hassos) sc4(10, (long)HASSOS_FLAG, 0, 0, 0);
    else { /* O_WRONLY|O_CREAT|O_TRUNC */
        long fd = sc4(5, (long)HASSOS_FLAG, 0x1 | 0x40 | 0x200, 0644, 0);
        if (fd >= 0) { sc4(4, fd, (long)"1\n", 2, 0); sc4(6, fd, 0, 0, 0); }
    }
    sc4(36, 0, 0, 0, 0);
    hassos_read();
    return hassos;
}
int hassos_get(void) { if (hassos < 0) hassos_read(); return hassos; }

/* restore=0 only takes a new snapshot (after the shell files have changed things). */
static void hassos_hold(int restore)
{
    for (int i = 0; i < 6; i++) {
        unsigned short v = U16(HOLD[i]);
        if (restore && hassos == 1 && held[i] && v == held[i] - 1) {
            U16(HOLD[i]) = v = held[i];
            if (HOLD[i] == 0x708c0) BST_SEL = held_sel; /* byFsa clears it once the timer hits 0 */
        }
        held[i] = v;
    }
    held_sel = BST_SEL;
}

static const void *hassos_frame(const unsigned char *b, unsigned char *o)
{
    volatile unsigned char *v = o;
    if (hassos != 1 || (b[1] & 0x40)) return b;
    for (int i = 0; i < 13; i++) v[i] = b[i];
    v[1] |= 0x40;
    v[5] = ~(v[1] ^ v[2] ^ v[3] ^ v[4]);
    unsigned char x = 0xff;
    for (int i = 1; i < 12; i++) x ^= v[i];
    v[12] = x;
    return o;
}

long write(int fd, const void *buf, unsigned long n)
{
    if (fd == i2cfd) {
        unsigned char tmp[13];
        if (hassos < 0 || n == 3) hassos_read();
        hassos_hold(1);
        shell_speed();
        shell_bypass();
        shell_airflow();
        airflow_state();
        hassos_hold(0);
        log_bst();
        if (n == 3) shell_time();
        if (n == 13 && ((const unsigned char *)buf)[0] == 0x20) buf = hassos_frame(buf, tmp);
        long r = fin(sc4(4, fd, (long)buf, n, 0));
        const unsigned char *b = buf;
        hook();
        if (n == 13 && b[0] == 0x20) { for (int i = 0; i < 13; i++) txf[i] = b[i]; ntx++; }
        else if (n == 3) for (int i = 0; i < 3; i++) rq[i] = b[i];
        logdata("W", buf, n, r);
        return r;
    }
    if (fd == 1 || fd == 2) { /* es-lcd's messages (they go to /dev/null) */
        char line[200], *p = line; const char *s = buf;
        stamp(&p); p = putstr(p, fd == 1 ? "OUT " : "ERR ");
        for (unsigned long i = 0; i < n && i < 150; i++) *p++ = s[i] >= ' ' && s[i] < 127 ? s[i] : '|';
        *p++ = '\n'; emit(line, p - line);
    }
    return fin(sc4(4, fd, (long)buf, n, 0));
}
long read(int fd, void *buf, unsigned long n)
{
    long r = fin(sc4(3, fd, (long)buf, n, 0));
    if (fd == i2cfd) {
        hook();
        if (r == 28) {
            for (int i = 0; i < 28; i++) rx[i] = ((unsigned char *)buf)[i];
            nrx++; t_rx = nowsec();
            bypass_state(rx + 8);
            sensors_state(rx + 8);
            for (int k = 0; k < 3; k++)
                if (rq[1] == REQS[k]) { /* volatile keeps the compiler from emitting a memcpy import */
                    volatile unsigned char *o = rxk[k];
                    for (int i = 0; i < 28; i++) o[i] = rx[i];
                    nk[k]++; tk[k] = t_rx;
                }
        }
        logdata("R", buf, r > 0 ? r : 0, r);
    }
    return r;
}
