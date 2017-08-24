import error from '../error'
import response from '../response'
import wrap from '../../../../scripts/asyncRoute'

module.exports = wrap(async function (req, res) {
  let clientId = null
  let clientSecret = null

  if (req.body.client_id && req.body.client_secret) {
    clientId = req.body.client_id
    clientSecret = req.body.client_secret
    console.debug('Client credentials parsed from body parameters ', clientId, clientSecret)
  } else {
    if (!req.headers || !req.headers.authorization) {
      return response.error(req, res, new error.InvalidRequest('No authorization header passed'))
    }

    let pieces = req.headers.authorization.split(' ', 2)
    if (!pieces || pieces.length !== 2) {
      return response.error(req, res, new error.InvalidRequest('Authorization header is corrupted'))
    }

    if (pieces[0] !== 'Basic') {
      return response.error(req, res, new error.InvalidRequest('Unsupported authorization method:', pieces[0]))
    }

    pieces = Buffer.from(pieces[1], 'base64').toString('ascii').split(':', 2)
    if (!pieces || pieces.length !== 2) {
      return response.error(req, res, new error.InvalidRequest('Authorization header has corrupted data'))
    }

    clientId = pieces[0]
    clientSecret = pieces[1]
    console.debug('Client credentials parsed from basic auth header: ', clientId, clientSecret)
  }

  if (!req.body.token) {
    return response.error(req, res, new error.InvalidRequest('Token not provided in request body'))
  }

  let token = await req.oauth2.model.accessToken.fetchByToken(req.body.token)
  if (!token) {
    return response.error(req, res, new error.InvalidRequest('Token does not exist'))
  }

  let ttl = req.oauth2.model.accessToken.getTTL(token)
  let resObj = {
    token_type: 'bearer',
    token: token.token,
    expires_in: Math.floor(ttl / 1000)
  }

  response.data(req, res, resObj)
})
