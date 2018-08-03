const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.port || 3001;

// allow CORS
app.use(cors());

// initialize body parser for simple json payloads
app.use(bodyParser.json());
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError) {
    res.json({
      status: 400,
      message: 'Error in request syntax. Make sure that your JSON is valid.',
    });
  } else {
    next();
  }
});

const routes = require('./routes');

app.use('/photo', routes.photo);
app.use('/albums', routes.albums);
app.use('/tag', routes.tag);
app.use('/stream', routes.stream);

if (process.env.NODE_ENV === 'development') {
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
  });
} else {
  app.use((err, req, res) => {
    console.log('not using development environment variable, error not caught');
    // res.status(500).send('Something broke! Sorry about that.');
  });
}

app.listen(port);
console.log(`API server listening on ${port}`);
