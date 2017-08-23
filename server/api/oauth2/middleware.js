import response from './response'
import error from './error'
import wrap from '../../../scripts/asyncRoute'

const middleware = wrap(async function (req, res, next) {
  console.debug('Parsing bearer token')
  let token = null

  // Look for token in header
  if (req.headers.authorization) {
    const pieces = req.headers.authorization.split(' ', 2)

    // Check authorization header
    if (!pieces || pieces.length !== 2) {
      return response.error(req, res, new error.AccessDenied('Wrong authorization header'))
    }

    // Only bearer auth is supported
    if (pieces[0].toLowerCase() !== 'bearer') {
      return response.error(req, res, new error.AccessDenied('Unsupported authorization method in header'))
    }

    token = pieces[1]
    console.debug('Bearer token parsed from authorization header:', token)
  } else if (req.query && req.query['access_token']) {
    token = req.query['access_token']
    console.debug('Bearer token parsed from query params:', token)
  } else if (req.body && req.body['access_token']) {
    token = req.body['access_token']
    console.debug('Bearer token parsed from body params:', token)
  } else {
    return response.error(req, res, new error.AccessDenied('Bearer token not found'))
  }

  // Try to fetch access token
  let object = await req.oauth2.model.accessToken.fetchByToken(token)
  if (!object) {
    response.error(req, res, new error.Forbidden('Token not found or has expired'))
  } else if (!req.oauth2.model.accessToken.checkTTL(object)) {
    response.error(req, res, new error.Forbidden('Token is expired'))
  } else {
    req.oauth2.accessToken = object
    console.debug('AccessToken fetched', object)
    next()
  }
})

module.exports = middleware
