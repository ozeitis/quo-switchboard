import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const files = (await readdir('release')).filter(file => /\.(dmg|zip)$/.test(file)).sort();
if (!files.length) throw new Error('No release archives found');
const checksums = await Promise.all(files.map(async file => `${createHash('sha256').update(await readFile(join('release', file))).digest('hex')}  ${file}`));
await writeFile('release/SHA256SUMS', checksums.join('\n') + '\n');
