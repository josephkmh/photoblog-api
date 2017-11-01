const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection');

router.get('/', function(req, res) {
    res.json({
        status: 401,
        message: "No photo id was specified"
    });
});

router.get('/:id', function(req, res) {
    app.getPhoto(req.params.id)
    .then(r => {
        res.json(r);
    })
    .catch(e => {
        switch (e) {
            case "NO_PHOTO_FOUND":
                res.json({
                    status: 404,
                    message: "No photo found."
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