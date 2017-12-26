const express = require('express');
const app = require('../app');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 401,
    message: 'No album name specified.',
  });
});

router.get('/:name', (req, res) => {
  app.getAlbum(req.params.name)
    .then((r) => {
      res.json({
        status: 200,
        album: r,
      });
    })
    .catch((e) => {
      switch (e.name) {
        case 'ServerError':
          res.json({
            status: e.status,
            message: e.message,
            data: null
          });
          break;
        default:
          res.json({
            status: 500,
            message: 'An unknown error occurred.',
            data: null
          });
      }
    });
});

module.exports = router;
