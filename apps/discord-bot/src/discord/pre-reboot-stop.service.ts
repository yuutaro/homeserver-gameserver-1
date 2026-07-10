import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GameServerManager } from './game-server-manager.service.js';

type HhMm = { hour: number; minute: number };

@Injectable()
export class PreRebootStopService implements OnModuleInit {
  private readonly logger = new Logger(PreRebootStopService.name);
  private stopTimer: NodeJS.Timeout | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunDateJst: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly gameServers: GameServerManager,
  ) {}

  async onModuleInit() {
    const enabled = (this.config.get<string>('PRE_REBOOT_STOP_ENABLED') ?? '').toLowerCase();
    if (!(enabled === 'true' || enabled === '1' || enabled === 'yes')) {
      this.logger.log('Pre-reboot stop is disabled (set PRE_REBOOT_STOP_ENABLED=true to enable)');
      return;
    }

    const timeStr = this.config.get<string>('PRE_REBOOT_STOP_TIME_JST') ?? '08:55';
    const graceMinutes = Number(this.config.get<string>('PRE_REBOOT_STOP_GRACE_MINUTES') ?? '30');
    const announceEnabled = (this.config.get<string>('PRE_REBOOT_ANNOUNCE_ENABLED') ?? 'true').toLowerCase();
    const announceMinutesBefore = Number(this.config.get<string>('PRE_REBOOT_ANNOUNCE_MINUTES_BEFORE') ?? '5');
    const countdownSeconds = Number(this.config.get<string>('PRE_REBOOT_COUNTDOWN_SECONDS') ?? '30');

    const hhmm = parseHhMm(timeStr);
    if (!hhmm) {
      this.logger.warn(`Invalid PRE_REBOOT_STOP_TIME_JST: ${timeStr} (expected HH:MM). Disabling scheduler.`);
      return;
    }

    this.logger.log(
      `Pre-reboot stop enabled: daily at ${pad2(hhmm.hour)}:${pad2(hhmm.minute)} JST (grace ${graceMinutes} min)`,
    );

    const now = new Date();
    const today = formatJstDate(now);
    const scheduledUtcToday = toUtcFromJstToday(hhmm, now);
    const lateMs = now.getTime() - scheduledUtcToday.getTime();
    if (lateMs >= 0 && lateMs <= Math.max(0, graceMinutes) * 60_000 && this.lastRunDateJst !== today) {
      this.logger.warn('Bot started after scheduled stop time; running catch-up stop once');
      await this.stopOnce(today);
    }

    this.scheduleNext(hhmm, {
      announceEnabled: announceEnabled === 'true' || announceEnabled === '1' || announceEnabled === 'yes',
      announceMinutesBefore: clampInt(announceMinutesBefore, 0, 60),
      countdownSeconds: clampInt(countdownSeconds, 0, 60),
    });
  }

  private scheduleNext(
    hhmm: HhMm,
    announce: { announceEnabled: boolean; announceMinutesBefore: number; countdownSeconds: number },
  ) {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    if (this.announceTimer) clearTimeout(this.announceTimer);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    const now = new Date();
    const nextUtc = toNextUtcFromJst(hhmm, now);
    const delay = Math.max(1_000, nextUtc.getTime() - now.getTime());
    this.logger.log(`Next pre-reboot stop scheduled at ${nextUtc.toISOString()} (UTC)`);

    if (announce.announceEnabled) {
      const announceAt = new Date(nextUtc.getTime() - announce.announceMinutesBefore * 60_000);
      const announceDelay = announceAt.getTime() - now.getTime();
      if (announceDelay > 1_000) {
        this.announceTimer = setTimeout(async () => {
          try {
            await this.announceUpcomingStop(announce.announceMinutesBefore);
          } catch (error) {
            this.logger.warn(`Failed to announce upcoming stop: ${String(error)}`);
          }
        }, announceDelay);
      }

      const countdownAt = new Date(nextUtc.getTime() - announce.countdownSeconds * 1000);
      const countdownDelay = countdownAt.getTime() - now.getTime();
      if (announce.countdownSeconds > 0 && countdownDelay > 1_000) {
        this.countdownTimer = setTimeout(async () => {
          try {
            await this.countdownStop(announce.countdownSeconds);
          } catch (error) {
            this.logger.warn(`Failed to run countdown: ${String(error)}`);
          }
        }, countdownDelay);
      }
    }

    this.stopTimer = setTimeout(async () => {
      try {
        await this.stopOnce(formatJstDate(new Date()));
      } finally {
        this.scheduleNext(hhmm, announce);
      }
    }, delay);
  }

  private async announceUpcomingStop(minutesBefore: number) {
    const active = await this.gameServers.getActiveServerName();
    if (!active || minutesBefore <= 0) return;
    await this.gameServers.announce(`サーバーは ${minutesBefore} 分後に再起動のため停止します。`, active);
  }

  private async countdownStop(seconds: number) {
    const active = await this.gameServers.getActiveServerName();
    if (!active || seconds <= 0) return;
    for (let i = seconds; i >= 1; i -= 1) {
      await this.gameServers.announce(`サーバー停止まで ${i} 秒...`, active);
      await sleep(1000);
    }
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
      const active = await this.gameServers.getActiveServerName();
      if (!active) {
        this.logger.log('No active server; nothing to stop');
        this.lastRunDateJst = todayJst;
        return;
      }
      this.logger.warn(`Stopping server before reboot: ${active}`);
      try {
        await this.gameServers.stopGracefully(active);
      } catch (error) {
        this.logger.warn(`Graceful stop failed; falling back to docker stop/remove: ${String(error)}`);
      }
      await this.gameServers.stopAndRemoveIfExists();
      this.lastRunDateJst = todayJst;
      this.logger.warn(`Stopped server before reboot: ${active}`);
    } finally {
      this.running = false;
    }
  }
}

function parseHhMm(value: string): HhMm | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatJstDate(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60_000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
}

function toUtcFromJstToday(hhmm: HhMm, now: Date): Date {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60_000);
  const jstMillis = Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate(),
    hhmm.hour,
    hhmm.minute,
    0,
  );
  return new Date(jstMillis - 9 * 60 * 60_000);
}

function toNextUtcFromJst(hhmm: HhMm, now: Date): Date {
  const todayUtc = toUtcFromJstToday(hhmm, now);
  if (todayUtc.getTime() > now.getTime()) return todayUtc;
  return new Date(todayUtc.getTime() + 24 * 60 * 60_000);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
