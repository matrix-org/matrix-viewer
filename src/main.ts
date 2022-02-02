import {
  Platform,
  Client,
  LoadStatus,
  createNavigation,
  createRouter,
  RoomViewModel,
  TimelineView
} from "hydrogen-view-sdk";
import downloadSandboxPath from 'hydrogen-view-sdk/download-sandbox.html?url';
import workerPath from 'hydrogen-view-sdk/main.js?url';
import olmWasmPath from '@matrix-org/olm/olm.wasm?url';
import olmJsPath from '@matrix-org/olm/olm.js?url';
import olmLegacyJsPath from '@matrix-org/olm/olm_legacy.js?url';
const assetPaths = {
  downloadSandbox: downloadSandboxPath,
  worker: workerPath,
  olm: {
      wasm: olmWasmPath,
      legacyBundle: olmLegacyJsPath,
      wasmBundle: olmJsPath
  }
};
import "hydrogen-view-sdk/style.css";



import secrets from '../secrets.json';
const matrixUsername = secrets["matrix-username"];
console.assert(!!matrixUsername);
const matrixPassword = secrets["matrix-password"];
console.assert(!!matrixPassword);

async function main() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const config = {};
  const platform = new Platform(app, assetPaths, config, { development: import.meta.env.DEV });
  const navigation = createNavigation();
  platform.setNavigation(navigation);
  const urlRouter = createRouter({
      navigation: navigation,
      history: platform.history
  });
  urlRouter.attach();
  const client = new Client(platform);

  const loginOptions = await client.queryLogin("matrix.org").result;
  client.startWithLogin(loginOptions.password(matrixUsername, matrixPassword));

  await client.loadStatus.waitFor((status: string) => {
      return status === LoadStatus.Ready ||
          status === LoadStatus.Error ||
          status === LoadStatus.LoginFailed;
  }).promise;

  if (client.loginFailure) {
      alert("login failed: " + client.loginFailure);
  } else if (client.loadError) {
      alert("load failed: " + client.loadError.message);
  } else {
      const {session} = client;
      // looks for room corresponding to #element-dev:matrix.org, assuming it is already joined
      const room = session.rooms.get("!OWqptMTjnQfUWubCid:matrix.org");
      const vm = new RoomViewModel({
          room,
          ownUserId: session.userId,
          platform,
          urlCreator: urlRouter,
          navigation,
      });
      await vm.load();
      console.log('asdf', vm.timelineViewModel);
      
      const view = new TimelineView(vm.timelineViewModel);
      app.appendChild(view.mount());
  }
}


main();

import './main2';
