import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinecraftContainerService } from './minecraft-container.service.js';
import { MinecraftRconService } from './minecraft-rcon.service.js';

type HhMm = { hour: number; minute: number };

@Injectable()
export class PreRebootStopService implements OnModuleInit {
  private readonly logger = new Logger(PreRebootStopService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunDateJst: string | null = null; // YYYY-MM-DD

  constructor(
    private readonly config: ConfigService,
    private readonly containers: MinecraftContainerService,
    private readonly rcon: MinecraftRconService,
  ) {}

  async onModuleInit() {
    const enabled = (this.config.get<string>('PRE_REBOOT_STOP_ENABLED') ?? '').toLowerCase();
    if (!(enabled === 'true' || enabled === '1' || enabled === 'yes')) {
      this.logger.log('Pre-reboot stop is disabled (set PRE_REBOOT_STOP_ENABLED=true to enable)');
      return;
    }

    const timeStr = this.config.get<string>('PRE_REBOOT_STOP_TIME_JST') ?? '08:55';
    const graceMinutes = Number(this.config.get<string>('PRE_REBOOT_STOP_GRACE_MINUTES') ?? '30');

    const hhmm = parseHhMm(timeStr);
    if (!hhmm) {
      this.logger.warn(`Invalid PRE_REBOOT_STOP_TIME_JST: ${timeStr} (expected HH:MM). Disabling scheduler.`);
      return;
    }

    this.logger.log(
      `Pre-reboot stop enabled: daily at ${pad2(hhmm.hour)}:${pad2(hhmm.minute)} JST (grace ${graceMinutes} min)`,
    );

    // If the bot restarted after the scheduled time, optionally do a catch-up within a small window.
    const now = new Date();
    const today = formatJstDate(now);
    const scheduledUtcToday = toUtcFromJstToday(hhmm, now);
    const lateMs = now.getTime() - scheduledUtcToday.getTime();
    if (lateMs >= 0 && lateMs <= Math.max(0, graceMinutes) * 60_000 && this.lastRunDateJst !== today) {
      this.logger.warn('Bot started after scheduled stop time; running catch-up stop once');
      await this.stopOnce(today);
    }

    this.scheduleNext(hhmm);
  }

  private scheduleNext(hhmm: HhMm) {
    if (this.timer) clearTimeout(this.timer);
    const now = new Date();
    const nextUtc = toNextUtcFromJst(hhmm, now);
    const delay = Math.max(1_000, nextUtc.getTime() - now.getTime());
    this.logger.log(`Next pre-reboot stop scheduled at ${nextUtc.toISOString()} (UTC)`);
    this.timer = setTimeout(async () => {
      try {
        await this.stopOnce(formatJstDate(new Date()));
      } finally {
        this.scheduleNext(hhmm);
      }
    }, delay);
  }

  private async stopOnce(todayJst: string) {
    if (this.running) {
      this.logger.warn('Pre-reboot stop already running; skipping');
      return;
    }
    if (this.lastRunDateJst === todayJst) {
      this.logger.log(`Pre-reboot stop already executed today (${todayJst}); skipping`);
      return;
    }

    this.running = true;
    try {
      const active = await this.containers.getActiveServerName();
      if (!active) {
        this.logger.log('No active server; nothing to stop');
        this.lastRunDateJst = todayJst;
        return;
      }

      this.logger.warn(`Stopping server before reboot: ${active}`);
      try {
        await this.rcon.stopGracefully(active);
      } catch (e) {
        this.logger.warn(`RCON graceful stop failed; falling back to docker stop/remove: ${String(e)}`);
      }
      await this.containers.stopAndRemoveIfExists();
      this.lastRunDateJst = todayJst;
      this.logger.warn(`Stopped server before reboot: ${active}`);
    } finally {
      this.running = false;
    }
  }
}

function parseHhMm(v: string): HhMm | null {
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatJstDate(now: Date): string {
  // JST is fixed UTC+09:00 (no DST).
  const jst = new Date(now.getTime() + 9 * 60 * 60_000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
}

function toUtcFromJstToday(hhmm: HhMm, now: Date): Date {
  // Convert "today in JST at HH:MM" to a UTC Date.
  const jstNow = new Date(now.getTime() + 9 * 60 * 60_000);
  const y = jstNow.getUTCFullYear();
  const mo = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  const jstMillis = Date.UTC(y, mo, d, hhmm.hour, hhmm.minute, 0);
  return new Date(jstMillis - 9 * 60 * 60_000);
}

function toNextUtcFromJst(hhmm: HhMm, now: Date): Date {
  const todayUtc = toUtcFromJstToday(hhmm, now);
  if (todayUtc.getTime() > now.getTime()) return todayUtc;
  return new Date(todayUtc.getTime() + 24 * 60 * 60_000);
}

