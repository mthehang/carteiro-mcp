import { createHash } from 'node:crypto';
import type { Repository } from '../db/repository.js';
import { logger } from '../logger.js';

export function hashParams(params: unknown): string {
  const json = JSON.stringify(params ?? {});
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

export async function withAudit<T>(
  repo: Repository,
  toolName: string,
  params: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const paramsHash = hashParams(params);
  try {
    const result = await fn();
    repo.recordAudit({
      toolName,
      paramsHash,
      result: 'ok',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    repo.recordAudit({
      toolName,
      paramsHash,
      result: 'error',
      errorMessage: message,
      durationMs: Date.now() - start,
    });
    logger.warn({ tool: toolName, err: message }, '[audit] tool falhou');
    throw err;
  }
}
