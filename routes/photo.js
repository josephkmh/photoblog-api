const express = require('express');
const app = require('../app');
const uuid = require('uuid/v4');
const mime = require('mime');

const router = express.Router();

// initialize multer for handling multipart/form-data uploads
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/full');
  },
  filename: (req, file, cb) => {
    const theFile = file;
    const dateObj = new Date();
    const uniqueId = uuid().substr(0, 12);
    const date = dateObj.toISOString().substr(0, 10);
    theFile.ext = mime.extension(file.mimetype);
    theFile.bareFilename = `${uniqueId}_${date}`;
    cb(null, `${theFile.bareFilename}.${theFile.ext}`);
  },
});
const upload = multer({ storage });

router.get('/', (req, res) => {
  res.json({
    status: 401,
    message: 'No photo id was specified',
  });
});

router.get('/:id', (req, res) => {
  app.getPhoto(req.params.id)
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

router.post('/', upload.single('image'), function(req, res) {
    let file = req.file;
    let photo = {
        id: null
    }
    app.saveNewPhotoToDb({
        stream: req.body.stream,
        date: req.body.date,
        album: {
            name: req.body.album,
            position: null,
            cover: req.body.album_cover
        }
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
        return app.updatePhoto({
            id: photo.id,
            image_url: photo.image_url,
            mid_url: photo.mid_url,
            thumb_url: photo.thumb_url
        });
    })
    .catch(err => {
        console.log('Error in uploading new photo.', err);
    });
});

router.put('/:id', (req, res) => {
  const newData = req.body;
  newData.id = parseInt(req.params.id, 10);
  app.updatePhoto(newData)
    .then((photo) => {
      res.json({
        status: 200,
        message: `Photo ${photo.id} was updated.`,
        data: photo,
      });
      return photo;
    })
    .then(photo => app.setAlbumCover(photo.album.name, 2211))
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

router.delete('/', (req, res) => {
  res.status(405).json({
    status: 405,
    message: `Operation not permitted.`,
  });
});

router.delete('/', (req, res) => {
  res.status(405).json({
    status: 405,
    message: `Operation not permitted.`,
  });
});

module.exports = router;
