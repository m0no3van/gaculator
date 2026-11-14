// GPL-3.0-or-later. Browser adapter for the vendored Firebird core.
#include <cerrno>
#include <cstdio>
#include <emscripten.h>
#include "core/emu.h"
#include "core/debug.h"
#include "core/mmu.h"
#include "core/mem.h"
#include "core/keypad.h"
#include "core/lcd.h"
#include "core/misc.h"
#include "core/schedule.h"
#include "core/gif.h"

static unsigned int ticks;
static void browser_tick(int index) {
    ++ticks;
    event_repeat(index, 27000000 / 100);
}

void gui_do_stuff(bool) {}
void gui_debug_vprintf(const char *fmt, va_list ap) { vprintf(fmt, ap); }
void gui_debug_printf(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt); gui_debug_vprintf(fmt, ap); va_end(ap);
}
void gui_status_printf(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt); gui_debug_vprintf(fmt, ap); va_end(ap);
}
void gui_perror(const char *msg) { gui_debug_printf("%s: %s\n", msg, strerror(errno)); }
void gui_debugger_entered_or_left(bool) {}
void gui_debugger_request_input(debug_input_cb callback) { if (callback) abort(); }
void gui_putchar(char c) { putc(c, stdout); }
int gui_getchar() { return -1; }
void gui_set_busy(bool) {}
void gui_show_speed(double) {}
void gui_usblink_changed(bool) {}
void throttle_timer_off() {}
void throttle_timer_on() {}
void throttle_timer_wait(unsigned int) {}

// GIF recording is not part of this frontend; PNG export uses its real framebuffer.
bool gif_start_recording(const char *, unsigned int) { return false; }
void gif_new_frame() {}
bool gif_stop_recording() { return false; }

extern "C" {
EMSCRIPTEN_KEEPALIVE int fb_start(int resume) {
    path_boot1 = "boot1.img";
    path_flash = "flash.img";
    do_translate = false;
    turbo_mode = true;
    if (!emu_start(0, 0, resume ? "state.snap" : nullptr)) return 0;
    sched.items[SCHED_THROTTLE].proc = browser_tick;
    addr_cache_flush();
    sched_update_next_event(0);
    exiting = false;
    return 1;
}

EMSCRIPTEN_KEEPALIVE int fb_step(double budget_ms) {
    const double end = emscripten_get_now() + budget_ms;
    const unsigned int start_ticks = ticks;
    do {
        sched_process_pending_events();
        while (!exiting && cycle_count_delta < 0) {
            // A reset/fault ends this Worker; the last committed save remains intact.
            if (cpu_events & EVENT_RESET) return 0;
            if (cpu_events & EVENT_SLEEP) { cycle_count_delta = 0; break; }
            if (cpu_events & (EVENT_FIQ | EVENT_IRQ)) {
                arm.reg[15] &= (arm.cpsr_low28 & 0x20) ? ~1u : ~3u;
                if (cpu_events & EVENT_WAITING) arm.reg[15] += 4;
                arm.reg[15] += 4;
                cpu_exception((cpu_events & EVENT_FIQ) ? EX_FIQ : EX_IRQ);
            }
            cpu_events &= ~EVENT_WAITING;
            if (arm.cpsr_low28 & 0x20) cpu_thumb_loop();
            else cpu_arm_loop();
        }
    } while (!exiting && ticks - start_ticks < 2 && emscripten_get_now() < end);
    // Keep the foreground calculator awake without synthesizing a Home keypress.
    if (hdq1w.lcd_contrast == 0 && pmu.on_irq_enabled) keypad_on_pressed();
    return !exiting;
}

EMSCRIPTEN_KEEPALIVE void fb_key(int id, int down) {
    if (id >= 0 && id < KEYPAD_ROWS * KEYPAD_COLS)
        keypad_set_key(id / KEYPAD_COLS, id % KEYPAD_COLS, down != 0);
}
EMSCRIPTEN_KEEPALIVE void fb_touch(float x, float y, int contact, int down) {
    touchpad_set_state(x, y, contact != 0, down != 0);
}
EMSCRIPTEN_KEEPALIVE void fb_release() {
    for (int row = 0; row < KEYPAD_ROWS; ++row)
        for (int col = 0; col < KEYPAD_COLS; ++col) keypad_set_key(row, col, false);
    touchpad_set_state(0.5f, 0.5f, false, false);
}
EMSCRIPTEN_KEEPALIVE int fb_save() { return emu_suspend("state.snap"); }
EMSCRIPTEN_KEEPALIVE unsigned int fb_ticks() { return ticks; }
EMSCRIPTEN_KEEPALIVE void fb_paint(uint8_t *dest) {
    static uint16_t pixels[320 * 240];
    lcd_cx_draw_frame(pixels);
    for (unsigned int i = 0; i < 320 * 240; ++i) {
        const uint16_t p = pixels[i];
        const uint8_t r = p >> 11, g = (p >> 5) & 63, b = p & 31;
        *dest++ = (r << 3) | (r >> 2);
        *dest++ = (g << 2) | (g >> 4);
        *dest++ = (b << 3) | (b >> 2);
        *dest++ = 255;
    }
}
}
