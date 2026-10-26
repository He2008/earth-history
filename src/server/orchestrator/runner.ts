import type { ResearchInput } from '@/lib/types';
import { startResearch } from './pipeline';

export interface Runner {
  start(input: ResearchInput, onCreated?: (taskId: string) => void): Promise<{ taskId: string; cached: boolean }>;
}

let current: Runner = { start: (input, onCreated) => startResearch(input, undefined, onCreated) };

export function getRunner(): Runner { return current; }
export function setRunner(r: Runner): void { current = r; }
