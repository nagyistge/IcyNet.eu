import middleware from './middleware'
import controller from './controller'
import decision from './controller/decision'
import model from './model'

class OAuth2Provider {
  constructor () {
    this.bearer = middleware
    this.controller = controller
    this.decision = decision
    this.model = model
  }

  express () {
    return (req, res, next) => {
      console.debug('OAuth2 Injected into request')
      req.oauth2 = this
      next()
    }
  }
}

module.exports = OAuth2Provider
