const express = require('express');
const fs = require('fs');

const app = express();
const PORT = 12345;

app.use(express.json());

app.post('/', (req, res) => {
  const data = req.body;

  if (!data.tests || !Array.isArray(data.tests)) {
    return res.status(400).send('Invalid format: tests array is missing');
  }

  try {
    const inputs = data.tests.map(test => test.input).join('\n');

    fs.writeFileSync('in.txt', inputs);
    console.log('Test cases written to in.txt');

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error writing to file:', err);
    res.status(500).send('Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Server on ${PORT}...`);
});
