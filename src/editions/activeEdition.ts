import { isGameEdition, type GameEdition } from './GameEdition';

// An edition is immutable for the document lifetime. Switching reloads the page,
// disposing VFS mounts, renderer resources, audio and simulation state together.
const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('edition');
export const activeEdition: GameEdition = isGameEdition(requested) ? requested : 'ra2';
export const hasEditionSelection = isGameEdition(requested);
