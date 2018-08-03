const express = require('express');
const app = require('../app');

const router = express.Router();

router.get('/', (req, res) => {
  app.getAlbums()
    .then((r) => {
      res.json({
        status: 200,
        albums: r,
      });
    })
    .catch((e) => {
      switch (e.name) {
        case 'ServerError':
          res.status(e.status).json({
            message: e.message,
            album: {},
          });
          break;
        default:
          res.status(500).json({
            message: 'An unknown error occurred.',
            album: {},
          });
      }
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
          res.status(e.status).json({
            message: e.message,
            album: {},
          });
          break;
        default:
          res.status(500).json({
            message: 'An unknown error occurred.',
            album: {},
          });
      }
    });
});

module.exports = router;
