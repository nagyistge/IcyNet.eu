class OAuth2Error extends Error {
  constructor (code, msg, status) {
    super()
    Error.captureStackTrace(this, this.constructor)

    this.code = code
    this.message = msg
    this.status = status

    this.name = 'OAuth2AbstractError'
    this.logLevel = 'error'
  }
}

class AccessDenied extends OAuth2Error {
  constructor (msg) {
    super('access_denied', msg, 403)

    this.name = 'OAuth2AccessDenied'
    this.logLevel = 'info'
  }
}

class InvalidClient extends OAuth2Error {
  constructor (msg) {
    super('invalid_client', msg, 401)

    this.name = 'OAuth2InvalidClient'
    this.logLevel = 'info'
  }
}

class InvalidGrant extends OAuth2Error {
  constructor (msg) {
    super('invalid_grant', msg, 400)

    this.name = 'OAuth2InvalidGrant'
    this.logLevel = 'info'
  }
}

class InvalidRequest extends OAuth2Error {
  constructor (msg) {
    super('invalid_request', msg, 400)

    this.name = 'OAuth2InvalidRequest'
    this.logLevel = 'info'
  }
}

class InvalidScope extends OAuth2Error {
  constructor (msg) {
    super('invalid_scope', msg, 400)

    this.name = 'OAuth2InvalidScope'
    this.logLevel = 'info'
  }
}

class ServerError extends OAuth2Error {
  constructor (msg) {
    super('server_error', msg, 500)

    this.name = 'OAuth2ServerError'
    this.logLevel = 'error'
  }
}

class UnauthorizedClient extends OAuth2Error {
  constructor (msg) {
    super('unauthorized_client', msg, 400)

    this.name = 'OAuth2UnauthorizedClient'
    this.logLevel = 'info'
  }
}

class UnsupportedGrantType extends OAuth2Error {
  constructor (msg) {
    super('unsupported_grant_type', msg, 400)

    this.name = 'OAuth2UnsupportedGrantType'
    this.logLevel = 'info'
  }
}

class UnsupportedResponseType extends OAuth2Error {
  constructor (msg) {
    super('unsupported_response_type', msg, 400)

    this.name = 'OAuth2UnsupportedResponseType'
    this.logLevel = 'info'
  }
}

module.exports = {
  OAuth2Error: OAuth2Error,
  AccessDenied: AccessDenied,
  InvalidClient: InvalidClient,
  InvalidGrant: InvalidGrant,
  InvalidRequest: InvalidRequest,
  InvalidScope: InvalidScope,
  ServerError: ServerError,
  UnauthorizedClient: UnauthorizedClient,
  UnsupportedGrantType: UnsupportedGrantType,
  UnsupportedResponseType: UnsupportedResponseType
}
