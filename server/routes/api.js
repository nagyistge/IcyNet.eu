import express from 'express'
import parseurl from 'parseurl'
import RateLimit from 'express-rate-limit'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import API from '../api'
import APIExtern from '../api/external'

let router = express.Router()

let apiLimiter = new RateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
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
function JsonData (req, res, error, redirect='/') {
  if (req.headers['content-type'] == 'application/json') {
    return res.jsonp({error: error, redirect: redirect})
  }

  req.flash('message', {error: true, text: error})
  res.redirect(redirect)
}

/** FACEBOOK LOGIN
 * Ajax POST only <in-page javascript handeled>
 * No tokens saved in configs, everything works out-of-the-box
 */
router.post('/external/facebook/callback', wrap(async (req, res) => {
  let sane = objectAssembler(req.body)
  sane.ip_address = req.realIP

  let response = await APIExtern.Facebook.callback(req.session.user, sane)

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
  if (response.error) {
    req.flash('message', {error: true, text: response.error})
    return res.redirect(uri)
  }

  if (!req.session.user) {
    let user = response.user
    uri = createSession(req, user)
  }

  res.redirect(uri)
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
  if (response.error) {
    req.flash('message', {error: true, text: response.error})
    return res.redirect(uri)
  }

  if (!req.session.user) {
    let user = response.user
    uri = createSession(req, user)
  }

  res.redirect(uri)
}))

module.exports = router
