const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection');

router.get('/', function(req, res) {
    app.getStream()
    .then(r => {
        res.json(r);
    })
    .catch(e => {
        switch (e) {
            case "NO_STREAM_FOUND":
                res.json({
                    status: 404,
                    message: "No photos found."
                });
                break;
            default:
                res.json({
                    status: 500,
                    message: "Something went wrong, sorry about that!"
                });
        }
    });
});

module.exports = router;