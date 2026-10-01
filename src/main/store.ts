import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyConfig, parseConfig, type Config } from '../shared/model';

export class Store {
  readonly path: string;
  value: Config;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'workspaces.json');
    this.value = existsSync(this.path) ? parseConfig(JSON.parse(readFileSync(this.path, 'utf8'))) : emptyConfig();
  }
  save(next: Config): void {
    const validated = parseConfig(next);
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(validated, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporary, this.path);
    this.value = validated;
  }
}
