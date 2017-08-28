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
      $('.pgn .button').click(function (e) {
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
    }
  })
}

$(document).ready(function () {
  if ($('#userlist').length) {
    loadUsers(1)
  }

  setInterval(function () {
    $.get({
      url: '/admin/api/access',
      success: function (data) {
        if (data && data.access) return
        window.location.reload()
      }
    })
  }, 30000)
})
