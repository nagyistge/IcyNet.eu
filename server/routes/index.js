import express from 'express'
import parseurl from 'parseurl'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import API from '../api'

let router = express.Router()

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

/*
  ================
    RENDER VIEWS
  ================
*/
router.get('/', wrap(async (req, res) => {
  res.render('index')
}))

router.get('/login', wrap(async (req, res) => {
  if (req.session.user) {
    let uri = '/'
    if (req.session.redirectUri) {
      uri = req.session.redirectUri
      delete req.session.redirectUri
    }

    return res.redirect(uri)
  }

  res.render('login')
}))

router.get('/register', wrap(async (req, res) => {
  if (req.session.user) return res.redirect('/')

  let dataSave = req.flash('formkeep')
  if (dataSave.length) {
    dataSave = dataSave[0]
  } else {
    dataSave = {}
  }

  res.locals.formkeep = dataSave

  res.render('register')
}))

/*
  =================
    POST HANDLING
  =================
*/

function formError (req, res, error, path) {
  req.flash('formkeep', req.body || {})
  req.flash('message', {error: true, text: error})
  res.redirect(path || parseurl(req).path)
}

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

  // TODO: TOTP checks
  // TODO: Ban checks

  // Set session
  req.session.user = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    avatar_file: user.avatar_file
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

router.post('/register', wrap(async (req, res) => {
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

  // TODO: Add reCaptcha

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

router.get('/activate/:token', wrap(async (req, res) => {
  if (req.session.user) return res.redirect('/login')
  let token = req.params.token

  let success = await API.User.Login.activationToken(token)
  if (!success) return formError(req, res, 'Unknown or invalid activation token')

  req.flash('message', {error: false, text: 'Your account has been activated! You may now log in.'})
  res.redirect('/login')
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

router.use((err, req, res, next) => {
  console.error(err)
  next()
})

module.exports = router
