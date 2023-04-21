import assert from 'assert';

import getServerNameFromMatrixRoomIdOrAlias from '../../../server/lib/matrix-utils/get-server-name-from-matrix-room-id-or-alias';

describe('getServerNameFromMatrixRoomIdOrAlias', () => {
  // Some examples from https://spec.matrix.org/v1.5/appendices/#server-name
  const testCases = [
    {
      name: 'can parse normal looking domain name',
      input: '!foo:matrix.org',
      expected: 'matrix.org',
    },
    {
      name: 'can parse sub-domain',
      input: '!foo:archive.matrix.org',
      expected: 'archive.matrix.org',
    },
    {
      name: 'can parse domain with port',
      input: '!foo:matrix.org:8888',
      expected: 'matrix.org:8888',
    },
    {
      name: 'can parse IPv4 address',
      input: '!foo:192.168.1.1',
      expected: '192.168.1.1',
    },
    {
      name: 'can parse IPv4 address with port',
      input: '!foo:192.168.1.1:1234',
      expected: '192.168.1.1:1234',
    },
    {
      name: 'can parse IPv6 address',
      input: '!foo:[1234:5678::abcd]',
      expected: '[1234:5678::abcd]',
    },
    {
      name: 'can parse IPv6 address with port',
      input: '!foo:[1234:5678::abcd]:1234',
      expected: '[1234:5678::abcd]:1234',
    },
    {
      name: `opaque room ID is *NOT* parsed and we can't derive a server name`,
      input: '!foobarbaz',
      expected: null,
    },
  ];

  testCases.forEach((testCaseMeta) => {
    it(testCaseMeta.name, () => {
      const actual = getServerNameFromMatrixRoomIdOrAlias(testCaseMeta.input);
      assert.strictEqual(actual, testCaseMeta.expected);
    });
  });
});
