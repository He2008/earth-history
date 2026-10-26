// D4 日志约定实现(docs/LOGGING.md):一行一事件 JSON 到 stdout
// 分工:DB=事实来源,stdout=运维窗口,SSE=实时 UI(不留存)
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;
export type LogLine = { ts: number; level: LogLevel; event: string } & LogFields;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: number = Number.POSITIVE_INFINITY; // NODE_ENV=test 静默;测试经 __captureLogsForTests 放开
let sink: ((line: string) => void) | null = null;

if (process.env.NODE_ENV !== 'test') {
  const env = process.env.SHIDI_LOG_LEVEL as LogLevel | undefined;
  threshold = env && env in ORDER ? ORDER[env] : ORDER.info;
  sink = (line) => { try { process.stdout.write(line + '\n'); } catch { /* stdout 不可写时静默 */ } };
}

function write(level: LogLevel, event: string, fields: LogFields): void {
  if (!sink || ORDER[level] < threshold) return;
  sink(JSON.stringify({ ts: Date.now(), level, event, ...fields }));
}

export const log = {
  debug: (event: string, fields: LogFields = {}): void => write('debug', event, fields),
  info: (event: string, fields: LogFields = {}): void => write('info', event, fields),
  warn: (event: string, fields: LogFields = {}): void => write('warn', event, fields),
  error: (event: string, fields: LogFields = {}): void => write('error', event, fields),
};

/** 测试注入:放开到指定级别并捕获解析后的行;restore() 恢复 */
export function __captureLogsForTests(minLevel: LogLevel = 'debug'): { lines: LogLine[]; restore: () => void } {
  const lines: LogLine[] = [];
  const prevSink = sink, prevThreshold = threshold;
  sink = (line) => { lines.push(JSON.parse(line) as LogLine); };
  threshold = ORDER[minLevel];
  return { lines, restore: () => { sink = prevSink; threshold = prevThreshold; } };
}
