import express from 'express'
import multiparty from 'multiparty'
import config from '../../scripts/load-config'
import wrap from '../../scripts/asyncRoute'
import API from '../api'
import News from '../api/news'
import Image from '../api/image'
import APIExtern from '../api/external'

const router = express.Router()
const apiRouter = express.Router()

router.use(wrap(async (req, res, next) => {
  if (!req.session.user) return res.redirect('/login')

  if (!req.session.privilege) {
    let u = await API.User.get(req.session.user)
    req.session.privilege = u.nw_privilege
  }

  if (req.session.user && req.session.privilege !== 5) {
    return res.redirect('/login')
  }

  res.locals.server_time = process.uptime()
  next()
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

router.use('/api', apiRouter)

module.exports = router
