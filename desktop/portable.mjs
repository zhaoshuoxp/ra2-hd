import path from 'node:path';

// The Windows folder build keeps its own writable profile beside the executable.
process.env.RA2_DESKTOP_USER_DATA ||= path.join(path.dirname(process.execPath), 'UserData');
await import('./main.mjs');
