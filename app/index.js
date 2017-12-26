const db = require('../config/db-connection');
const mysql = require('mysql');
const fs = require('fs');
const jimp = require('jimp');

// AWS JavaScript SDK for AWS integration
const AWS = require('aws-sdk');

AWS.config.loadFromPath('./config/s3-credentials.json');
const bucket = process.env.NODE_ENV === 'development' ? 'ninaphotoblog.dev' : 'ninaphotoblog.prod';
const S3 = new AWS.S3();

class ServerError extends Error {
  constructor(args) {
    super(args);
    const defaultMessage = 'There was an error. Sorry about that!';
    this.status = args.status;
    this.message = args.message || defaultMessage;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, ServerError);
  }
}

class InputError extends Error {
  constructor(message, errMessage, ...args) {
    super(...args);
    this.name = this.constructor.name;
    this.errMessage = errMessage;
    this.message = message;
    Error.captureStackTrace(this, ServerError);
  }
}

module.exports = {
  countImagesInAlbum(albumName) {
    let sql = ('SELECT COUNT(*) AS \'count\' FROM albums WHERE album=?');
    const inserts = [albumName];
    sql = db.format(sql, inserts);

    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError({
            status: 500,
            message: 'Error counting images in album',
          }));
          return;
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
          fullImage.scaleToFit(400, 400).quality(60).write(thumbnailPath);
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
    let sql = `SELECT images.*, albums.position, albums.album, albums.album_cover FROM albums INNER JOIN images ON albums.image_id=images.image_id WHERE albums.album=? ORDER BY albums.position`;
    const inserts = [name];
    sql = db.format(sql, inserts);

    const albumProm = new Promise((resolve, reject) => {
      if (!name || name === '') reject(new InputError('No album name specified'));
      db.query(sql, (err, results) => {
        if (err) reject(new ServerError({ status: 500 }));
        if (!results || results.length === 0) {
          reject(new ServerError({
            status: 404,
            message: `No album found with the name: ${name}`,
          }));
          return;
        }
        const photos = results.map(photo => ({
          hidden: photo.hidden,
          id: photo.image_id,
          isAlbumCover: photo.album_cover,
          isOnFrontPage: photo.stream,
          position: photo.position,
          processing: photo.processing,
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
        }));
        resolve({
          name: results[0].album,
          size: photos.length,
          photos,
        });
      });
    });
    const sizeProm = this.countImagesInAlbum(name);
    return Promise.all([albumProm, sizeProm]).then(([a, s]) => Object.assign({}, a, { s }));
  },
  // Returns an array of images when given a tag, used in getTag
  getImagesWithTag({
    tag,
    limit = 100,
    offset = 0,
  } = {}) {
    let sql = `SELECT image_tags.tag, images.* FROM image_tags INNER JOIN images ON image_tags.image_id=images.image_id WHERE image_tags.tag=? LIMIT ? OFFSET ?`;
    const inserts = [tag, limit, offset];
    sql = db.format(sql, inserts);

    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError({
            status: 500,
          }));
          return;
        }
        resolve(results);
      });
    });
  },
  getPhoto(id) {
    let sql = `SELECT images.*, albums.position, albums.album, albums.album_cover FROM images LEFT JOIN albums ON albums.image_id=images.image_id WHERE images.image_id=?`;
    const inserts = [id];
    sql = mysql.format(sql, inserts);

    const photoProm = new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError({
            message: 'There was a server error. Sorry about that!',
            status: 500,
          }));
          return;
        }
        if (!results.length || results.length > 1) {
          reject(new ServerError({
            message: `No image found with id: ${id}`,
            status: 404,
          }));
          return;
        }
        const data = results[0];

        resolve({
          hidden: data.hidden,
          id: data.image_id,
          isAlbumCover: data.album_cover,
          isOnFrontPage: data.stream,
          stream: data.stream,
          processing: data.processing,
          width: data.width,
          height: data.height,
          tags: null,
          date: data.date,
          album: {
            name: data.album,
            cover: data.album_cover,
            position: data.position,
          },
          sizes: {
            small: {
              url: data.thumb_url,
              width: null,
              height: null,
            },
            medium: {
              url: data.mid_url,
              width: null,
              height: null,
            },
            full: {
              url: data.image_url,
              width: data.width,
              height: data.height,
            },
          },
        });
      });
    });
    const tagsProm = this.getTags(id);
    return Promise.all([photoProm, tagsProm]).then(([p, t]) => Object.assign({}, p, { tags: t.tags }));
  },
  getStream() {
    const sql = `SELECT images.*, albums.position, albums.album, albums.album_cover FROM images INNER JOIN albums ON albums.image_id=images.image_id WHERE images.stream=1`;
    return new Promise((resolve, reject) => {
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError({ status: 500 }));
          return;
        }
        if (!results.length) {
          reject(new ServerError({
            status: 500,
            message: 'Photo stream was not found',
          }));
          return;
        }
        const photos = results.map((photo) => {
          const singlePhoto = {
            hidden: photo.hidden,
            id: photo.image_id,
            isAlbumCover: photo.album_cover,
            isOnFrontPage: photo.stream,
            stream: photo.stream,
            processing: photo.processing,
            width: photo.width,
            height: photo.height,
            date: photo.date,
            album: {
              name: photo.album,
              cover: photo.album_cover,
              position: photo.position,
            },
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
          };
          return singlePhoto;
        });
        resolve(photos);
      });
    });
  },
  // Returns an array of photo objects when given a tag
  getTag({
    tag,
  } = {}) {
    return this.getImagesWithTag({ tag })
      .then((r) => {
        const promises = r.map(image => this.getPhoto(image.image_id));
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
        if (err) {
          reject(new ServerError({ status: 500 }));
        } else if (!results || results.length === 0) {
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
  updateAlbumsTable(newData, recordExists = false) {
    return new Promise((resolve, reject) => {
      let sql;
      let inserts;
      if (!recordExists) {
        sql = 'INSERT INTO albums (album, position, album_cover, image_id) VALUES (?, ?, ?, ?)';
        inserts = [
          newData.album.name,
          1,
          newData.isAlbumCover || newData.album.cover,
          newData.id,
        ];
      } else {
        sql = 'UPDATE albums SET album=?, position=?, album_cover=? WHERE image_id=?';
        inserts = [
          newData.album.name,
          newData.album.position,
          newData.isAlbumCover || newData.album.cover,
          newData.id,
        ];
      }
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err || !results || results.affectedRows !== 1) {
          reject(new ServerError({
            status: 500,
            message: 'Error encountered when updating albums table.',
          }));
          return;
        }
        resolve(newData);
      });
    });
  },
  updateImagesTable(newData) {
    return new Promise((resolve, reject) => {
      let sql = 'UPDATE images SET image_url=?, width=?, height=?, mid_url=?, thumb_url=?, date=?, description=?, stream=?, hidden=?, processing=? WHERE image_id = ?';

      const inserts = [
        newData.sizes.full.url,
        newData.sizes.full.width,
        newData.sizes.full.height,
        newData.sizes.medium.url,
        newData.sizes.small.url,
        newData.date,
        newData.description,
        newData.isOnFrontPage || newData.stream,
        newData.hidden,
        newData.processing,
        newData.id,
      ];
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err || !results) {
          reject(new ServerError({
            status: 500,
            message: 'Error encountered when updating images table.',
          }));
          return;
        }
        resolve(newData);
      });
    });
  },
  updatePhoto(requestData) {
    let newData = {};
    let oldData = {};
    let recordExists = false;
    return this.getPhoto(requestData.id)
      .then((data) => {
        if (data.album.name) recordExists = true;
        oldData = data;
        newData = this.filterNewPhotoData(oldData, requestData);
        return newData;
      })
      .then(this.updateImagesTable)
      .then(() => this.updateAlbumsTable(newData, recordExists))
      .then(() => this.reorderAlbum(newData.album.name))
      .then(() => this.getPhoto(newData.id));
  },
  uploadPhotoToS3({
    path,
    filename,
    folder = false,
    mimetype,
  } = {}) {
    const Key = folder ? `${folder}/${filename}` : filename; // Need to filter out __full.jpeg for __medium.jpeg, etc.
    const fileStream = fs.createReadStream(path);
    return new Promise((resolve, reject) => {
      S3.upload({
        Key,
        Body: fileStream,
        Bucket: bucket,
        ContentType: mimetype,
      }, (err, data) => {
        if (err) {
          reject(new ServerError({
            status: 500,
            message: 'Unexpected error encountered when uploading to S3 via the SDK',
          }));
          return;
        }
        if (!data) {
          reject(new ServerError({
            status: 500,
            message: 'uploadPhotoToS3() failed: no error or data received.',
          }));
        }
        const uploadData = Object.assign({}, data, { filename });
        resolve(uploadData);
      });
    });
  },
  removeAlbumCover(albumName) {
    return new Promise((resolve, reject) => {
      let sql = 'UPDATE albums SET album_cover=0 WHERE album_cover=1 AND album=?';
      const inserts = [albumName];
      sql = db.format(sql, inserts);
      db.query(sql, (err) => {
        if (err) {
          reject(new ServerError({
            status: 500,
            message: 'Error encountered when removing existing album cover.',
          }));
          return;
        }
        resolve(albumName);
      });
    });
  },
  reorderAlbum(name) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM albums WHERE album=? ORDER BY position ASC';
      const inserts = [name];
      sql = db.format(sql, inserts);
      db.query(sql, (err, results) => {
        if (err) {
          reject(new ServerError({
            status: 500,
            message: 'Error encountered when reordering album (first query).',
          }));
          return;
        }
        let count = 1;
        results.forEach((image) => {
          let sql2 = 'UPDATE albums SET position=? WHERE image_id=?';
          const inserts2 = [count, image.image_id];
          sql2 = db.format(sql2, inserts2);
          db.query(sql2, (err2) => {
            if (err2) {
              reject(new ServerError({
                status: 500,
                message: 'Error encountered when reordering album (second query).',
              }));
            }
          });
          count++;
        });
        resolve();
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
          reject(new ServerError({
            status: 500,
            message: 'Error encountered when inserting new image in database.',
          }));
          return;
        }
        const photo = Object.assign({}, data, { id: results.insertId });
        resolve(photo);
      });
    })
      .then(photoData => this.updateAlbumsTable(photoData));
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
        return new Promise((resolve, reject) => {
          db.query(sql, (err, results) => {
            if (err) {
              reject(new ServerError({
                status: 500,
                message: 'Error encountered when setting new album cover.',
              }));
              return;
            }
            resolve(results);
          });
        });
      });
  },
  filterNewPhotoData(oldData, newData) {
    function recursivelyCheck(o, n) {
      const filtered = {};
      const keys = Object.keys(o);
      for (let i = 0; i < keys.length; i++) {
        // if the value is an object, loop through it's properties and copy them
        if (typeof o[keys[i]] === 'object' && o[keys[i]] !== null) {
          if (!n || !n[keys[i]]) {
            filtered[keys[i]] = recursivelyCheck(o[keys[i]]);
          } else {
            filtered[keys[i]] = recursivelyCheck(o[keys[i]], n[keys[i]]);
          }
        } else {
          filtered[keys[i]] = o[keys[i]]; // copy the oldData value
          if (n && n[keys[i]]) {
            filtered[keys[i]] = n[keys[i]];
          } // if it exists, overwrite with the newData value
        }
      }
      return filtered;
    }
    const filteredData = recursivelyCheck(oldData, newData);
    return filteredData;
  },
};
