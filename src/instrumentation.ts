export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getRepo } = await import('@/server/db/repo');
  getRepo().sweepStaleTasks();
  const { registry } = await import('@/server/orchestrator/machine');
  const shutdown = () => {
    registry.abortAll();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
