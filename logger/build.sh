#!/bin/sh
# Builds i2clog.so for the VSC (ARM926EJ-S, glibc EABI). Needs zig (0.17 tested).
# Freestanding on purpose, with no imports at all: the unit's ld-2.3.3 never binds
# a preloaded lld PLT, so errno goes through es-lcd's own GOT (see i2clog.c).
zig cc -target arm-linux-gnueabi -mcpu=arm926ej_s -Os -fPIC -shared -nostdlib \
    -ffreestanding -fno-builtin -fno-stack-protector \
    -fno-unwind-tables -fno-asynchronous-unwind-tables -Wl,-z,norelro \
    -o i2clog.so i2clog.c
