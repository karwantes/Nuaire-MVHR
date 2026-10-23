#!/bin/sh
# Builds i2clog.so for the VSC (ARM926EJ-S, glibc EABI). Needs zig (0.17 tested).
# Freestanding on purpose: the only import is __errno_location.
zig cc -target arm-linux-gnueabi -mcpu=arm926ej_s -Os -fPIC -shared -nostdlib \
    -ffreestanding -fno-builtin -fno-stack-protector \
    -fno-unwind-tables -fno-asynchronous-unwind-tables -Wl,-z,norelro \
    -o i2clog.so i2clog.c
