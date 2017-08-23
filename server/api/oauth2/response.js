import query from 'querystring'
import error from './error'

function data (req, res, code, data) {
  res.header('Cache-Control', 'no-store')
  res.header('Pragma', 'no-cache')
  res.status(code).send(data)
  console.debug('Response: ', data)
}

function redirect (req, res, redirectUri) {
  res.header('Location', redirectUri)
  res.status(302).end()
  console.debug('Redirecting to ', redirectUri)
}

module.exports.error = function (req, res, err, redirectUri) {
  // Transform unknown error
  if (!(err instanceof error.OAuth2Error)) {
    console.error(err.stack)
    err = new error.ServerError('Uncaught exception')
  } else {
    console.error('Exception caught', err.stack)
  }

  if (redirectUri) {
    let obj = {
      error: err.code,
      error_description: err.message
    }

    if (req.query.state) {
      obj.state = req.query.state
    }

    redirectUri += '?' + query.stringify(obj)
    redirect(req, res, redirectUri)
  } else {
    data(req, res, err.status, {error: err.code, error_description: err.message})
  }
}

module.exports.data = function (req, res, obj, redirectUri, anchor) {
  if (redirectUri) {
    if (anchor) {
      redirectUri += '#'
    } else {
      redirectUri += (redirectUri.indexOf('?') === -1 ? '?' : '&')
    }

    if (req.query.state) {
      obj.state = req.query.state
    }

    redirectUri += query.stringify(obj)
    redirect(req, res, redirectUri)
  } else {
    data(req, res, 200, obj)
  }
}
