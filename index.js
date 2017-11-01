const express = require('express'),
    app = express(),
    port = process.env.port || 3000,
    db = require('./config/db-connection');


const routes = require('./routes');

app.use('/photo', routes.photo);
app.use('/album', routes.album);
app.use('/tag', routes.tag);
app.use('/stream', routes.stream);
app.use('/upload', routes.upload);

if (process.env.NODE_ENV === 'development') {
    app.use(function (err, req, res, next) {
        console.log('=== ERROR ===');
        console.log(err.stack);
        res.status(500).send('Express caught error...');
    });
} else {
    app.use(function (err, req, res, next) {
        res.status(500).send('Something broke! Sorry about that.');
    })
}


app.listen(port);
console.log(`API server listening on ${port}`)