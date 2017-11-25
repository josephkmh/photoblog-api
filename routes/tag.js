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
      res.json(r);
    })
    .catch((e) => {
      // TODO log e somehow
      console.log(e);
      res.json(e);
    });
});

module.exports = router;
