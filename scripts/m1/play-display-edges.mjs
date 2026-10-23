// Explicit opt-in; the standard launcher continues to use the original renderer.
process.env.M14_EDGE_PLAY = '1';
process.env.M14_EDGE_OUTPUT = '';
process.env.M14_FIDELITY_OUTPUT = '';
console.log('M1.4 A/B/C experiment: use the overlay buttons or Alt+1 / Alt+2 / Alt+3.');
console.log('Compare 1080p and High output. A remains the default; no alternative is approved.');
await import('./play-display-review.mjs');
