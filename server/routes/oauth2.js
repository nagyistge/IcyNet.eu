import express from 'express'
import uapi from '../api'
import OAuth2 from '../api/oauth2'
import RateLimit from 'express-rate-limit'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'

let router = express.Router()
let oauth = new OAuth2()

router.use(oauth.express())

let oauthLimiter = new RateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  delayMs: 0
})

router.use(oauthLimiter)

function ensureLoggedIn (req, res, next) {
  if (req.session.user) {
    next()
  } else {
    req.session.redirectUri = req.originalUrl
    res.redirect('/login')
  }
}

router.use('/authorize', ensureLoggedIn, oauth.controller.authorization)
router.post('/token', oauth.controller.token)
router.post('/introspect', oauth.controller.introspection)

router.get('/user', oauth.bearer, wrap(async (req, res) => {
  let accessToken = req.oauth2.accessToken
  let user = await uapi.User.get(accessToken.user_id)
  if (!user) {
    return res.status(404).jsonp({
      error: 'No such user'
    })
  }

  let udata = {
    id: user.id,
    name: user.display_name,
    avatar_file: user.avatar_file
  }

  if (accessToken.scope.indexOf('email') != -1) {
    udata.email = user.email
  }

  if (accessToken.scope.indexOf('privilege') != -1) {
    udata.privilege = user.nw_privilege
  }

  res.jsonp(udata)
}))

router.use((err, req, res, next) => {
  if (err && err instanceof oauth.error) {
    return oauth.response.error(req, res, err, req.body.redirectUri)
  }

  next()
})

module.exports = router
