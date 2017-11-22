const express = require('express'),
    app = express(),
    port = process.env.port || 3000,
    db = require('./config/db-connection')
    bodyParser = require('body-parser')
    cors = require('cors');
    

// allow CORS
app.use(cors());

// initialize body parser for simple json payloads
app.use(bodyParser.json());

const routes = require('./routes');

app.use('/photo', routes.photo);
app.use('/album', routes.album);
app.use('/tag', routes.tag);
app.use('/stream', routes.stream);

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