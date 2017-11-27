const express = require('express');
const app = require('../app');

const router = express.Router();

router.get('/', (req, res) => {
  app.getStream()
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
