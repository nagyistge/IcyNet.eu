import path from 'path'
import Promise from 'bluebird'
import fs from 'fs'

const access = Promise.promisify(fs.access)

async function exists (fpath) {
  try {
    await access(path.resolve(fpath))
  } catch (e) {
    return false
  }

  return true
}

module.exports = exists
