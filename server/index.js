const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.static(publicDir));

app.listen(port, () => {
  console.log(`Linkbox server listening on http://localhost:${port}`);
});
