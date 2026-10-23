// Build an immutable review payload without touching dist or retained deliveries.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (!process.argv[2]) throw new Error('Provide a new output directory');
const output = path.resolve(process.argv[2]);
execFileSync(process.execPath, ['scripts/editions/build-review.mjs', output], { stdio: 'inherit' });
const file = path.join(output, 'package.json');
const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
Object.assign(metadata, { version: '0.2.4', reviewMilestone: 'M1.6C' });
await fs.writeFile(file, JSON.stringify(metadata));
const identityFile = path.join(output, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
identity.files.find(entry => entry.file === 'package.json').sha256 =
    createHash('sha256').update(await fs.readFile(file)).digest('hex');
identity.artStatus = 'REPRESENTATIVES_ACCEPTED_FINAL_VISUAL_GAMEPLAY_REVIEW_PENDING';
identity.gameplayStatus = 'SOURCE_NATIVE_MATRIX_PASS_PACKAGED_VALIDATION_PENDING';
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2) + '\n');
