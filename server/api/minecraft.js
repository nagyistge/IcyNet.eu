import API from './index'
import Model from './models'
import crypto from 'crypto'

const mAPI = {
  getToken: async function (user) {
    user = await API.User.ensureObject(user)

    let verified = await Model.MinecraftMember.query().where('user_id', user.id)
    if (verified.length) return {token: null, mcu: verified[0]}

    let token = await Model.MinecraftToken.query().where('user_id', user.id)
    if (!token.length) {
      token = crypto.randomBytes(4).toString('hex')
      await Model.MinecraftToken.query().insert({
        token: token,
        user_id: user.id,
        created_at: new Date()
      })
    } else {
      token = token[0].token
    }

    return {token: token, mcu: null}
  },
  verifyToken: async function (raw, name, uuid) {
    let token = await Model.MinecraftToken.query().where('token', raw)
    if (!token.length) return null
    token = token[0]

    await Model.MinecraftMember.query().insert({
      uuid: uuid,
      name: name,
      user_id: token.user_id,
      created_at: new Date()
    })

    await Model.MinecraftToken.query().delete().where('id', token.id)

    return true
  }
}

module.exports = mAPI
