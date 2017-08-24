'use strict'

const path = require('path')
const util = require('util')

require('babel-core/register')({
  plugins: [
    'transform-es2015-modules-commonjs'
  ]
})

process.once('message', (args) => {
  if (args.dev) {
    process.env.NODE_ENV = 'development'
  } else {
    process.env.NODE_ENV = 'production'
  }

  console.log = function () {
    process.send(util.format.apply(this, arguments))
  }

  console.debug = function () {
    if (!args.dev) return
    process.send('[DEBUG] ' + util.format.apply(this, arguments))
  }

  console.warn = function () {
    process.send('warn ' + util.format.apply(this, arguments))
  }

  console.error = function () {
    process.send('error ' + util.format.apply(this, arguments))
  }

  try {
    require(path.join(__dirname, 'server'))(args)
    console.log('Worker process starting')
  } catch (e) {
    console.error(e)
  }

  process.on('message', (message) => {
    if (message === 'stop') {
      console.log('Recieved stop signal')
      const knex = require(path.join(__dirname, '../scripts/load-database')).knex

      knex.destroy(() => {
        process.exit(0)
      })
    }
  })

  process.send('started')
})
