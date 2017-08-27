import fs from 'fs'
import path from 'path'
import express from 'express'
import RateLimit from 'express-rate-limit'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import http from '../../scripts/http'
import API from '../api'
import News from '../api/news'
import emailer from '../api/emailer'

import apiRouter from './api'
import oauthRouter from './oauth2'

let router = express.Router()

// Restrict account creation
let accountLimiter = new RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  delayMs: 0,
  message: 'Whoa, slow down there, buddy! You just hit our rate limits. Try again in 1 hour.'
})

// Set the user session
function setSession (req, user) {
  req.session.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_file: user.avatar_file,
    session_refresh: Date.now() + 1800000 // 30 minutes
  }
}

router.use(wrap(async (req, res, next) => {
  // Add form messages into the template rendering if present
  let messages = req.flash('message')
  if (!messages || !messages.length) {
    messages = {}
  } else {
    messages = messages[0]
  }

  res.locals.message = messages

  // Update user session every 30 minutes
  if (req.session.user) {
    if (!req.session.user.session_refresh) {
      req.session.user.session_refresh = Date.now() + 1800000
    }

    if (req.session.user.session_refresh < Date.now()) {
      // Check for ban
      let banStatus = await API.User.getBanStatus(req.session.user.id)

      if (banStatus.length) {
        delete req.session.user
        return next()
      }

      // Update user session
      let udata = await API.User.get(req.session.user.id)
      setSession(req, udata)
    }
  }

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

// Make sure the user is logged in
// Redirect to login page and store the current path in the session for redirecting later
function ensureLogin (req, res, next) {
  if (req.session.user) return next()
  req.session.redirectUri = req.originalUrl
  res.redirect('/login')
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

  res.render('user/login')
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

  res.render('user/register')
})

// View for enabling Two-Factor Authentication
router.get('/user/two-factor', ensureLogin, wrap(async (req, res) => {
  let twoFaEnabled = await API.User.Login.totpTokenRequired(req.session.user)
  if (twoFaEnabled) return res.redirect('/')

  let newToken = await API.User.Login.totpAquire(req.session.user)
  if (!newToken) return res.redirect('/')

  res.render('user/totp', { uri: newToken })
}))

// View for disabling Two-Factor Authentication
router.get('/user/two-factor/disable', ensureLogin, wrap(async (req, res) => {
  let twoFaEnabled = await API.User.Login.totpTokenRequired(req.session.user)

  if (!twoFaEnabled) return res.redirect('/')
  res.render('user/password')
}))

// Two-Factor Authentication verification on login
router.get('/login/verify', (req, res) => {
  res.render('user/totp-check')
})

// User settings page
router.get('/user/manage', ensureLogin, wrap(async (req, res) => {
  let totpEnabled = false
  let socialStatus = await API.User.socialStatus(req.session.user)

  if (socialStatus.password) {
    totpEnabled = await API.User.Login.totpTokenRequired(req.session.user)
  }

  if (config.twitter && config.twitter.api) {
    if (!socialStatus.enabled.twitter) {
      res.locals.twitter_auth = true
    } else if (!socialStatus.source && socialStatus.source !== 'twitter') {
      res.locals.twitter_auth = false
    }
  }

  if (config.discord && config.discord.api) {
    if (!socialStatus.enabled.discord) {
      res.locals.discord_auth = true
    } else if (!socialStatus.source && socialStatus.source !== 'discord') {
      res.locals.discord_auth = false
    }
  }

  if (config.facebook && config.facebook.client) {
    if (!socialStatus.enabled.fb) {
      res.locals.facebook_auth = config.facebook.client
    } else if (!socialStatus.source && socialStatus.source !== 'fb') {
      res.locals.facebook_auth = false
    }
  }

  res.render('user/settings', {totp: totpEnabled, password: socialStatus.password})
}))

// Change password
router.get('/user/manage/password', ensureLogin, wrap(async (req, res) => {
  res.render('user/password_new')
}))

// Change email
router.get('/user/manage/email', ensureLogin, wrap(async (req, res) => {
  let obfuscated = req.session.user.email
  if (obfuscated) {
    let split = obfuscated.split('@')
    let rep = split[0].charAt(0) + '***' + split[0].charAt(split[0].length - 1)
    obfuscated = rep + '@' + split[1]
  }

  let socialStatus = await API.User.socialStatus(req.session.user)

  res.render('user/email_change', {email: obfuscated, password: socialStatus.password})
}))

router.get('/donate', wrap(async (req, res, next) => {
  if (!config.donations || !config.donations.business) return next()
  res.render('donate', config.donations)
}))

/*
  =================
    POST HANDLING
  =================
*/

// Used to display errors on forms and save data
function formError (req, res, error, redirect) {
  // Security measures: never store any passwords in any session
  for (let key in req.body) {
    if (key.indexOf('password') !== -1) {
      delete req.body[key]
    }
  }

  req.flash('formkeep', req.body || {})
  req.flash('message', {error: true, text: error})
  res.redirect(redirect || req.originalUrl)
}

// Make sure characters are UTF-8
function cleanString (input) {
  let output = ''
  for (let i = 0; i < input.length; i++) {
    output += input.charCodeAt(i) <= 127 ? input.charAt(i) : ''
  }
  return output
}

// Enabling 2fa
router.post('/user/two-factor', wrap(async (req, res, next) => {
  if (!req.session.user) return next()
  if (!req.body.code) {
    return formError(req, res, 'You need to enter the code.')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let verified = await API.User.Login.totpCheck(req.session.user, req.body.code)
  if (!verified) {
    return formError(req, res, 'Something went wrong! Try scanning the code again.')
  }

  res.redirect('/')
}))

// Disabling 2fa
router.post('/user/two-factor/disable', wrap(async (req, res, next) => {
  if (!req.session.user) return next()
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

// Verify 2FA for login
router.post('/login/verify', wrap(async (req, res, next) => {
  if (req.session.user) return next()
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

// Log the user in
router.post('/login', wrap(async (req, res, next) => {
  if (req.session.user) return next()
  if (!req.body.username || !req.body.password || req.body.username === '') {
    return res.redirect('/login')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let user = await API.User.get(req.body.username)
  if (!user) return formError(req, res, 'Invalid username or password.')

  if (!user.password || user.password === '') return formError(req, res, 'Please log in using the buttons on the right.')

  let pwMatch = await API.User.Login.password(user, req.body.password)
  if (!pwMatch) return formError(req, res, 'Invalid username or password.')

  if (user.activated === 0) return formError(req, res, 'Please activate your account first.')
  if (user.locked === 1) return formError(req, res, 'This account has been locked.')

  // Check if the user is banned
  let banStatus = await API.User.getBanStatus(user.id)
  if (banStatus.length) {
    return res.render('user/banned', {bans: banStatus, ipban: false})
  }

  // Redirect to the verification dialog if 2FA is enabled
  let totpRequired = await API.User.Login.totpTokenRequired(user)
  if (totpRequired) {
    req.session.totp_check = user.id
    return res.redirect('/login/verify')
  }

  // Set session
  setSession(req, user)

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

// Protected & Limited resource: Account registration
router.post('/register', accountLimiter, wrap(async (req, res, next) => {
  if (req.session.user) return next()
  if (!req.body.username || !req.body.display_name || !req.body.password || !req.body.email) {
    return formError(req, res, 'Please fill in all the fields.')
  }

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  // 1st Check: Username Characters and length
  let username = req.body.username
  if (!username || !username.match(/^([\w-_]{3,26})$/i)) {
    return formError(req, res, 'Invalid username! Must be between 3-26 characters and composed of alphanumeric characters!')
  }

  // 2nd Check: Display Name
  let displayName = req.body.display_name
  if (!displayName || !displayName.match(/^([^\\`]{3,32})$/i)) {
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
    display_name: cleanString(displayName),
    password: hash,
    email: email,
    ip_address: req.realIP
  })

  if (!newUser || newUser.error != null) {
    return formError(req, res, newUser.error)
  }

  // Do not include activation link message when the user is already activated
  let registerMessage = 'Account created successfully!'
  if (newUser.user && newUser.user.activated !== 1) {
    registerMessage += ' Please check your email for an activation link.'
  }

  req.flash('message', {error: false, text: registerMessage})
  res.redirect('/login')
}))

// Change display name
router.post('/user/manage', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  if (!req.body.display_name) {
    return formError(req, res, 'Display Name cannot be blank.')
  }

  let displayName = req.body.display_name
  if (!displayName || !displayName.match(/^([^\\`]{3,32})$/i)) {
    return formError(req, res, 'Invalid display name!')
  }

  displayName = cleanString(displayName)

  // No change
  if (displayName === req.session.user.display_name) {
    return res.redirect('/user/manage')
  }

  let success = await API.User.update(req.session.user, {
    display_name: displayName
  })

  if (success.error) {
    return formError(req, res, success.error)
  }

  req.session.user.display_name = displayName

  req.flash('message', {error: false, text: 'Settings changed successfully.'})
  res.redirect('/user/manage')
}))

// Change user password
router.post('/user/manage/password', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  if (!req.body.password_old) {
    return formError(req, res, 'Please enter your current password.')
  }

  let user = req.session.user
  let passwordMatch = await API.User.Login.password(user, req.body.password_old)
  if (!passwordMatch) {
    return formError(req, res, 'The password you provided is incorrect.')
  }

  let password = req.body.password
  if (!password || password.length < 8 || password.length > 32) {
    return formError(req, res, 'Invalid password! Keep it between 8 and 32 characters!')
  }

  let passwordAgain = req.body.password_repeat
  if (!passwordAgain || password !== passwordAgain) {
    return formError(req, res, 'The passwords do not match!')
  }

  password = await API.User.Register.hashPassword(password)

  let success = await API.User.update(user, {
    password: password
  })

  if (success.error) {
    return formError(req, res, success.error)
  }

  console.warn('[SECURITY AUDIT] User \'%s\' password has been changed from %s', user.username, req.realIP)

  if (config.email && config.email.enabled) {
    await emailer.pushMail('password_alert', user.email, {
      display_name: user.display_name,
      ip: req.realIP
    })
  }

  req.flash('message', {error: false, text: 'Password changed successfully.'})
  return res.redirect('/user/manage')
}))

// Change email address
router.post('/user/manage/email', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let user = await API.User.get(req.session.user)
  let email = req.body.email
  let newEmail = req.body.email_new
  let password = req.body.password

  if (!newEmail || (!email && user.email !== '')) {
    return formError(req, res, 'Please fill in all of the fields.')
  }

  if (req.session.user.email !== '' && email !== user.email) {
    return formError(req, res, 'The email you provided is incorrect.')
  }

  if (user.password != null && user.password !== '') {
    if (!password) {
      return formError(req, res, 'Enter a password.')
    }

    let passwordMatch = await API.User.Login.password(user, password)
    if (!passwordMatch) {
      return formError(req, res, 'The password you provided is incorrect.')
    }
  }

  let emailValid = API.User.Register.validateEmail(newEmail)
  if (!emailValid) {
    return formError(req, res, 'Invalid email address.')
  }

  let emailTaken = await API.User.get(newEmail)
  if (emailTaken) {
    return formError(req, res, 'This email is already taken.')
  }

  let success = await API.User.update(user, {
    email: newEmail
  })

  if (success.error) {
    return formError(req, res, success.error)
  }

  // TODO: Send necessary emails
  console.warn('[SECURITY AUDIT] User \'%s\' email has been changed from %s', user.username, req.realIP)

  req.session.user.email = newEmail

  req.flash('message', {error: false, text: 'Email changed successfully.'})
  return res.redirect('/user/manage')
}))

/*
  =============
    DOCUMENTS
  =============
*/

// Serve a document form the documents directory, cache it.
const docsDir = path.join(__dirname, '../../documents')
router.get('/docs/:name', (req, res, next) => {
  let doc = path.join(docsDir, req.params.name + '.html')
  if (!fs.existsSync(docsDir) || !fs.existsSync(doc)) {
    return next()
  }

  try {
    doc = fs.readFileSync(doc, {encoding: 'utf8'})
  } catch (e) {
    return next(e)
  }

  res.header('Cache-Control', 'max-age=' + 7 * 24 * 60 * 60 * 1000) // 1 week
  res.render('document', {doc: doc})
})

// Serve news
router.get('/news/:id?-*', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(404).render('article', {article: null})
  }

  let article = await News.article(id)
  if (!article.id) {
    return res.status(404).render('article', {article: null})
  }

  res.header('Cache-Control', 'max-age=' + 24 * 60 * 60 * 1000) // 1 day
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

// Render partials
router.get('/partials/:view', wrap(async (req, res, next) => {
  if (!req.params.view) return next()

  res.render('user/partials/' + req.params.view)
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

// User activation endpoint (emailed link)
router.get('/activate/:token', wrap(async (req, res) => {
  if (req.session.user) return res.redirect('/login')
  let token = req.params.token

  let success = await API.User.Login.activationToken(token)
  if (!success) return formError(req, res, 'Unknown or invalid activation token')

  req.flash('message', {error: false, text: 'Your account has been activated! You may now log in.'})
  res.redirect('/login')
}))

router.use('/api', apiRouter)

/*
  NO ROUTES BEYOND THIS POINT
*/

// Handle 'Failed to lookup view' errors
router.use((err, req, res, next) => {
  if (err && err.stack) {
    if (err.stack.indexOf('Failed to lookup view') !== -1) {
      return next() // To 404
    }
  }

  next(err) // To error handler
})

// 404 - last route
router.use((req, res) => {
  res.status(404).render('404')
})

// Error handler
router.use((err, req, res, next) => {
  console.error(err)

  if (process.env.NODE_ENV !== 'production') {
    return res.end(err.stack)
  }

  next()
})

module.exports = router
