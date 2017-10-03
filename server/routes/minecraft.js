import express from 'express'
import wrap from '../../scripts/asyncRoute'
import Minecraft from '../api/minecraft'

let router = express.Router()

router.get('/', wrap(async (req, res) => {
  if (!req.session.user) {
    req.session.redirectUri = req.originalUrl
    return res.redirect('/login')
  }

  let token = await Minecraft.getToken(req.session.user)

  res.render('minecraft/index', {token: token.token, mcu: token.mcu})
}))

router.post('/verify/', wrap(async (req, res) => {
  if (!req.body.name || !req.body.uuid || !req.body.token) return res.status(400).jsonp({error: 'Missing field.'})

  let verify = await Minecraft.verifyToken(req.body.token, req.body.name, req.body.uuid)
  if (!verify) return res.status(400).jsonp({error: 'Already verified.'})

  res.status(200).end()
}))

module.exports = router
