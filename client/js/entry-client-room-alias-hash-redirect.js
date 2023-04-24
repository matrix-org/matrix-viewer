import assert from 'matrix-public-archive-shared/lib/assert';
import MatrixPublicArchiveURLCreator from 'matrix-public-archive-shared/lib/url-creator';
import redirectIfRoomAliasInHash from 'matrix-public-archive-shared/lib/redirect-if-room-alias-in-hash';

// Assets
import 'hydrogen-view-sdk/assets/theme-element-light.css';
import '../css/styles.css';

const config = window.matrixPublicArchiveContext.config;
assert(config);
assert(config.basePath);

const matrixPublicArchiveURLCreator = new MatrixPublicArchiveURLCreator(config.basePath);

console.log(`Trying to redirect based on pageHash=${window.location.hash}`);
const isRedirecting = redirectIfRoomAliasInHash(matrixPublicArchiveURLCreator);

// Show the message while we're trying to redirect or if we found nothing, remove the
// message
document.querySelector('.js-try-redirect-message').style.display = isRedirecting
  ? 'inline'
  : 'none';
