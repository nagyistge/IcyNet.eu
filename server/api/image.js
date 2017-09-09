import gm from 'gm'
import path from 'path'
import crypto from 'crypto'
import Promise from 'bluebird'

const fs = Promise.promisifyAll(require('fs'))

const uploads = path.join(__dirname, '../../', 'usercontent')
const images = path.join(uploads, 'images')
const maxFileSize = 1000000
const imageTypes = {
  'image/png': '.png',
  'image/jpg': '.jpg',
  'image/jpeg': '.jpeg'
}

function decodeBase64Image (dataString) {
  let matches = dataString.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
  let response = {}

  if (matches.length !== 3) {
    return null
  }

  response.type = matches[1]
  response.data = Buffer.from(matches[2], 'base64')

  return response
}

function saneFields (fields) {
  let out = {}

  for (let i in fields) {
    let entry = fields[i]
    if (typeof entry === 'object' && entry.length === 1 && !isNaN(parseInt(entry[0]))) {
      out[i] = parseInt(entry[0])
    }
  }

  return out
}

async function bailOut (file, error) {
  await fs.unlinkAsync(file)
  return { error: error }
}

async function imageBase64 (baseObj) {
  if (!baseObj) return null
  let imgData = decodeBase64Image(baseObj)

  if (!imgData) return null
  if (!imageTypes[imgData.type]) return null

  let imageName = 'base64-' + crypto.randomBytes(12).toString('hex')
  let ext = imageTypes[imgData.type] || '.png'

  imageName += ext

  let fpath = path.join(images, imageName)

  try {
    await fs.writeFileAsync(fpath, imgData.data)
  } catch (e) {
    console.error(e)
    return null
  }

  return {file: fpath}
}

async function uploadImage (identifier, fields, files) {
  if (!files.image) return {error: 'No image file'}

  let file = files.image[0]
  if (file.size > maxFileSize) return bailOut(file.path, 'Image is too large! 1 MB max')

  fields = saneFields(fields)

  // Get file info, generate a file name
  let fileHash = crypto.randomBytes(12).toString('hex')
  let contentType = file.headers['content-type']
  if (!contentType) return bailOut(file.path, 'Invalid of missing content-type header')

  file = file.path

  // Make sure content type is allowed
  let match = false
  for (let i in imageTypes) {
    if (i === contentType) {
      match = true
      break
    }
  }
  if (!match) return bailOut(file, 'Invalid image type. Only PNG, JPG and JPEG files are allowed.')
  let extension = imageTypes[contentType]
  let fileName = identifier + '-' + fileHash + extension

  // Check for cropping
  if (fields.x == null || fields.y == null || fields.width == null || fields.height == null) {
    return bailOut(file, 'Images can only be cropped on the server side due to security reasons.')
  }

  if (fields.x < 0 || fields.y < 0 || fields.x > fields.width + fields.x || fields.y > fields.height + fields.y) {
    return bailOut(file, 'Impossible crop.')
  }

  // Check 1 : 1 aspect ratio
  if (Math.floor(fields.width / fields.height) !== 1) {
    return bailOut(file, 'Avatars can only have an aspect ratio of 1:1')
  }

  if (fields.scaleX) {
    fields.x *= fields.scaleX
    fields.width *= fields.scaleX
  }

  if (fields.scaleY) {
    fields.y *= fields.scaleY
    fields.height *= fields.scaleY
  }

  // Crop
  try {
    await new Promise(function (resolve, reject) {
      gm(file)
        .crop(fields.width, fields.height, fields.x, fields.y)
        .write(path.join(images, fileName), (err) => {
          if (err) return reject(err)
          resolve(fileName)
        })
    })

    await fs.unlinkAsync(file)
  } catch (e) {
    console.error(e)
    return bailOut(file, 'An error occured while cropping.')
  }

  return {file: fileName}
}

module.exports = {
  uploadImage: uploadImage,
  imageBase64: imageBase64,
  types: imageTypes
}
