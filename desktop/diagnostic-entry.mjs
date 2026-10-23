if (process.env.RA2_HD_DIAGNOSTIC === '1') await import('./windows-diagnostic.mjs');
else await import('./editions-portable.mjs');
