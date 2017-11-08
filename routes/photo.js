const express = require('express'),
    router = express.Router(),
    app = require('../app'),
    db = require('../config/db-connection')
    uuid = require('uuid/v4')
    mime = require('mime')
    fs = require('fs');

// initialize multer for handling multipart/form-data uploads
const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/full');
    },
    filename: (req, file, cb) => {
        let dateObj  = new Date();
        let uniqueId = uuid().substr(0,12);
        let date     = dateObj.toISOString().substr(0, 10);
        file.ext     = mime.extension(file.mimetype);
        file.bareFilename = `${uniqueId}_${date}`;
        cb(null, `${file.bareFilename}.${file.ext}`);
    }
})
const upload = multer({storage})

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

router.post('/', upload.single('image'), function(req, res) {
    console.log(req.file);
    let file = req.file;
    let photo = {
        id: null
    }
    app.saveNewPhotoToDb({
        stream: req.body.stream,
        album: req.body.album,
        date: req.body.date
    })
    .then(data => {
        photo.id = data.id;
        res.json({
            status: 200,
            message: `Photo was successfully uploaded.`,
            photo
        });
        return data;
    })
    .then(data => {
        return app.generatePhotoSizes(file.filename);
    })
    .then(data => {
        file.mediumPath = data.mediumPath;
        file.thumbnailPath = data.thumbnailPath;
        return app.uploadPhotoToS3({
            path: file.path,
            filename: `${file.bareFilename}__full.${file.ext}`,
            folder: 'full',
            mimetype: file.mimetype
        });
    })
    .then(fullData => {
        photo.image_url = fullData.Location;
        return app.uploadPhotoToS3({
            path: file.mediumPath,
            filename: `${file.bareFilename}__medium.${file.ext}`,
            folder: 'medium',
            mimetype: file.mimetype
        });
    })
    .then(mediumData => {
        photo.mid_url = mediumData.Location;
        let thumbnailFilename = file.filename.replace(file.ext, '');
        return app.uploadPhotoToS3({
            path: file.thumbnailPath,
            filename: `${file.bareFilename}__thumbnail.${file.ext}`,
            folder: 'thumbnail',
            mimetype: file.mimetype
        });
    })
    .then(thumbnailData => {
        photo.thumb_url = thumbnailData.Location;
        return app.updatePhoto(photo.id, {
            image_url: photo.image_url,
            mid_url: photo.mid_url,
            thumb_url: photo.thumb_url
        });
    })
    .catch(err => {
        console.log('Error in uploading new photo.', err);
    });
});

router.put('/:id', function(req, res) {
    app.updatePhoto(req.params.id)
    .then(data => {
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