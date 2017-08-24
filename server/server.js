import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import connectSession from 'connect-redis'
import path from 'path'
import crypto from 'crypto'

import routes from './routes'
import flash from '../scripts/flash'
import config from '../scripts/load-config'
import email from './api/emailer'

let app = express()
let SessionStore = connectSession(session)

app.enable('trust proxy', 1)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use(flash())

app.disable('x-powered-by')

app.use(session({
  key: config.server.session_key,
  secret: config.server.session_secret,
  store: new SessionStore(config.redis),
  resave: false,
  saveUninitialized: true
}))

app.use((req, res, next) => {
  let ipAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress

  if (ipAddr.indexOf('::ffff:') !== -1) {
    ipAddr = ipAddr.replace('::ffff:', '')
  }

  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(12).toString('hex')
  }

  req.realIP = ipAddr
  res.locals = Object.assign(res.locals, {
    user: req.session.user || null,
    csrf: req.session.csrf
  })

  next()
})

module.exports = (args) => {
  app.set('view options', {layout: false})
  app.set('view engine', 'pug')
  app.set('views', path.join(__dirname, '../views'))

  if (args.dev) console.log('Worker is in development mode')
  let staticAge = args.dev ? 1000 : 7 * 24 * 60 * 60 * 1000

  app.use('/style', express.static(path.join(__dirname, '../build/style'), { maxAge: staticAge }))
  app.use('/script', express.static(path.join(__dirname, '../build/script'), { maxAge: staticAge }))
  app.use('/static', express.static(path.join(__dirname, '../static'), { maxAge: staticAge }))

  app.use(routes)

  app.listen(args.port, () => {
    console.log('Listening on 0.0.0.0:' + args.port)
    email.init()
  })
}
