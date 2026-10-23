/* LD_PRELOAD shim: logs traffic on /dev/i2c/0 (open/ioctl/read/write). Freestanding, raw EABI syscalls. */
typedef unsigned int u32;
typedef long ssize_t_;
#define MAXLOG (3u * 1024 * 1024)

extern int *__errno_location(void);

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

static void emit(const char *s, int n)
{
    if (logfd == -2) /* O_WRONLY|O_CREAT|O_APPEND */
        logfd = (int)sc4(5, (long)"/i2clog.txt", 0x1 | 0x40 | 0x400, 0644, 0);
    if (logfd < 0 || logged > MAXLOG) return;
    if (lused + n > sizeof(lbuf)) flush(0);
    for (int i = 0; i < n; i++) lbuf[lused + i] = s[i];
    lused += n;
    logged += n;
    if (now_sec - last_flush >= 1 || lused > 12000) flush(0);
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
    /* p8/p9 fault bits are active when clear; p9 bits 1-2 give the running speed */
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
    p = putstr(p, "% Frost "); p = putdec(p, d[3] >> 4); line(13, p, b, 0xff);
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
static int etr_maint(int a, int b, int c, int d) { dbg = 0; return ((f_etr)ETR_MAINT)(a, b, c, d); }

static void hook(void)
{
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
long write(int fd, const void *buf, unsigned long n)
{
    if (fd == i2cfd) {
        long r = fin(sc4(4, fd, (long)buf, n, 0));
        const unsigned char *b = buf;
        hook();
        if (n == 13 && b[0] == 0x20) { for (int i = 0; i < 13; i++) txf[i] = b[i]; ntx++; }
        else if (n == 3) for (int i = 0; i < 3; i++) rq[i] = b[i];
        logdata("W", buf, n, r);
        return r;
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
