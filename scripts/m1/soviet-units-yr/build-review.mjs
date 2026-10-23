import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const output = path.resolve(process.argv[2]);
execFileSync(process.execPath, ['scripts/ui/build-review.mjs', output], { stdio: 'inherit' });
const file = path.join(output, 'package.json');
const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
Object.assign(metadata, { version: '0.2.5', reviewMilestone: 'M1.7-YR-R1' });
await fs.writeFile(file, JSON.stringify(metadata));
const identityFile = path.join(output, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
identity.files.find(f => f.file === 'package.json').sha256 = createHash('sha256').update(await fs.readFile(file)).digest('hex');
identity.artStatus = 'YR_UNIT_REPRESENTATIVES_ACCEPTED_COMPLETE_FAMILY_REVIEW_PENDING';
identity.gameplayStatus = 'NATIVE_VALIDATION_REQUIRED_FOR_THIS_BUILD';
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2));
