const fs = require('fs')
const path = require('path')
const toml = require('toml')
const filename = path.join(__dirname, '..', 'config.toml')

let config

try {
  config = toml.parse(fs.readFileSync(filename))
} catch (e) {
  console.error(e)
  process.exit(1)
}

module.exports = config
