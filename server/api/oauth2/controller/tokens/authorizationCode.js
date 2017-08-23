import error from '../../error'

module.exports = async (oauth2, client, providedCode, redirectUri) => {
  let respObj = {
    token_type: 'bearer'
  }

  let code = null

  try {
    code = await oauth2.model.code.fetchByCode(providedCode)
  } catch (err) {
    throw new error.ServerError('Failed to call code.fetchByCode function')
  }

  if (code) {
    if (oauth2.model.code.getClientId(code) !== oauth2.model.client.getId(client)) {
      throw new error.InvalidGrant('Code was issued by another client')
    }

    if (!oauth2.model.code.checkTTL(code)) {
      throw new error.InvalidGrant('Code has already expired')
    }
  } else {
    throw new error.InvalidGrant('Code not found')
  }

  console.debug('Code fetched ', code)

  try {
    await oauth2.model.refreshToken.removeByUserIdClientId(oauth2.model.code.getUserId(code), oauth2.model.code.getClientId(code))
  } catch (err) {
    console.error(err)
    throw new error.ServerError('Failed to call refreshToken.removeByUserIdClientId function')
  }

  console.debug('Refresh token removed')

  if (!oauth2.model.client.checkGrantType(client, 'refresh_token')) {
    console.debug('Client does not allow grant type refresh_token, skip creation')
  } else {
    try {
      respObj.refresh_token = await oauth2.model.refreshToken.create(oauth2.model.code.getUserId(code), oauth2.model.code.getClientId(code), oauth2.model.code.getScope(code))
    } catch (err) {
      console.error(err)
      throw new error.ServerError('Failed to call refreshToken.create function')
    }
  }

  try {
    respObj.access_token = await oauth2.model.accessToken.create(oauth2.model.code.getUserId(code), oauth2.model.code.getClientId(code), oauth2.model.code.getScope(code), oauth2.model.accessToken.ttl)
  } catch (err) {
    console.error(err)
    throw new error.ServerError('Failed to call accessToken.create function')
  }

  respObj.expires_in = oauth2.model.accessToken.ttl
  console.debug('Access token saved: ', respObj.access_token)

  try {
    await oauth2.model.code.removeByCode(providedCode)
  } catch (err) {
    console.error(err)
    throw new error.ServerError('Failed to call code.removeByCode function')
  }

  return respObj
}
