import error from '../../error'
import model from '../../model'

module.exports = async (req, res, client, scope, user, redirectUri, createAllowFuture) => {
  let codeValue = null

  if (req.method === 'POST' && req.session.csrf && !(req.body.csrf && req.body.csrf === req.session.csrf)) {
    throw new error.InvalidRequest('Invalid session')
  }

  if (createAllowFuture) {
    if (!req.body || (typeof req.body['decision']) === 'undefined') {
      throw new error.InvalidRequest('No decision parameter passed')
    } else if (req.body['decision'] === '0') {
      throw new error.AccessDenied('User denied access to the resource')
    } else {
      console.debug('Decision check passed')
    }

    await model.user.allowClient(user.id, client.id, scope)
  }

  try {
    codeValue = await req.oauth2.model.code.create(req.oauth2.model.user.getId(user),
      req.oauth2.model.client.getId(client), scope, req.oauth2.model.code.ttl)
  } catch (err) {
    console.error(err)
    throw new error.ServerError('Failed to call code.create function')
  }

  return codeValue
}
