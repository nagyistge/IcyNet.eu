module.exports = function (req, res, client, scope, user) {
  res.locals.client = client
  res.locals.scope = scope
  res.render('authorization')
}
