import 'matrix-public-archive-shared/room-directory-vm-render-script';

// Assets
// We have to disable no-missing-require lint because it doesn't take into
// account `package.json`. `exports`, see
// https://github.com/mysticatea/eslint-plugin-node/issues/255
// eslint-disable-next-line node/no-missing-import
import 'hydrogen-view-sdk/assets/theme-element-light.css';
import '../css/styles.css';
import '../css/room-directory.css';
// Just need to reference the favicon in one of the entry points for it to be copied
// over for all
import '../img/favicon.ico';
import '../img/favicon.svg';
