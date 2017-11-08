const db = require('../config/db-connection');
const appConfig = require('../config/app-config');
const mysql = require('mysql');
const fs = require('fs');
const uuid = require('uuid/v1');
const jimp = require('jimp');
const mime = require('mime');

// AWS JavaScript SDK for AWS integration
const AWS = require('aws-sdk');
AWS.config.loadFromPath('./config/s3-credentials.json');
const bucket = process.env.NODE_ENV === 'development' ? 'ninaphotoblog.dev' : 'ninaphotoblog.prod';
const S3 = new AWS.S3();

module.exports = {
    countImagesInAlbum(albumName) {
        var sql = ("SELECT COUNT(*) AS 'count' FROM albums WHERE album=?");
        var inserts = [albumName];
        sql = db.format(sql, inserts);

        return new Promise(function(resolve, reject){
            db.query(sql, function(err, results, fields){
                if (err) {
                    reject(err);
                    return;
                }
                resolve(results[0]['count']);
            });
        });
    },
    generatePhotoSizes(filename) {
        return new Promise((resolve, reject) => {
            let medium, thumbnail;
            jimp.read(`uploads/full/${filename}`)
            .then(fullImage => {
                const mediumPath = `uploads/medium/${filename}`;
                console.log('writing medium image to this path: '+mediumPath);       
                const mediumImage = fullImage.scaleToFit(800,800).quality(60).write(mediumPath);  
                return {
                    fullImage,
                    mediumPath
                };
            })
            .then(({fullImage, mediumPath}) => {
                const thumbnailPath = `uploads/thumbnail/${filename}`;
                const thumbnailImage = fullImage.scaleToFit(400,400).quality(60).write(thumbnailPath);
                resolve({
                    fullImage,
                    mediumPath,
                    thumbnailPath
                });
            });
        });
    },
    // Returns an array of photos when given an album name, used in getAlbum
    getAlbum(name) {
        let sql = `SELECT albums.album, albums.position, images.* FROM albums INNER JOIN images ON albums.image_id=images.image_id WHERE albums.album=? ORDER BY albums.position`;
        let inserts = [name]
        sql = db.format(sql, inserts);
        
        const album = new Promise((resolve, reject) => {
            if (!name || name === "") reject("NO_ALBUM_NAME"); 
            db.query(sql, (err, results, fields) => {
                if( err || !results || results.length === 0 ) reject("NO_ALBUM_FOUND");
                const photos = results.map(photo => {
                    return {
                        hidden: photo.hidden,
                        id: photo.image_id,
                        isAlbumCover: photo.album_cover,
                        isOnFrontPage: photo.stream,
                        sizes: {
                            small: {
                                url: photo.thumb_url,
                                width: null,
                                height: null
                            },
                            medium: {
                                url: photo.mid_url,
                                width: null,
                                height: null
                            },
                            full: {
                                url: photo.image_url,
                                width: photo.width,
                                height: photo.height
                            }
                        },
                        tags: null
                    }
                });
                resolve({
                    album: results[0].album,
                    photos
                });
            });
        });
        const size = this.countImagesInAlbum(name);
        return Promise.all([album, size]).then(([album, size]) => {
            album.size = size;
            return album;
        });
    },
    // Returns an array of images when given a tag, used in getTag
    getImagesWithTag({
        tag,
        limit = appConfig.stdOffset,
        offset = 0
    } = {}) {
        let sql = `SELECT images.* FROM image_tags INNER JOIN images ON image_tags.image_id=images.image_id WHERE image_tags.tag=? LIMIT ? OFFSET ?`;
        let inserts = [tag, limit, offset];
        sql = db.format(sql, inserts);

        return new Promise((resolve, reject) => {
            db.query(sql, (err, results, fields) => {
                if (err || results.length === 0) {
                    reject({
                        status: 404,
                        message: "No images found with that tag."
                    });
                }
                resolve(results);
            });
        });
    },
    // Returns an array of photo objects when given a tag
    getTag({
        tag
    }) {
        return this.getImagesWithTag({tag})
        .then(r => {
            let promises = r.map(image => this.getPhoto(image.image_id));
            return Promise.all(promises, values => {
                return values;
            });
        });
    },
    // Returns all of a photo's tags when given an id
    getTags(id) {
        let sql = `SELECT * FROM image_tags WHERE image_id=?`;
        let inserts = [id];
        sql = mysql.format(sql, inserts);

        return new Promise((resolve, reject) => {
            db.query(sql, (err, results, fields) => {
                if (err) reject("GET_TAGS_ERROR");
                if (!results || results.length === 0) {
                    resolve({image_id: id, tags: []})
                } else {
                    var tags = results.map(row => row.tag);
                    var tagsObject = {
                        image_id: id,
                        tags: tags
                    }
                    resolve(tagsObject);
                }
            });
        });
    },
    getPhoto(id) {
        let sql = `SELECT images.*, albums.position, albums.album, albums.album_cover FROM images LEFT JOIN albums ON albums.image_id=images.image_id WHERE images.image_id=?`;
        let inserts = [id];
        sql = mysql.format(sql, inserts);

        const photo = new Promise((resolve, reject) => {
            db.query(sql, (err, results, fields) => {
                if (err || !results.length || results.length > 1) {
                    reject("NO_PHOTO_FOUND");
                    return;
                }
                const data = results[0];

                resolve({
                    album: data.album,
                    hidden: data.hidden,
                    image_id: data.image_id,
                    album_cover: data.album_cover,
                    stream: data.stream,
                    processing: data.processing,
                    width: data.width,
                    height: data.height,
                    image_url: data.image_url,
                    mid_url: data.mid_url,
                    thumb_url: data.thumb_url,
                    tags: null
                });
            });
        });
        let tags = this.getTags(id);
        return Promise.all([photo, tags]).then(([photo, tags]) => {
            photo.tags = tags.tags;
            return photo;
        });
    },
    getStream() {
        let sql = `SELECT images.*, albums.album FROM images INNER JOIN albums ON albums.image_id=images.image_id WHERE images.stream=1`;
        return new Promise((resolve, reject) => {
            db.query(sql, (err, results, fields) => {
                if (err || !results.length) {
                    reject("NO_STREAM_FOUND");
                    return;
                }
                const photos = results.map(photo => {
                    return {
                        album: photo.album,
                        id: photo.image_id,
                        isOnFrontPage: photo.stream,
                        position: photo.position,
                        thumbnail: photo.thumb_url
                    }
                });
                resolve(photos);
            });
        });
    },
    saveNewPhotoToDb(data) {
        return new Promise(function(resolve, reject){
            let sql = "INSERT INTO images (stream, date) VALUES (?, ?)";
            let inserts = [data.stream, data.date];
            sql = db.format(sql, inserts);
            db.query(sql, function(err, results, fields){
                if (err || !results.insertId) {
                    console.error(err);
                    reject({
                        message: `saveNewPhotoToDb failed.`,
                        error: err
                    });
                    return;
                }
                data.id = results.insertId;
                resolve(data);
            });
        });
    },
    uploadPhotoToS3({path, filename, folder = false, mimetype}) {
        const Key = folder ? `${folder}/${filename}` : filename; // Need to filter out __full.jpeg for __medium.jpeg, etc.
        console.error(Key);
        const fileStream = fs.createReadStream(path);
        return new Promise((resolve, reject) => {
            S3.upload({Key, Body: fileStream, Bucket: bucket, ContentType: mimetype}, function(err, data) {
                if (err) {
                    console.log("Error", err);
                    reject(err);
                } if (data) {
                    data.filename = filename;
                    resolve(data);
                }
                reject('No error or data received.');
            });
        });
    },
    updatePhoto(id, newData) {
        console.log(`save to image_id ${id}:`);
        console.log(newData);
        console.log('\n');
        console.log('existing data:');
        return this.getPhoto(id)
        .then(oldData => {
            console.log(oldData);
            return new Promise((resolve, reject) => {
                let sql = "UPDATE images SET image_url=?, width=?, height=?, mid_url=?, thumb_url=?, date=?, description=?, stream=?, hidden=?, processing=? WHERE image_id = ?";
                let photo = {};
                for (let key in newData) {
                    if (!newData.hasOwnProperty(key)) continue;
                    photo[key] = newData[key];
                }
                for (let key in oldData) {
                    if (!oldData.hasOwnProperty(key)) continue;
                    if (photo[key]) continue;
                    photo[key] = oldData[key];
                }
                console.log('\n');
                console.log('combined data:');
                console.log(photo);
                console.log('\n');
                let inserts = [
                    photo.image_url,
                    photo.width,
                    photo.height,
                    photo.mid_url,
                    photo.thumb_url,
                    photo.date,
                    photo.description,
                    photo.stream,
                    photo.hidden,
                    photo.processing,
                    photo.image_id
                ];
                sql = db.format(sql, inserts);
                db.query(sql, function(err, results, fields){
                    console.log(results);
                    if (err || !results) {
                        console.log('there was an error when updating a photo...');
                        reject({
                            message: `updatePhoto failed.`,
                            error: err
                        });
                        return;
                    }
                    resolve(photo);
                });
            });
        });
    }
}