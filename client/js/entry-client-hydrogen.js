import 'matrix-public-archive-shared/hydrogen-vm-render-script';

// Assets
// We have to disable no-missing-require lint because it doesn't take into
// account `package.json`. `exports`, see
// https://github.com/mysticatea/eslint-plugin-node/issues/255
// eslint-disable-next-line node/no-missing-import
import 'hydrogen-view-sdk/assets/theme-element-light.css';
import '../css/styles.css';
