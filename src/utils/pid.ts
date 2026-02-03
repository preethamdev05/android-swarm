import { existsSync, readFileSync, unlinkSync } from 'fs';

export type PidInspectionStatus = 'missing' | 'active' | 'stale' | 'invalid';

export interface PidInspection {
  status: PidInspectionStatus;
  pid?: number;
}

export function inspectPidFile(pidFilePath: string): PidInspection {
  if (!existsSync(pidFilePath)) {
    return { status: 'missing' };
  }

  const pidRaw = readFileSync(pidFilePath, 'utf8').trim();
  const pid = Number.parseInt(pidRaw, 10);

  if (!Number.isFinite(pid)) {
    return { status: 'invalid' };
  }

  try {
    process.kill(pid, 0);
    return { status: 'active', pid };
  } catch (err: any) {
    if (err?.code === 'ESRCH') {
      return { status: 'stale', pid };
    }
    if (err?.code === 'EPERM') {
      return { status: 'active', pid };
    }
    throw err;
  }
}

export function cleanupStalePidFile(pidFilePath: string): PidInspection {
  const inspection = inspectPidFile(pidFilePath);

  if (inspection.status === 'stale' || inspection.status === 'invalid') {
    try {
      unlinkSync(pidFilePath);
    } catch {
      // Best-effort cleanup
    }
  }

  return inspection;
}

export function ensureNoActivePid(pidFilePath: string): void {
  const inspection = cleanupStalePidFile(pidFilePath);

  if (inspection.status === 'active') {
    throw new Error(`Another task is running (PID ${inspection.pid})`);
  }
}
