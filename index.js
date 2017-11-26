const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.port || 3000;

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
  app.use((err, req, res) => {
    console.log('=== ERROR ===');
    console.log(err.stack);
    // res.status(500).send('Express caught error...');
  });
} else {
  app.use((err, req, res) => {
    // res.status(500).send('Something broke! Sorry about that.');
  });
}

app.listen(port);
console.log(`API server listening on ${port}`);
