const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection');

router.get('/', function(req, res) {
    res.json({
        status: 401,
        message: "No tag was specified"
    });
});

router.get('/:tag', function(req, res) {
    app.getTag({
        tag: req.params.tag
    })
    .then(r => {
        res.json(r);
    })
    .catch(e => {
        // TODO log e somehow
        res.json(e);
    });
});

module.exports = router;