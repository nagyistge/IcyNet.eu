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
import emailer from '../api/emailer'

import apiRouter from './api'
import oauthRouter from './oauth2'

let router = express.Router()

let accountLimiter = new RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  delayMs: 0,
  message: 'Whoa, slow down there, buddy! You just hit our rate limits. Try again in 1 hour.'
})

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
  let messages = req.flash('message')
  if (!messages || !messages.length) {
    messages = {}
  } else {
    messages = messages[0]
  }

  // Update user session every 30 minutes
  if (req.session.user) {
    if (!req.session.user.session_refresh) {
      req.session.user.session_refresh = Date.now() + 1800000
    }

    if (req.session.user.session_refresh < Date.now()) {
      let udata = await API.User.get(req.session.user.id)
      setSession(req, udata)
    }
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

  res.render('totp', { uri: newToken })
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

router.get('/user/manage', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')

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

  res.render('settings', {totp: totpEnabled, password: socialStatus.password})
}))

router.get('/user/manage/password', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  res.render('password_new')
}))

router.get('/user/manage/email', wrap(async (req, res) => {
  if (!req.session.user) return res.redirect('/login')

  let obfuscated = req.session.user.email
  if (obfuscated) {
    let split = obfuscated.split('@')
    let rep = split[0].charAt(0) + '***' + split[0].charAt(split[0].length - 1)
    obfuscated = rep + '@' + split[1]
  }

  res.render('email_change', {email: obfuscated})
}))

/*
  =================
    POST HANDLING
  =================
*/

function formError (req, res, error, redirect) {
  // Security measures: never store any passwords in any session
  for (let key in req.body) {
    if (key.indexOf('password') !== -1) {
      delete req.body[key]
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
    display_name: displayName,
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

  req.flash('message', {error: false, text: 'Settings changed successfully. Please note that it may take time to update on other websites and devices.'})
  res.redirect('/user/manage')
}))

router.post('/user/manage/password', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  if (!req.body.password_old) {
    return formError(req, res, 'Please enter your current password.')
  }

  let passwordMatch = await API.User.Login.password(req.session.user, req.body.password_old)
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

  let success = await API.User.update(req.session.user, {
    password: password
  })

  if (success.error) {
    return formError(req, res, success.error)
  }

  let user = req.session.user
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

router.post('/user/manage/email', wrap(async (req, res, next) => {
  if (!req.session.user) return next()

  if (req.body.csrf !== req.session.csrf) {
    return formError(req, res, 'Invalid session! Try reloading the page.')
  }

  let user = req.session.user
  let email = req.body.email
  let newEmail = req.body.email_new
  let password = req.body.password

  if (!password || !newEmail || (!email && user.email != null)) {
    return formError(req, res, 'Please fill in all of the fields.')
  }

  if (req.session.user.email != null && email !== user.email) {
    return formError(req, res, 'The email you provided is incorrect.')
  }

  let passwordMatch = await API.User.Login.password(user, password)
  if (!passwordMatch) {
    return formError(req, res, 'The password you provided is incorrect.')
  }

  let emailValid = API.User.Register.validateEmail(newEmail)
  if (!emailValid) {
    return formError(req, res, 'Invalid email address.')
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

const docsDir = path.join(__dirname, '../../documents')
router.get('/docs/:name', (req, res, next) => {
  let doc = path.join(docsDir, req.params.name + '.html')
  if (!fs.existsSync(docsDir) || !fs.existsSync(doc)) {
    return next()
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

router.use((req, res) => {
  res.status(404).render('404')
})

router.use((err, req, res, next) => {
  console.error(err)
  next()
})

module.exports = router
