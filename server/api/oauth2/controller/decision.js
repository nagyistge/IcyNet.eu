module.exports = function (req, res, client, scope, user) {
  res.render('authorization', { client: client, scope: scope })
}
