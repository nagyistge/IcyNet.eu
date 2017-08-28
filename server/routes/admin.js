import express from 'express'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import {User} from '../api'
import API from '../api/admin'
import News from '../api/news'

const router = express.Router()
const apiRouter = express.Router()

// Check for privilege required to access the admin panel
router.use(wrap(async (req, res, next) => {
  if (!req.session.user) return res.redirect('/login')

  if (!req.session.privilege) {
    let u = await User.get(req.session.user)
    req.session.privilege = u.nw_privilege
  }

  if (req.session.user && req.session.privilege !== 5) {
    return res.redirect('/login')
  }

  res.locals.server_time = process.uptime()
  next()
}))

/* ================
 *   ASK PASSWORD
 * ================
 */

apiRouter.get('/access', (req, res) => {
  if (!req.session.accesstime || req.session.accesstime < Date.now()) {
    return res.status(401).jsonp({error: 'Access expired'})
  }

  res.jsonp({access: req.session.accesstime - Date.now()})
})

// Post password to continue
router.post('/', wrap(async (req, res, next) => {
  if (!req.body.password) return next()

  if (req.body.csrf !== req.session.csrf) {
    req.flash('message', {error: true, text: 'Invalid session token'})
    return next()
  }

  let passReady = await User.Login.password(req.session.user, req.body.password)
  if (passReady) {
    req.session.accesstime = Date.now() + 300000 // 5 minutes
    return res.redirect('/admin')
  } else {
    req.flash('message', {error: true, text: 'Invalid password'})
  }

  next()
}))

// Ensure that the admin panel is not kept open for prolonged time
router.use(wrap(async (req, res, next) => {
  if (req.session.accesstime) {
    if (req.session.accesstime > Date.now()) return next()
    delete req.session.accesstime
  }

  res.render('user/password', {post: '/admin'})
}))

/* =========
 *   VIEWS
 * =========
 */

router.get('/', (req, res) => {
  res.render('admin/index')
})

router.get('/oauth2', wrap(async (req, res) => {
  res.render('admin/oauth2')
}))

/* =======
 *   API
 * =======
 */

apiRouter.get('/users', wrap(async (req, res) => {
  let page = parseInt(req.query.page)
  if (isNaN(page) || page < 1) {
    page = 1
  }

  let users = await API.getAllUsers(page)
  res.jsonp(users)
}))

router.use('/api', apiRouter)

module.exports = router
