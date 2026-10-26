import type { ResearchInput } from '@/lib/types';
import { startResearch } from './pipeline';

export interface Runner {
  start(input: ResearchInput): Promise<{ taskId: string; cached: boolean }>;
}

let current: Runner = { start: startResearch };

export function getRunner(): Runner { return current; }
export function setRunner(r: Runner): void { current = r; }
