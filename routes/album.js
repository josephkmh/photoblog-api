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
        data: r,
      });
    })
    .catch((e) => {
      switch (e.name) {
        case 'ServerError':
          res.json({
            status: e.status,
            message: e.message,
          });
          break;
        default:
          res.json({
            status: 500,
            message: 'An unknown error occurred.',
          });
      }
    });
});

module.exports = router;
