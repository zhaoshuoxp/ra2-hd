import { NativeCampaignPilot } from './native-pilot.mjs';
import { completeAllied04Victory } from './allied04-victory-flow.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all04dmd.map');
let failure;
try { await pilot.open(); await completeAllied04Victory(pilot); }
catch (error) { failure = error; }
await pilot.finish(failure);
