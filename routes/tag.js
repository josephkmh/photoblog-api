const express = require('express');
const app = require('../app');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 401,
    message: 'No tag was specified',
  });
});

router.get('/:tag', (req, res) => {
  app.getTag({
    tag: req.params.tag,
  })
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
            message: 'Something went wrong, sorry about that!',
          });
      }
    });
});

module.exports = router;
