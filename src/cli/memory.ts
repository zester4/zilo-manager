import type { LongTermMemory } from '../memory/long-term.js';
import { printTable } from './format.js';

export function printMemoryTable(memories: LongTermMemory[]) {
  if (memories.length === 0) {
    console.log('No memories yet. Add one with: zilmate remember "..."');
    return;
  }
  printTable(['ID', 'Tags', 'Updated', 'Memory'], memories.map((memory) => [
    memory.id,
    memory.tags.join(', ') || '-',
    memory.updatedAt,
    memory.text,
  ]));
}
