const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection');

// multer for handling multipart/form-data uploads
const multer = require('multer');
const upload = multer({ 
    dest: 'uploads/'
});

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

router.post('/', upload.single('photo'), function(req, res) {
    //TODO: check filetype and handle any errors
    app.uploadPhoto(req.file.path)
    .then(data => {
        return app.saveNewPhotoToDb({
            image_url: data.Location,
            mid_url: 'null',
            thumb_url: 'null',
            width: null,
            height: null,
            stream: req.body.stream,
            date: req.body.date
        });
    })
    .then(data => {
        console.log('responding with data of this object: ');
        console.log(data);
        res.json({
            status: 200,
            message: `Photo was successfully uploaded.`,
            photo: {
                image_url: data.Location
            }
        });
        return data;
    })
    .then(data => {
        console.log('attempting to generate sizes of image '+data.id);
        app.generatePhotoSizes(data.id);
    })
    .catch(e => {
        console.log('Error in uploading new photo.', err);
    });
});

router.put('/:id', function(req, res) {
    app.updatePhoto(req.params.id)
    .then(data => {
        console.log(data);
        res.json({
            status: 200,
            message: `Photo ${data.id} was updated.`,
            photo: data
        });
    })
    .catch(e => {
        res.status(500).json({
            status: 500,
            message: `Something went wrong. Sorry about that!`
        });
    });
});

router.delete('/', function(req, res) {
    res.status(405).json({
        status: 405,
        message: `Operation not permitted.`
    });
});

router.delete('/', function(req, res) {
    res.status(405).json({
        status: 405,
        message: `Operation not permitted.`
    });
});

module.exports = router;