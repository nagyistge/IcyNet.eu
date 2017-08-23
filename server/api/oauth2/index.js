import middleware from './middleware'
import controller from './controller'
import decision from './controller/decision'
import response from './response'
import error from './error'
import model from './model'

class OAuth2Provider {
  constructor () {
    this.bearer = middleware
    this.controller = controller
    this.decision = decision
    this.response = response
    this.error = error.OAuth2Error
    this.model = model
  }

  express () {
    return (req, res, next) => {
      console.debug('attached')
      req.oauth2 = this
      next()
    }
  }
}

module.exports = OAuth2Provider
