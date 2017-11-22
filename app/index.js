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
                    reject({
                        message: "error counting images in album",
                        error: err
                    });
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
        let sql = `SELECT albums.album, albums.position, albums.album_cover, images.* FROM albums INNER JOIN images ON albums.image_id=images.image_id WHERE albums.album=? ORDER BY albums.position`;
        let inserts = [name]
        sql = db.format(sql, inserts);
        
        const album = new Promise((resolve, reject) => {
            if (!name || name === "") reject("NO_ALBUM_NAME"); 
            db.query(sql, (err, results, fields) => {
                if( err || !results || results.length === 0 ) reject("NO_ALBUM_FOUND");
                const photos = results.map(photo => {
                    console.log('image ',photo.image_id,photo.album_cover);
                    return {
                        hidden: photo.hidden,
                        id: photo.image_id,
                        isAlbumCover: photo.album_cover,
                        isOnFrontPage: photo.stream,
                        position: photo.position,
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
                    size: photos.length,
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
            let promises = r.map(image => this.getPhoto(image.id));
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
                    hidden: data.hidden,
                    id: data.image_id,
                    stream: data.stream,
                    processing: data.processing,
                    width: data.width,
                    height: data.height,
                    image_url: data.image_url,
                    mid_url: data.mid_url,
                    thumb_url: data.thumb_url,
                    tags: null,
                    album: {
                        name: data.album,
                        cover: data.album_cover,
                        position: data.position
                    }
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
        console.log('saveNewPhotoToDb: ',data);
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
        })
        .then(data =>  this.updateAlbumsTable(data));
    },
    uploadPhotoToS3({path, filename, folder = false, mimetype}) {
        const Key = folder ? `${folder}/${filename}` : filename; // Need to filter out __full.jpeg for __medium.jpeg, etc.
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
    reorderAlbum(name) {
        return new Promise( function(resolve, reject ){
            let sql = "SELECT * FROM albums WHERE album=? ORDER BY position ASC";
            let inserts = [name];
            sql = db.format(sql, inserts);
            db.query(sql, function(err, results, fields){
                if(err) console.log(err);
                let count = 1;
                results.forEach(function(image){
                    let sql = "UPDATE albums SET position=? WHERE image_id=?";
                    let inserts = [count, image.image_id];
                    sql = db.format(sql, inserts);
                    db.query(sql, function(err, results, fields){
                        if( err ) reject({
                            message: 'reordering album failed.', 
                            error: err
                        });
                    });
                    count++;
                });
                resolve();
            });
        });
    },
    updateAlbumsTable(newData, albumAssigned = false) {
        return new Promise((resolve, reject) => {
            let sql, inserts;
            if (!albumAssigned) {
                sql = "INSERT INTO albums (album, position, album_cover, image_id) VALUES (?, ?, ?, ?)";
                inserts = [newData.album.name, 1, newData.album.cover, newData.id];
            } else {
                sql = "UPDATE albums SET album=?, position=?, album_cover=? WHERE image_id=?";
                inserts = [newData.album.name, newData.album.position, newData.album.cover, newData.id];
            }
            sql = db.format(sql, inserts);
            db.query(sql, (err, results, fields) => {
                if (err || !results || results.affectedRows !== 1) {
                    reject({
                        message: 'updating albums table failed.', 
                        error: err
                    });
                    return;
                };
                resolve(newData);
            });
        });
    },
    removeAlbumCover(albumName) {
        return new Promise(function(resolve, reject){
            let sql = "UPDATE albums SET album_cover=0 WHERE album_cover=1 AND album=?";
            let inserts = [albumName];
            sql = db.format(sql, inserts);
            db.query(sql, function(err, results, fields) {
                if (err) {
                    reject({
                        message: 'error removing album cover',
                        error: err
                    })
                }
                console.log(sql);
                resolve(fields);
            });
        });
    },
    setAlbumCover(albumName, imageId = null) {
        return this.removeAlbumCover(albumName)
        .then(() => {
            var sql, inserts;
            if (!imageId) {
                sql = "UPDATE albums SET album_cover=1 WHERE position=1 AND album=?";
                inserts = [albumName];
            } else {
                sql = "UPDATE albums SET album_cover=1 WHERE image_id=? AND album=?";
                inserts = [imageId, albumName];
            }
            sql = db.format(sql, inserts);
            db.query(sql, function(err, results, fields){
                if (err) {
                    reject({
                        message: "error setting album cover",
                        error: err
                    });
                };
                return results;
            });
        })
    },
    updatePhoto(requestData) {
        let newData = {};
        let oldData = {};
        let albumAssigned = false;
        return this.getPhoto(requestData.id)
        .then(data => {
            if (data.album.name) albumAssigned = true;
            oldData = data;
            newData = Object.assign(oldData, requestData);
        })
        .then(() => this.updateImagesTable(newData))
        .then(() => this.updateAlbumsTable(newData, albumAssigned))
        .then(() => this.reorderAlbum(newData.album.name))
        .then(() => this.getPhoto(newData.id));
    },
    updateImagesTable(newData) {
        return new Promise((resolve, reject) => {
            let sql = "UPDATE images SET image_url=?, width=?, height=?, mid_url=?, thumb_url=?, date=?, description=?, stream=?, hidden=?, processing=? WHERE image_id = ?";
            let inserts = [
                newData.image_url,
                newData.width,
                newData.height,
                newData.mid_url,
                newData.thumb_url,
                newData.date,
                newData.description,
                newData.stream,
                newData.hidden,
                newData.processing,
                newData.id
            ];
            sql = db.format(sql, inserts);
            db.query(sql, function(err, results, fields){
                if (err || !results) {
                    reject({
                        message: `updating images table failed`,
                        error: err
                    });
                    return;
                }
                resolve(newData);
            });
        });
    }
}