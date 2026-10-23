// Build and package a uniquely named normal Mac app with independent resources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2]);
const revision = process.argv[3] ?? 'R4';
if (!/^R\d+$/.test(revision)) throw Error('Use a plain revision');
await fs.mkdir(output, { recursive: false });
const build = path.join(output, 'build');
execFileSync(process.execPath, ['scripts/ui/build-review.mjs', build], { stdio: 'inherit' });
const metadata = JSON.parse(await fs.readFile(path.join(build, 'package.json')));
Object.assign(metadata, { reviewMilestone: 'M2.3-TEMPERATE', taskReview: `NATIVE-BUILDUP-ART-${revision}` });
const bytes = Buffer.from(JSON.stringify(metadata));
await fs.writeFile(path.join(build, 'package.json'), bytes);
const identityFile = path.join(build, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile));
identity.sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
identity.artStatus = 'NATIVE_PHASE_REPAIR_USER_VISUAL_ACCEPTANCE_PENDING';
identity.files.find(row => row.file === 'package.json').sha256 = createHash('sha256').update(bytes).digest('hex');
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2) + '\n');
execFileSync(process.execPath, ['scripts/editions/package-mac-test.mjs', build, path.join(output, 'package'),
    `RA2-HD-Native-Buildup-Art-${revision}-Mac`, '--require-prepared',
    `--app-title=Red Alert 2 HD Native Buildup Art ${revision}`], { stdio: 'inherit' });
