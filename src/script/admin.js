window.$ = require('jquery')
var Mustache = require('mustache')

function buildTemplateScript (id, ctx) {
  var tmpl = $('#' + id)
  if (!tmpl.length) return null
  var data = tmpl.html()
  Mustache.parse(data)
  return Mustache.render(data, ctx)
}

function paginationButton (pages) {
  var html = '<div class="pgn">'
  html += '<span class="pagenum">Page ' + pages.page + ' of ' + pages.pages + '</span>'
  if (pages.page > 1) {
    html += '<div class="button" data-page="' + (pages.page - 1) + '">Previous</div>'
  }
  for (var i = 0; i < pages.pages; i++) {
    html += '<div class="button" data-page="' + (i + 1) + '">' + (i + 1) + '</div>'
  }
  if (pages.pages > pages.page) {
    html += '<div class="button" data-page="' + (pages.page + 1) + '">Next</div>'
  }
  html += '</div>'
  return html
}

function banUser (id) {
  window.Dialog.openTemplate('Ban User', 'banNew', {id: id})
  $('#fnsubmit').submit(function (e) {
    e.preventDefault()
    $.post({
      url: '/admin/api/ban',
      data: $(this).serialize(),
      success: function (data) {
        window.Dialog.close()
        loadBans(1)
      },
      error: function (e) {
        if (e.responseJSON && e.responseJSON.error) {
          $('form .message').show()
          $('form .message').text(e.responseJSON.error)
        }
      }
    })
  })
}

function loadBans (page) {
  $.ajax({
    type: 'get',
    url: '/admin/api/bans',
    data: {page: page},
    success: function (data) {
      $('#banlist').html('')
      if (data.error) {
        $('#banlist').html('<div class="message">' + data.error + '</div>')
        return
      }

      var pgbtn = paginationButton(data.page)
      $('#banlist').append(pgbtn)
      $('#banlist .pgn .button').click(function (e) {
        var pgnum = $(this).data('page')
        if (pgnum == null) return
        loadBans(parseInt(pgnum))
      })

      for (var u in data.bans) {
        var ban = data.bans[u]
        ban.created_at = new Date(ban.created_at)
        ban.expires_at = ban.expires_at === null ? 'Never' : new Date(ban.expires_at)
        var tmp = buildTemplateScript('ban', ban)
        $('#banlist').append(tmp)
      }

      $('#banlist .remove').click(function (e) {
        $.post({
          url: '/admin/api/ban/pardon/' + parseInt($(this).data('id')),
          success: function (data) {
            loadBans(1)
          }
        })
      })
    }
  })
}

function loadUsers (page) {
  $.ajax({
    type: 'get',
    url: '/admin/api/users',
    data: {page: page},
    success: function (data) {
      $('#userlist').html('')
      if (data.error) {
        $('#userlist').html('<div class="message error">' + data.error + '</div>')
        return
      }

      var pgbtn = paginationButton(data.page)
      $('#userlist').append(pgbtn)
      $('#userlist .pgn .button').click(function (e) {
        var pgnum = $(this).data('page')
        if (pgnum == null) return
        loadUsers(parseInt(pgnum))
      })

      for (var u in data.users) {
        var user = data.users[u]
        user.created_at = new Date(user.created_at)
        var tmp = buildTemplateScript('user', user)
        $('#userlist').append(tmp)
      }

      $('#userlist .ban').click(function (e) {
        banUser(parseInt($(this).data('id')))
      })
    }
  })
}

function editClient (id) {
  $.ajax({
    type: 'get',
    url: '/admin/api/client/' + id,
    success: function (data) {
      window.Dialog.openTemplate('Editing client', 'clientEdit', data)
      $('#ffsubmit').submit(function (e) {
        e.preventDefault()
        $.ajax({
          type: 'post',
          url: '/admin/api/client/update',
          data: $(this).serialize(),
          success: function (data) {
            window.Dialog.close()
            loadClients(1)
          },
          error: function (e) {
            if (e.responseJSON && e.responseJSON.error) {
              $('form .message').show()
              $('form .message').text(e.responseJSON.error)
            }
          }
        })
      })
    }
  })
}

function deleteClient (id) {
  window.Dialog.openTemplate('Deleting client', 'clientRemove')
  $('#fremove').click(function (e) {
    $.post({
      url: '/admin/api/client/delete/' + id,
      success: function (data) {
        window.Dialog.close()
        loadClients(1)
      }
    })
  })
}

function loadClients (page) {
  $.ajax({
    type: 'get',
    url: '/admin/api/clients',
    data: {page: page},
    success: function (data) {
      $('#clientlist').html('')
      if (data.error) {
        $('#clientlist').html('<div class="message error">' + data.error + '</div>')
        return
      }

      var pgbtn = paginationButton(data.page)
      $('#clientlist').append(pgbtn)
      $('#clientlist .pgn .button').click(function (e) {
        var pgnum = $(this).data('page')
        if (pgnum == null) return
        loadClients(parseInt(pgnum))
      })

      for (var u in data.clients) {
        var client = data.clients[u]
        client.created_at = new Date(client.created_at)
        var tmp = buildTemplateScript('client', client)
        $('#clientlist').append(tmp)
      }

      $('#clientlist .edit').click(function (e) {
        var client = $(this).data('client')
        editClient(parseInt(client))
      })

      $('#clientlist .delete').click(function (e) {
        var client = $(this).data('client')
        deleteClient(parseInt(client))
      })

      $('#clientlist .newsecret').click(function (e) {
        var client = $(this).data('client')
        $.post({
          url: '/admin/api/client/new_secret/' + parseInt(client),
          success: function (e) {
            loadClients(1)
          }
        })
      })
    }
  })
}

$(document).ready(function () {
  window.Dialog = $('#dialog')
  window.Dialog.open = function (title, content, pad) {
    $('#dialog #title').text(title)
    if (pad) {
      content = '<div class="pad">' + content + '</div>'
    }
    $('#dialog #content').html(content)
    $('#dialog').fadeIn()
  }

  window.Dialog.close = function () {
    $('#dialog').fadeOut('fast', function () {
      $('#dialog #content').html('')
    })
  }

  window.Dialog.openTemplate = function (title, template, data = {}) {
    window.Dialog.open(title, buildTemplateScript(template, data), true)
  }

  $('#dialog #close').click(function (e) {
    window.Dialog.close()
  })

  if ($('#userlist').length) {
    loadUsers(1)
  }

  if ($('#banlist').length) {
    loadBans(1)
  }

  if ($('#clientlist').length) {
    loadClients(1)

    $('#new').click(function (e) {
      window.Dialog.openTemplate('New Client', 'clientNew')
      $('#fnsubmit').submit(function (e) {
        e.preventDefault()
        $.post({
          url: '/admin/api/client/new',
          data: $(this).serialize(),
          success: function (data) {
            window.Dialog.close()
            loadClients(1)
          },
          error: function (e) {
            if (e.responseJSON && e.responseJSON.error) {
              $('form .message').show()
              $('form .message').text(e.responseJSON.error)
            }
          }
        })
      })
    })
  }

  setInterval(function () {
    $.get({
      url: '/admin/access',
      success: function (data) {
        if (data && data.access) return
        window.location.reload()
      }
    })
  }, 30000)
})
