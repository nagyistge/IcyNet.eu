import url from 'url'
import qs from 'querystring'
import fs from 'fs'

function HTTP_GET (link, headers = {}, lback) {
  if (lback && lback >= 4) throw new Error('infinite loop!') // Prevent infinite loop requests
  let parsed = url.parse(link)
  let opts = {
    host: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    headers: {
      'User-Agent': 'Squeebot/Commons-2.0.0',
      'Accept': '*/*',
      'Accept-Language': 'en-GB,enq=0.5'
    }
  }

  if (headers) {
    opts.headers = Object.assign(opts.headers, headers)
  }

  let reqTimeOut

  let httpModule = parsed.protocol === 'https:' ? require('https') : require('http')
  return new Promise((resolve, reject) => {
    let req = httpModule.get(opts, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        if (!lback) {
          lback = 1
        } else {
          lback += 1
        }

        return HTTP_GET(res.headers.location, headers, lback).then(resolve, reject)
      }

      let data = ''

      reqTimeOut = setTimeout(() => {
        req.abort()
        data = null
        reject(new Error('Request took too long!'))
      }, 5000)

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        clearTimeout(reqTimeOut)

        resolve(data)
      })
    }).on('error', (e) => {
      reject(new Error(e.message))
    })

    req.setTimeout(10000)
  })
}

function HTTP_POST (link, headers = {}, data) {
  let parsed = url.parse(link)
  let postData = qs.stringify(data)

  let opts = {
    host: parsed.host,
    port: parsed.port,
    path: parsed.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Squeebot/Commons-2.0.0'
    }
  }

  if (headers) {
    opts.headers = Object.assign(opts.headers, headers)
  }

  if (opts.headers['Content-Type'] === 'application/json') {
    postData = JSON.stringify(data)
  }

  return new Promise((resolve, reject) => {
    let httpModule = parsed.protocol === 'https:' ? require('https') : require('http')
    let req = httpModule.request(opts, (res) => {
      res.setEncoding('utf8')
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve(data)
      })
    }).on('error', (e) => {
      reject(new Error(e))
    })

    req.write(postData)
    req.end()
  })
}

async function Download (url, dest) {
  return new Promise((resolve, reject) => {
    let file = fs.createWriteStream(dest)
    let protocol = url.indexOf('https:') === 0 ? require('https') : require('http')
    protocol.get(url, function (response) {
      response.pipe(file)
      file.on('finish', function () {
        file.close(resolve)
      })
    }).on('error', function (err) {
      fs.unlink(dest)
      reject(err)
    })
  })
}

module.exports = {
  GET: HTTP_GET,
  POST: HTTP_POST,
  Download: Download
}
