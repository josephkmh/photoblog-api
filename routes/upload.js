const express = require('express'),
router = express.Router(),
app = require('../app'),
db = require('../config/db-connection');

// multer for handling multipart/form-data uploads
const multer = require('multer');
const upload = multer({ 
    dest: 'uploads/'
});

router.post('/', upload.single('photo'), function(req, res) {
    //TODO: check filetype and handle any errors
    app.uploadPhoto(req.file.path)
    .then(data => {
        console.log(data);
        res.json({
            status: 200,
            message: `Photo was successfully uploaded.`,
            photo: {
                image_url: data.Location
            }
        });
    });
});

module.exports = router;