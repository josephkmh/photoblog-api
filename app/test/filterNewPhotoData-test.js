const test = require('tape');
const app = require('../index.js');

test('filter out non-whitelisted values', (t) => {
  const oldData = {
    hidden: true,
    id: true,
    isOnFrontPage: true,
    stream: true,
    processing: true,
    width: true,
    height: true,
    tags: true,
    date: true,
    album: {
      name: true,
      cover: true,
      position: true,
    },
    sizes: {
      small: {
        url: true,
        width: true,
        height: true,
      },
      medium: {
        url: true,
        width: true,
        height: true,
      },
      large: {
        url: true,
        width: true,
        height: true,
      },
    },
  };
  const newData = {
    processing: 1,
    album: {
      name: 'test value',
    },
    sizes: {
      small: {
        width: 100,
      },
    },
  };
  const actual = app.filterNewPhotoData(oldData, newData);
  const expected = {
    hidden: true,
    id: true,
    isOnFrontPage: true,
    stream: true,
    processing: 1,
    width: true,
    height: true,
    tags: true,
    date: true,
    album: {
      name: 'test value',
      cover: true,
      position: true,
    },
    sizes: {
      small: {
        url: true,
        width: 100,
        height: true,
      },
      medium: {
        url: true,
        width: true,
        height: true,
      },
      large: {
        url: true,
        width: true,
        height: true,
      },
    },
  };
  t.deepEqual(actual, expected);
  t.end();
});
