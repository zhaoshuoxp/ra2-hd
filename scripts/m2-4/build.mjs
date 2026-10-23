import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const output = path.resolve(process.argv[2]);
execFileSync(process.execPath, ['scripts/editions/build-review.mjs', output], { stdio: 'inherit' });
const file = path.join(output, 'package.json');
const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
metadata.reviewMilestone = 'M2.4-SKIRMISH';
metadata.version = '0.2.0';
await fs.writeFile(file, JSON.stringify(metadata));
const identityFile = path.join(output, 'identity.json');
const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
metadata.sourceHead = identity.head;
await fs.writeFile(file, JSON.stringify(metadata));
identity.files.find(entry => entry.file === 'package.json').sha256 = createHash('sha256')
    .update(await fs.readFile(file)).digest('hex');
identity.artStatus = 'FIVE_THEATER_ART_ACCEPTED_THROUGH_BATCH98_RESULT_R5_AND_HOVER_USER_ACCEPTED';
identity.gameplayStatus = 'ORIGINAL_PKT_CATALOGS_62_RA2_151_YR_UNIFIED_SKIRMISH_ARCHIVE_EXTRAS_HIDDEN';
identity.releaseVersion = 'v0.2';
await fs.writeFile(identityFile, JSON.stringify(identity, null, 2) + '\n');
