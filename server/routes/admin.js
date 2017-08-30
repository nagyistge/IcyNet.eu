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

router.get('/access', (req, res) => {
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
    req.session.accesstime = Date.now() + 600000 // 10 minutes
    return res.redirect('/admin')
  } else {
    req.flash('message', {error: true, text: 'Invalid password'})
  }

  next()
}))

// Ensure that the admin panel is not kept open for prolonged time
router.use(wrap(async (req, res, next) => {
  if (req.session.accesstime) {
    if (req.session.accesstime > Date.now()) {
      req.session.accesstime = Date.now() + 600000
      return next()
    }

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

  let users = await API.getAllUsers(page, req.session.user.id)
  res.jsonp(users)
}))

/* ===============
 *   OAuth2 Data
 * ===============
 */
apiRouter.get('/clients', wrap(async (req, res) => {
  let page = parseInt(req.query.page)
  if (isNaN(page) || page < 1) {
    page = 1
  }

  let clients = await API.getAllClients(page)
  res.jsonp(clients)
}))

apiRouter.get('/client/:id', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).jsonp({error: 'Invalid number'})
  }

  let client = await API.getClient(id)
  if (!client) return res.status(400).jsonp({error: 'Invalid client'})

  res.jsonp(client)
}))

apiRouter.post('/client/new', wrap(async (req, res) => {
  if (req.body.csrf !== req.session.csrf) {
    return res.status(400).jsonp({error: 'Invalid session'})
  }

  let update = await API.createClient(req.body, req.session.user)
  if (update.error) {
    return res.status(400).jsonp({error: update.error})
  }

  res.status(204).end()
}))

apiRouter.post('/client/update', wrap(async (req, res) => {
  let id = parseInt(req.body.id)

  if (!id || isNaN(id)) return res.status(400).jsonp({error: 'ID missing'})

  if (req.body.csrf !== req.session.csrf) {
    return res.status(400).jsonp({error: 'Invalid session'})
  }

  let update = await API.updateClient(id, req.body)
  if (update.error) {
    return res.status(400).jsonp({error: update.error})
  }

  res.status(204).end()
}))

apiRouter.post('/client/new_secret/:id', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).jsonp({error: 'Invalid number'})
  }

  let client = await API.newSecret(id)
  if (client.error) {
    return res.status(400).jsonp({error: client.error})
  }

  res.jsonp(client)
}))

apiRouter.post('/client/delete/:id', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).jsonp({error: 'Invalid number'})
  }

  let client = await API.removeClient(id)
  if (client.error) {
    return res.status(400).jsonp({error: client.error})
  }

  res.jsonp(client)
}))

/* ========
 *   Bans
 * ========
 */

apiRouter.get('/bans', wrap(async (req, res) => {
  let page = parseInt(req.query.page)
  if (isNaN(page) || page < 1) {
    page = 1
  }

  let bans = await API.getAllBans(page)
  res.jsonp(bans)
}))

apiRouter.post('/ban/pardon/:id', wrap(async (req, res) => {
  let id = parseInt(req.params.id)
  if (isNaN(id)) {
    return res.status(400).jsonp({error: 'Invalid number'})
  }

  let ban = await API.removeBan(id)
  if (ban.error) {
    return res.status(400).jsonp({error: ban.error})
  }

  res.jsonp(ban)
}))

apiRouter.post('/ban', wrap(async (req, res) => {
  if (!req.body.user_id) return res.status(400).jsonp({error: 'ID missing'})
  if (req.body.csrf !== req.session.csrf) {
    return res.status(400).jsonp({error: 'Invalid session'})
  }

  let result = await API.addBan(req.body, req.session.user.id)
  if (result.error) {
    return res.status(400).jsonp({error: result.error})
  }

  res.jsonp(result)
}))

apiRouter.use((err, req, res, next) => {
  console.error(err)
  return res.status(500).jsonp({error: 'Internal server error'})
})

router.use('/api', apiRouter)

module.exports = router
