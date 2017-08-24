import fs from 'fs'
import path from 'path'
import express from 'express'
import RateLimit from 'express-rate-limit'
import parseurl from 'parseurl'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import http from '../../scripts/http'
import API from '../api'
import News from '../api/news'

import apiRouter from './api'
import oauthRouter from './oauth2'

let router = express.Router()

let accountLimiter = new RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  delayMs: 0,
  message: 'Whoa, slow down there, buddy! You just hit our rate limits. Try again in 1 hour.'
})

router.use(wrap(async (req, res, next) => {
  let messages = req.flash('message')
  if (!messages || !messages.length) {
    messages = {}
  } else {
    messages = messages[0]
  }

  res.locals.message = messages
  next()
}))

router.use('/oauth2', oauthRouter)

/*
  ================
    RENDER VIEWS
  ================
*/
router.get('/', (req, res) => {
  res.render('index')
})

// Add social media login buttons
function extraButtons (req, res, next) {
  if (config.twitter && config.twitter.api) {
    res.locals.twitter_auth = true
  }

  if (config.discord && config.discord.api) {
    res.locals.discord_auth = true
  }

  if (config.facebook && config.facebook.client) {
    res.locals.facebook_auth = config.facebook.client
  }

  next()
}

router.get('/login', extraButtons, (req, res) => {
  if (req.session.user) {
    let uri = '/'
    if (req.session.redirectUri) {
      uri = req.session.redirectUri
      delete req.session.redirectUri
    }

    return res.redirect(uri)
  }

  res.render('login')
})

router.get('/register', extraButtons, (req, res) => {
  if (req.session.user) return res.redirect('/')

  let dataSave = req.flash('formkeep')
  if (dataSave.length) {
    dataSave = dataSave[0]
  } else {
    dataSave = {}
  }

  res.locals.formkeep = dataSave

  if (config.security.recaptcha && config.security.recaptcha.site_key) {
    res.locals.recaptcha = config.security.recaptcha.site_key
  }

  res.render('register')
})

router.get('/user/two-factor', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')
  let twoFaEnabled = await API.User.Login.totpTokenRequired(req.session.user)
  if (twoFaEnabled) return res.redirect('/')

  let newToken = await API.User.Login.totpAquire(req.session.user)
  if (!newToken) return res.redirect('/')
  
  res.locals.uri = newToken
  res.render('totp')
}))

router.get('/user/two-factor/disable', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')
  let twoFaEnabled = await API.User.Login.totpTokenRequired(req.session.user)

  if (!twoFaEnabled) return res.redirect('/')
  res.render('password')
}))

router.get('/login/verify', (req, res) => {
  res.render('totp-check')
})

/*
  =================
    POST HANDLING
  =================
*/

function formError (req, res, error, redirect) {
  // Security measures: never store any passwords in any session
  if (req.body.password) {
    delete req.body.password
    if (req.body.password_repeat) {
      delete req.body.password_repeat
    }
  }
  
  req.flash('formkeep', req.body || {})
  req.flash('message', {error: true, text: error})
  res.redirect(redirect || parseurl(req).path)
}

router.post('/user/two-factor', wrap(async (req, res) => {
  if (!req.body.code) {
    return formError(req, res, 'You need to enter the code.')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let verified = await API.User.Login.totpCheck(req.session.user, req.body.code)
  if (!verified) {
    return formError(req, res, 'Try again!')
  }

  res.redirect('/')
}))

router.post('/user/two-factor/disable', wrap(async (req, res) => {
  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  if (!req.body.password) {
    return formError(req, res, 'Please enter your password.')
  }

  let purge = await API.User.Login.purgeTotp(req.session.user, req.body.password)
  if (!purge) {
    return formError(req, res, 'Invalid password.')
  }

  res.redirect('/')
}))

router.post('/login/verify', wrap(async (req, res) => {
  if (req.session.totp_check === null) return res.redirect('/login')
  if (!req.body.code && !req.body.recovery) {
    return formError(req, res, 'You need to enter the code.')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let totpCheck = await API.User.Login.totpCheck(req.session.totp_check, req.body.code, req.body.recovery || false)
  if (!totpCheck) {
    return formError(req, res, 'Invalid code!')
  }

  let user = await API.User.get(req.session.totp_check)
  delete req.session.totp_check

  // Set session
  req.session.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_file: user.avatar_file,
    session_refresh: Date.now() + 1800000 // 30 minutes
  }

  let uri = '/'
  if (req.session.redirectUri) {
    uri = req.session.redirectUri
    delete req.session.redirectUri
  }

  if (req.query.redirect) {
    uri = req.query.redirect
  }

  res.redirect(uri)
}))

router.post('/login', wrap(async (req, res) => {
  if (!req.body.username || !req.body.password) {
    return res.redirect('/login')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let user = await API.User.get(req.body.username)
  if (!user) return formError(req, res, 'Invalid username or password.')

  let pwMatch = await API.User.Login.password(user, req.body.password)
  if (!pwMatch) return formError(req, res, 'Invalid username or password.')

  if (user.activated === 0) return formError(req, res, 'Please activate your account first.')
  if (user.locked === 1) return formError(req, res, 'This account has been locked.')

  let totpRequired = await API.User.Login.totpTokenRequired(user)
  if (totpRequired) {
    req.session.totp_check = user.id
    return res.redirect('/login/verify')
  }

  // TODO: Ban checks

  // Set session
  req.session.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_file: user.avatar_file,
    session_refresh: Date.now() + 1800000 // 30 minutes
  }

  let uri = '/'
  if (req.session.redirectUri) {
    uri = req.session.redirectUri
    delete req.session.redirectUri
  }

  if (req.query.redirect) {
    uri = req.query.redirect
  }

  res.redirect(uri)
}))

router.post('/register', accountLimiter, wrap(async (req, res) => {
  if (!req.body.username || !req.body.display_name || !req.body.password || !req.body.email) {
    return formError(req, res, 'Please fill in all the fields.')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  // 1st Check: Username Characters and length
  let username = req.body.username
  if (!username || !username.match(/^([\w-]{3,26})$/i)) {
    return formError(req, res, 'Invalid username! Must be between 3-26 characters and composed of alphanumeric characters!')
  }

  // 2nd Check: Display Name
  let display_name = req.body.display_name
  if (!display_name || !display_name.match(/^([^\\`]{3,32})$/i)) {
    return formError(req, res, 'Invalid display name!')
  }

  // 3rd Check: Email Address
  let email = req.body.email
  if (!email || !API.User.Register.validateEmail(email)) {
    return formError(req, res, 'Invalid email address!')
  }

  // 4th Check: Password length
  let password = req.body.password
  if (!password || password.length < 8 || password.length > 32) {
    return formError(req, res, 'Invalid password! Keep it between 8 and 32 characters!')
  }

  // 5th Check: Password match
  let passwordAgain = req.body.password_repeat
  if (!passwordAgain || password !== passwordAgain) {
    return formError(req, res, 'Passwords do not match!')
  }

  // 6th Check: reCAPTCHA (if configuration contains key)
  if (config.security.recaptcha && config.security.recaptcha.site_key) {
    if (!req.body['g-recaptcha-response']) return formError(req, res, 'Please complete the reCAPTCHA!')
    
    try {
      let data = await http.POST('https://www.google.com/recaptcha/api/siteverify', {}, {
        secret: config.security.recaptcha.secret_key,
        response: req.body['g-recaptcha-response']
      })

      data = JSON.parse(data)
      if (!data.success) {
        return formError(req, res, 'Please complete the reCAPTCHA!')
      }
    } catch (e) {
      console.error(e)
      return formError(req, res, 'Internal server error')
    }
  }

  // Hash the password
  let hash = await API.User.Register.hashPassword(password)

  // Attempt to create the user
  let newUser = await API.User.Register.newAccount({
    username: username,
    display_name: display_name,
    password: hash,
    email: email,
    ip_address: req.realIP
  })

  if (!newUser || newUser.error != null) {
    return formError(req, res, newUser.error)
  }

  req.flash('message', {error: false, text: 'Account created successfully! Please check your email for an activation link.'})
  res.redirect('/login')
}))

/*
  =============
    DOCUMENTS
  =============
*/

const docsDir = path.join(__dirname, '../../documents')
router.get('/docs/:name', (req, res) => {
  let doc = path.join(docsDir, req.params.name + '.html')
  if (!fs.existsSync(docsDir) || !fs.existsSync(doc)) {
    return res.status(404).end()
  }

  doc = fs.readFileSync(doc, {encoding: 'utf8'})

  res.render('document', {doc: doc})
})

router.get('/news/:id?-*', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(404).render('article', {article: null})
  }

  let article = await News.article(id)
  if (!article.id) {
    return res.status(404).render('article', {article: null})
  }

  res.render('article', {article: article})
}))

router.get('/news/', wrap(async (req, res) => {
  let page = parseInt(req.query.page)
  if (isNaN(page)) {
    page = 1
  }

  let news = await News.listNews(page)
  
  res.render('news', {news: news})
}))

/*
  =========
    OTHER
  =========
*/

router.get('/logout', wrap(async (req, res) => {
  if (req.session.user) {
    delete req.session.user
  }

  res.redirect('/')
}))

router.get('/activate/:token', wrap(async (req, res) => {
  if (req.session.user) return res.redirect('/login')
  let token = req.params.token

  let success = await API.User.Login.activationToken(token)
  if (!success) return formError(req, res, 'Unknown or invalid activation token')

  req.flash('message', {error: false, text: 'Your account has been activated! You may now log in.'})
  res.redirect('/login')
}))

router.use('/api', apiRouter)

router.use((err, req, res, next) => {
  console.error(err)
  next()
})

module.exports = router
