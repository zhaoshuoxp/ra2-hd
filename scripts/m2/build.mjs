import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const output = path.resolve(process.argv[2]);
execFileSync(process.execPath, ['scripts/editions/build-review.mjs', output], { stdio: 'inherit' });
const metadataFile = path.join(output, 'package.json');
const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
const showcase = process.argv.includes('--showcase');
const coverage = process.argv.includes('--official-temperate');
metadata.reviewMilestone = coverage ? 'M2.3-TEMPERATE' : showcase ? 'M2.2-TEMPERATE' : 'M2.1-TEMPERATE';
await fs.writeFile(metadataFile, JSON.stringify(metadata));
const identityFile = path.join(output, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
identity.files.find(entry => entry.file === 'package.json').sha256 = createHash('sha256')
    .update(await fs.readFile(metadataFile)).digest('hex');
identity.artStatus = coverage ? 'M2_3_COVERAGE_PRODUCTION_RUNTIME_AND_VISUAL_REVIEW_PENDING'
    : showcase ? 'M2_2_INCREMENTAL_PRODUCTION_RUNTIME_REVIEW_PENDING'
    : process.argv.includes('--integrated-baseline')
    ? 'ACCEPTED_M2_1_INTEGRATION_TECHNICAL_REVIEW_PENDING'
    : 'M2_1_DIRECTION_ACCEPTED_COMPLETE_PRODUCTION_VISUAL_REVIEW_PENDING';
identity.gameplayStatus = 'MAP_AND_RULES_UNCHANGED_NATIVE_REVIEW_REQUIRED';
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2) + '\n');
