import { readFileSync, writeFileSync } from 'node:fs';
import { campaignSaveRecord } from '../../src/gui/campaign/CampaignSaveLibrary';

const [checkpointPath, outputPath] = process.argv.slice(2);
const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
const record = await campaignSaveRecord(checkpoint, 'Original fullscreen persistence probe');
writeFileSync(outputPath, JSON.stringify(record) + '\n', { flag: 'wx' });
