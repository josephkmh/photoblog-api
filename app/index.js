const db = require('../config/db-connection');
const appConfig = require('../config/app-config');
const mysql = require('mysql');
const fs = require('fs');
const jimp = require('jimp');

// AWS JavaScript SDK for AWS integration
const AWS = require('aws-sdk');

AWS.config.loadFromPath('./config/s3-credentials.json');
const bucket = process.env.NODE_ENV === 'development' ? 'ninaphotoblog.dev' : 'ninaphotoblog.prod';
const S3 = new AWS.S3();

class ServerError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, ServerError);
  }
}

class InputError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, ServerError);
  }
}

module.exports = {
  countImagesInAlbum(albumName) {
    let sql = ("SELECT COUNT(*) AS 'count' FROM albums WHERE album=?");
    const inserts = [albumName];
    sql = db.format(sql, inserts);

    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError('Error counting images in album'));
        }
        resolve(results[0].count);
      });
    });
  },
  generatePhotoSizes(filename) {
    return new Promise((resolve) => {
      jimp.read(`uploads/full/${filename}`)
        .then((fullImage) => {
          const mediumPath = `uploads/medium/${filename}`;   
          fullImage.scaleToFit(800, 800).quality(60).write(mediumPath);  
          return {
            fullImage,
            mediumPath,
          };
        })
        .then(({ fullImage, mediumPath }) => {
          const thumbnailPath = `uploads/thumbnail/${filename}`;
          fullImage.scaleToFit(400,400).quality(60).write(thumbnailPath);
          resolve({
            fullImage,
            mediumPath,
            thumbnailPath,
          });
        });
    });
  },
  // Returns an array of photos when given an album name, used in getAlbum
  getAlbum(name) {
    let sql = `SELECT albums.album, albums.position, albums.album_cover, images.* FROM albums INNER JOIN images ON albums.image_id=images.image_id WHERE albums.album=? ORDER BY albums.position`;
    const inserts = [name];
    sql = db.format(sql, inserts);

    const albumPromise = new Promise((resolve, reject) => {
      if (!name || name === '') reject(new InputError('No album name specified')); 
      db.query(sql, (err, results) => {
        if (err || !results || results.length === 0) reject(new ServerError('No album was found'));
        const photos = results.map((photo) => {
          console.log('image', photo.image_id, photo.album_cover);
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
                height: null,
              },
              medium: {
                url: photo.mid_url,
                width: null,
                height: null,
              },
              full: {
                url: photo.image_url,
                width: photo.width,
                height: photo.height,
              },
            },
            tags: null,
          };
        });
        resolve({
          album: results[0].album,
          size: photos.length,
          photos,
        });
      });
    });
    const sizePromise = this.countImagesInAlbum(name);
    return Promise.all([albumPromise, sizePromise]).then(([album, size]) => {
      return Object.assign({}, album, { size });
    });
  },
  // Returns an array of images when given a tag, used in getTag
  getImagesWithTag({
    tag,
    limit = appConfig.stdOffset,
    offset = 0,
  } = {}) {
    let sql = `SELECT images.* FROM image_tags INNER JOIN images ON image_tags.image_id=images.image_id WHERE image_tags.tag=? LIMIT ? OFFSET ?`;
    const inserts = [tag, limit, offset];
    sql = db.format(sql, inserts);

    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err || results.length === 0) reject(new ServerError('No images found with that tag'));
        resolve(results);
      });
    });
  },
  // Returns an array of photo objects when given a tag
  getTag({
    tag,
  } = {}) {
    return this.getImagesWithTag({ tag })
      .then((r) => {
        const promises = r.map(image => this.getPhoto(image.id));
        return Promise.all(promises).then(values => values);
      });
  },
  // Returns all of a photo's tags when given an id
  getTags(id) {
    let sql = `SELECT * FROM image_tags WHERE image_id=?`;
    const inserts = [id];
    sql = mysql.format(sql, inserts);

    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) reject(new ServerError('getTags() returned an error'));
        if (!results || results.length === 0) {
          resolve({ image_id: id, tags: [] });
        } else {
          const tags = results.map(row => row.tag);
          resolve({
            image_id: id,
            tags,
          });
        }
      });
    });
  },
  getPhoto(id) {
    let sql = `SELECT images.*, albums.position, albums.album, albums.album_cover FROM images LEFT JOIN albums ON albums.image_id=images.image_id WHERE images.image_id=?`;
    const inserts = [id];
    sql = mysql.format(sql, inserts);

    const photoPromise = new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err || !results.length || results.length > 1) {
          reject(new ServerError('No photo found'));
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
            position: data.position,
          },
        });
      });
    });
    const tagsPromise = this.getTags(id);
    return Promise.all([photoPromise, tagsPromise]).then(([photo, tags]) => Object.assign({}, photo, { tags }));
  },
  getStream() {
    const sql = `SELECT images.*, albums.album FROM images INNER JOIN albums ON albums.image_id=images.image_id WHERE images.stream=1`;
    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err || !results.length) {
          reject(new ServerError('Photo stream was not found'));
          return;
        }
        const photos = results.map((photo) => {
          const singlePhoto = {
            album: photo.album,
            id: photo.image_id,
            isOnFrontPage: photo.stream,
            position: photo.position,
            thumbnail: photo.thumb_url,
          };
          return singlePhoto;
        });
        resolve(photos);
      });
    });
  },
  saveNewPhotoToDb(data) {
    return new Promise((resolve, reject) => {
      let sql = 'INSERT INTO images (stream, date) VALUES (?, ?)';
      const inserts = [data.stream, data.date];
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err || !results.insertId) {
          reject(new ServerError('saveNewPhotoToDb() failed'));
          return;
        }
        const photo = Object.assign({}, data, { id: results.insertId });
        resolve(photo);
      });
    })
      .then(photoData => this.updateAlbumsTable(photoData));
  },
  uploadPhotoToS3({ path, filename, folder = false, mimetype }) {
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
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM albums WHERE album=? ORDER BY position ASC';
      const inserts = [name];
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err) reject(new ServerError('reorderAlbum() failed on first query'));
        let count = 1;
        results.forEach((image) => {
          let sql2 = 'UPDATE albums SET position=? WHERE image_id=?';
          const inserts2 = [count, image.image_id];
          sql2 = db.format(sql2, inserts2);
          db.query(sql2, (err2) => {
            if (err2) reject(new ServerError('reorderAlbum() failed on second query'));
          });
          count++;
        });
        resolve();
      });
    });
  },
  updateAlbumsTable(newData, albumAssigned = false) {
    return new Promise((resolve, reject) => {
      let sql;
      let inserts;
      if (!albumAssigned) {
        sql = 'INSERT INTO albums (album, position, album_cover, image_id) VALUES (?, ?, ?, ?)';
        inserts = [newData.album.name, 1, newData.album.cover, newData.id];
      } else {
        sql = 'UPDATE albums SET album=?, position=?, album_cover=? WHERE image_id=?';
        inserts = [newData.album.name, newData.album.position, newData.album.cover, newData.id];
      }
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err || !results || results.affectedRows !== 1) {
          reject(new ServerError('updateAlbumsTable() failed'));
          return;
        }
        resolve(newData);
      });
    });
  },
  removeAlbumCover(albumName) {
    return new Promise((resolve, reject) => {
      let sql = 'UPDATE albums SET album_cover=0 WHERE album_cover=1 AND album=?';
      const inserts = [albumName];
      sql = db.format(sql, inserts);
      db.query(sql, (err) => {
        if (err) reject(new ServerError('removeAlbumCover() failed'));
        resolve(albumName);
      });
    });
  },
  setAlbumCover(albumName, imageId = null) {
    return this.removeAlbumCover(albumName)
      .then(() => {
        let sql;
        let inserts;
        if (!imageId) {
          sql = 'UPDATE albums SET album_cover=1 WHERE position=1 AND album=?';
          inserts = [albumName];
        } else {
          sql = 'UPDATE albums SET album_cover=1 WHERE image_id=? AND album=?';
          inserts = [imageId, albumName];
        }
        sql = db.format(sql, inserts);
        db.query(sql, (err, results) => {
          if (err) throw new ServerError('setAlbumCover() failed');
          return results;
        });
      });
  },
  updatePhoto(requestData) {
    let newData = {};
    let oldData = {};
    let albumAssigned = false;
    return this.getPhoto(requestData.id)
      .then((data) => {
        if (data.album.name) albumAssigned = true;
        oldData = data;
        newData = Object.assign(oldData, requestData);
        return newData;
      })
      .then(this.updateImagesTable)
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