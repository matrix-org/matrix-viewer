import assert from 'matrix-viewer-shared/lib/assert.js';
import MatrixViewerURLCreator from 'matrix-viewer-shared/lib/url-creator.js';
import redirectIfRoomAliasInHash from 'matrix-viewer-shared/lib/redirect-if-room-alias-in-hash.js';

// Assets
import 'hydrogen-view-sdk/assets/theme-element-light.css';
import '../css/styles.css';

const config = window.matrixViewerContext.config;
assert(config);
assert(config.basePath);

const matrixViewerURLCreator = new MatrixViewerURLCreator(config.basePath);

console.log(`Trying to redirect based on pageHash=${window.location.hash}`);
const isRedirecting = redirectIfRoomAliasInHash(matrixViewerURLCreator);

// Show the message while we're trying to redirect or if we found nothing, remove the
// message
document.querySelector('.js-try-redirect-message').style.display = isRedirecting
  ? 'inline'
  : 'none';
