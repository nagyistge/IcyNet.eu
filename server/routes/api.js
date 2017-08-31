import express from 'express'
import RateLimit from 'express-rate-limit'
import multiparty from 'multiparty'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import API from '../api'
import News from '../api/news'
import Image from '../api/image'
import APIExtern from '../api/external'

let router = express.Router()
let dev = process.env.NODE_ENV !== 'production'

// Restrict API usage
let apiLimiter = new RateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  delayMs: 0
})

// Restrict image uploads
let uploadLimiter = new RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  delayMs: 0
})

router.use(apiLimiter)

// Turn things like 'key1[key2]': 'value' into key1: {key2: 'value'} because facebook
function objectAssembler (insane) {
  let object = {}
  for (let key in insane) {
    let value = insane[key]
    if (key.indexOf('[') !== -1) {
      let subKey = key.match(/^([\w]+)\[(\w+)\]$/)
      if (subKey[1] && subKey[2]) {
        if (!object[subKey[1]]) {
          object[subKey[1]] = {}
        }

        object[subKey[1]][subKey[2]] = value
      }
    } else {
      object[key] = value
    }
  }
  return object
}

// Create a session and return a redirect uri if provided
function createSession (req, user) {
  let uri = '/'
  req.session.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_file: user.avatar_file,
    session_refresh: Date.now() + 1800000 // 30 minutes
  }

  if (req.session.redirectUri) {
    uri = req.session.redirectUri
    delete req.session.redirectUri
  }

  if (req.query.redirect) {
    uri = req.query.redirect
  }

  return uri
}

// Either give JSON or make a redirect
function JsonData (req, res, error, redirect = '/') {
  res.jsonp({error: error, redirect: redirect})
}

/** FACEBOOK LOGIN
 * Ajax POST only <in-page javascript handeled>
 * No tokens saved in configs, everything works out-of-the-box
 */
router.post('/external/facebook/callback', wrap(async (req, res, next) => {
  if (!config.facebook || !config.facebook.client) return next()
  let sane = objectAssembler(req.body)
  sane.ip_address = req.realIP

  let response = await APIExtern.Facebook.callback(req.session.user, sane)

  if (response.banned) {
    return res.render('user/banned', {bans: response.banned, ipban: response.ip})
  }

  if (response.error) {
    return JsonData(req, res, response.error)
  }

  // Create session
  let uri = '/'
  if (!req.session.user) {
    let user = response.user
    uri = createSession(req, user)
  }

  JsonData(req, res, null, uri)
}))

router.get('/external/facebook/remove', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')
  let done = await APIExtern.Common.remove(req.session.user, 'fb')

  if (!done) {
    req.flash('message', {error: true, text: 'Unable to unlink social media account'})
  }

  res.redirect('/user/manage')
}))

/** TWITTER LOGIN
 * OAuth1.0a flows
 * Tokens in configs
 */
router.get('/external/twitter/login', wrap(async (req, res) => {
  if (!config.twitter || !config.twitter.api) return res.redirect('/')
  let tokens = await APIExtern.Twitter.getRequestToken()

  if (tokens.error) {
    return res.jsonp({error: tokens.error})
  }

  req.session.twitter_auth = tokens
  if (req.query.returnTo) {
    req.session.twitter_auth.returnTo = req.query.returnTo
  }

  res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + tokens.token)
}))

router.get('/external/twitter/callback', wrap(async (req, res) => {
  if (!config.twitter || !config.twitter.api) return res.redirect('/login')
  if (!req.session.twitter_auth) return res.redirect('/login')
  let ta = req.session.twitter_auth
  let uri = ta.returnTo || '/login'

  if (!req.query.oauth_verifier) {
    req.flash('message', {error: true, text: 'Couldn\'t get a verifier'})
    return res.redirect(uri)
  }

  let accessTokens = await APIExtern.Twitter.getAccessTokens(ta.token, ta.token_secret, req.query.oauth_verifier)
  delete req.session.twitter_auth

  if (accessTokens.error) {
    req.flash('message', {error: true, text: 'Couldn\'t get an access token'})
    return res.redirect(uri)
  }

  let response = await APIExtern.Twitter.callback(req.session.user, accessTokens, req.realIP)
  if (response.banned) {
    return res.render('user/banned', {bans: response.banned, ipban: response.ip})
  }

  if (response.error) {
    req.flash('message', {error: true, text: response.error})
    return res.redirect(uri)
  }

  if (!req.session.user) {
    let user = response.user
    uri = createSession(req, user)
  }

  res.render('redirect', {url: uri})
}))

router.get('/external/twitter/remove', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  let done = await APIExtern.Common.remove(req.session.user, 'twitter')

  if (!done) {
    req.flash('message', {error: true, text: 'Unable to unlink social media account'})
  }

  res.redirect('/user/manage')
}))

/** DISCORD LOGIN
 * OAuth2 flows
 * Tokens in configs
 */
router.get('/external/discord/login', wrap(async (req, res) => {
  if (!config.discord || !config.discord.api) return res.redirect('/')

  let infos = APIExtern.Discord.getAuthorizeURL()

  req.session.discord_auth = {
    returnTo: req.query.returnTo || '/login',
    state: infos.state
  }

  res.redirect(infos.url)
}))

router.get('/external/discord/callback', wrap(async (req, res) => {
  if (!config.discord || !config.discord.api) return res.redirect('/login')
  if (!req.session.discord_auth) return res.redirect('/login')

  let code = req.query.code
  let state = req.query.state
  let da = req.session.discord_auth
  let uri = da.returnTo || '/login'

  if (!code) {
    req.flash('message', {error: true, text: 'No authorization.'})
    return res.redirect(uri)
  }

  if (!state || state !== da.state) {
    req.flash('message', {error: true, text: 'Request got intercepted, try again.'})
    return res.redirect(uri)
  }

  delete req.session.discord_auth

  let accessToken = await APIExtern.Discord.getAccessToken(code)
  if (accessToken.error) {
    req.flash('message', {error: true, text: accessToken.error})
    return res.redirect(uri)
  }

  let response = await APIExtern.Discord.callback(req.session.user, accessToken.accessToken, req.realIP)
  if (response.banned) {
    return res.render('user/banned', {bans: response.banned, ipban: response.ip})
  }

  if (response.error) {
    req.flash('message', {error: true, text: response.error})
    return res.redirect(uri)
  }

  if (!req.session.user) {
    let user = response.user
    uri = createSession(req, user)
  }

  res.render('redirect', {url: uri})
}))

router.get('/external/discord/remove', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  let done = await APIExtern.Common.remove(req.session.user, 'discord')

  if (!done) {
    req.flash('message', {error: true, text: 'Unable to unlink social media account'})
  }

  res.redirect('/user/manage')
}))

/* ========
 *   NEWS
 * ========
 */

// Cache news for one day
router.get('/news', (req, res, next) => {
  if (!dev) res.header('Cache-Control', 'max-age=' + 24 * 60 * 60 * 1000) // 1 day
  next()
})

// Get a page of articles
router.get('/news/all/:page', wrap(async (req, res) => {
  if (!req.params.page || isNaN(parseInt(req.params.page))) {
    return res.status(400).jsonp({error: 'Invalid page number.'})
  }

  let page = parseInt(req.params.page)
  let articles = await News.listNews(page)

  res.jsonp(articles)
}))

// Redirect to page one
router.get('/news/all/', (req, res) => {
  res.redirect('/api/news/all/1')
})

router.post('/news/edit/:id', wrap(async (req, res, next) => {
  let id = parseInt(req.params.id)

  if (!req.session.user || req.session.user.privilege < 1) return next()

  if (!id || isNaN(id)) {
    return res.status(400).jsonp({error: 'Invalid ID number.'})
  }

  if (!req.body.content) {
    return res.status(400).jsonp({error: 'Content is required.'})
  }

  let result = await News.edit(id, req.body)
  if (result.error) {
    return res.status(400).jsonp({error: result.error})
  }

  res.status(204).end()
}))

// Fetch article
router.get('/news/:id', wrap(async (req, res) => {
  if (!req.params.id || isNaN(parseInt(req.params.id))) {
    return res.status(400).jsonp({error: 'Invalid ID number.'})
  }

  let id = parseInt(req.params.id)
  let article = await News.article(id)

  res.jsonp(article)
}))

// Preview endpoint
router.get('/news', wrap(async (req, res) => {
  let articles = await News.preview()

  res.jsonp(articles)
}))

/* ==========
 *   AVATAR
 * ==========
 */
// Promisify multiparty form parser
async function promiseForm (req) {
  let form = new multiparty.Form()
  return new Promise(function (resolve, reject) {
    form.parse(req, async (err, fields, files) => {
      if (err) return reject(err)
      resolve({fields: fields, files: files})
    })
  })
}

// Upload avatar image
router.post('/avatar', uploadLimiter, wrap(async (req, res, next) => {
  if (!req.session.user) return next()
  let data = await promiseForm(req)
  let result = await Image.uploadImage(req.session.user.username, data.fields, data.files)

  if (result.error) {
    return res.status(400).jsonp({error: result.error})
  }

  let avatarUpdate = await API.User.changeAvatar(req.session.user, result.file)
  if (avatarUpdate.error) {
    return res.status(400).jsonp({error: avatarUpdate.error})
  }

  if (avatarUpdate.file) {
    req.session.user.avatar_file = avatarUpdate.file
  }

  res.status(200).jsonp({})
}))

// Remove avatar image
router.post('/avatar/remove', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  await API.User.removeAvatar(req.session.user)
  req.session.user.avatar_file = null

  res.status(200).jsonp({done: true})
}))

// Get latest avatar of logged in user
router.get('/avatar', wrap(async (req, res, next) => {
  if (!req.session.user) return next()
  let user = req.session.user

  if (!user.avatar_file) return next()

  res.header('Cache-Control', 'max-age=' + 7 * 24 * 60 * 60 * 1000) // 1 week
  res.redirect('/usercontent/images/' + user.avatar_file)
}))

// Get latest avatar of user by id
router.get('/avatar/:id', wrap(async (req, res, next) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) return next()

  let user = await API.User.get(id)

  if (!user || !user.avatar_file) return next()

  res.header('Cache-Control', 'max-age=' + 7 * 24 * 60 * 60 * 1000) // 1 week
  res.redirect('/usercontent/images/' + user.avatar_file)
}))

// Redirect to no avatar on 404
router.use('/avatar', (req, res) => {
  res.redirect('/static/image/avatar.png')
})

/* =====================
 *   OAuth2 Management
 * =====================
 */

// List authorizations
router.get('/oauth2/authorized-clients', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  let list = await API.User.OAuth2.getUserAuthorizations(req.session.user)
  if (!list) return next()

  res.jsonp(list)
}))

// Revoke an authorization
router.post('/oauth2/authorized-clients/revoke', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  let clientId = parseInt(req.body.client_id)
  if (isNaN(clientId)) return res.status(400).jsonp({error: 'Missing Client ID parameter'})

  let done = await API.User.OAuth2.removeUserAuthorization(req.session.user, clientId)
  if (!done) return res.status(400).jsonp({error: 'Failed to remove client authorization'})

  res.status(204).end()
}))

/* ==================
 *   Donation Store
 * ==================
 */

router.post('/paypal/ipn', wrap(async (req, res) => {
  let content = req.body

  if (content && content.payment_status && content.payment_status === 'Completed') {
    await API.Payment.handleIPN(content)
  }

  res.status(204).end()
}))

router.get('/donations/user', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  let contribs = await API.Payment.userContributions(req.session.user)
  res.jsonp(contribs)
}))

router.get('/donations', wrap(async (req, res, next) => {
  let count = parseInt(req.query.count)
  if (isNaN(count)) {
    count = 10
  }

  if (count > 10) {
    count = 10
  }

  let mcu = req.query.mcu === '1' || req.query.mcu === 'true'
  let timeFrame = parseInt(req.query.timeFrame)
  if (isNaN(timeFrame)) timeFrame = 0

  let contribs = await API.Payment.allContributions(count, mcu, timeFrame)
  res.jsonp(contribs)
}))

// 404
router.use((req, res) => {
  res.status(404).jsonp({error: 'Not found'})
})

router.use((err, req, res, next) => {
  console.error(err)
  res.jsonp({error: 'Internal server error.'})
})

module.exports = router
