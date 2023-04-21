import assert from './assert.js';

// Based off of https://github.com/matrix-org/matrix-bifrost/blob/c7161dd998c4fe968dba4d5da668dc914248f260/src/MessageFormatter.ts#L45-L60
function mxcUrlToHttp({ mxcUrl, homeserverUrl }) {
  assert(mxcUrl, '`mxcUrl` must be provided to `mxcUrlToHttp(...)`');
  assert(homeserverUrl, '`homeserverUrl` must be provided to `mxcUrlToHttp(...)`');
  const [serverName, mediaId] = mxcUrl.substr('mxc://'.length).split('/', 2);
  const url = homeserverUrl.replace(/\/$/, '');
  return `${url}/_matrix/media/v1/download/${encodeURIComponent(serverName)}/${encodeURIComponent(
    mediaId
  )}`;
}

function mxcUrlToHttpThumbnail({ mxcUrl, homeserverUrl, size }) {
  assert(mxcUrl, '`mxcUrl` must be provided to `mxcUrlToHttp(...)`');
  assert(homeserverUrl, '`homeserverUrl` must be provided to `mxcUrlToHttp(...)`');
  assert(size, '`size` must be provided to `mxcUrlToHttp(...)`');
  const [serverName, mediaId] = mxcUrl.substr('mxc://'.length).split('/');

  let qs = new URLSearchParams();
  qs.append('width', Math.round(size));
  qs.append('height', Math.round(size));

  const url = homeserverUrl.replace(/\/$/, '');
  return `${url}/_matrix/media/r0/thumbnail/${encodeURIComponent(serverName)}/${encodeURIComponent(
    mediaId
  )}?${qs.toString()}`;
}

export { mxcUrlToHttp, mxcUrlToHttpThumbnail };
