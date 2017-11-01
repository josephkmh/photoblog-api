const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection');

router.get('/', function(req, res) {
    res.json({
        status: 401,
        message: "No album name was specified"
    });
});

router.get('/:name', function(req, res) {
    app.getAlbum(req.params.name)
    .then(r => {
        res.json(r);
    })
    .catch(e => {
        console.log(e);
        switch (e) {
            case "NO_ALBUM_FOUND":
                res.json({
                    status: 404,
                    message: "No album found."
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