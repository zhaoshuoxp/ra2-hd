// Reuse the accepted isolated build; bind the exact Task D metadata and content.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
execFileSync(process.execPath, ['scripts/ui/build-review.mjs', output], { stdio: 'inherit' });
const metadataFile = path.join(output, 'package.json');
const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
Object.assign(metadata, { version: '0.3.0', reviewMilestone: 'YURI-UNITS-D-R1' });
await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
const identityFile = path.join(output, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
identity.files.find(f => f.file === 'package.json').sha256 = createHash('sha256')
    .update(await fs.readFile(metadataFile)).digest('hex');
Object.assign(identity, { task: 'D', artStatus: 'REPRESENTATIVE_ACCEPTED_COMPLETE_RESOURCES',
    gameplayStatus: 'RUNTIME_VALIDATION_PENDING', branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
    baseMain: 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1' });
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2) + '\n');
