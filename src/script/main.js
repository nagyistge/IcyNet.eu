window.$ = require('jquery')

$(document).ready(function () {
  function pwcheck (e) {
    var pw = $('#password').val()
    var pwa = $('#password_repeat').val()
    if (pwa !== pw) {
      $('#password_repeat').addClass('invalid')
      $('#repeatcheck').show()
      $('#repeatcheck').html('<span class="error">The passwords do not match.</span>')
    } else {
      $('#password_repeat').removeClass('invalid')
      $('#repeatcheck').hide()
      $('#repeatcheck').html('')
    }
  }

  // http://www.xtf.dk/2011/08/center-new-popup-window-even-on.html
  function PopupCenter (url, title, w, h) {
    // Fixes dual-screen position                         Most browsers      Firefox
    var dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left
    var dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top

    var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width
    var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height

    var left = ((width / 2) - (w / 2)) + dualScreenLeft
    var top = ((height / 2) - (h / 2)) + dualScreenTop
    var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)

    // Puts focus on the newWindow
    if (window.focus) {
      newWindow.focus()
    }

    return newWindow
  }

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

  window.Dialog.openPartial = function (title, partial) {
    $.get({
      url: '/partials/' + partial,
      success: function (html) {
        window.Dialog.open(title, html, false)
      }
    }).fail(function (e) {
      console.error(e)
    })
  }

  $('#dialog #close').click(function (e) {
    window.Dialog.close()
  })

  if (window.location.hash) {
    var locha = window.location.hash
    if ($(locha).length) {
      $(window).scrollTop($(locha).offset().top - $('.navigator').innerHeight() * 2)
    }
  }

  $(window).on('scroll', function () {
    if ($(window).scrollTop() >= $('.banner').innerHeight()) {
      $('.anchor').css('height', $('.navigator').innerHeight() + 'px')
      $('#navlogo').removeClass('hidden')
      $('.navigator').addClass('fix')
    } else {
      $('#navlogo').addClass('hidden')
      $('.navigator').removeClass('fix')
      $('.anchor').css('height', '0px')
    }
  })

  if ($(window).scrollTop() >= $('.banner').innerHeight()) {
    $('#navlogo').removeClass('hidden')
    $('.navigator').addClass('fix')
    $('.anchor').css('height', $('.navigator').innerHeight() + 'px')
  }

  $('a[href*=\\#]').on('click', function (e) {
    if (!$(this.hash).length) return
    e.preventDefault()

    var dest = 0
    if ($(this.hash).offset().top > $(document).height() - $(window).height()) {
      dest = $(document).height() - $(window).height()
    } else {
      dest = $(this.hash).offset().top
    }

    $('html,body').animate({
      scrollTop: dest - $('.navigator').innerHeight()
    }, 1000, 'swing')
  })

  $('#mobile').click(function (e) {
    e.preventDefault()
    $('.flexview').toggleClass('extended')
  })

  $('body').click(function (e) {
    if (!$(e.target).is('#mobile') && !$(e.target).is('#mobile i') && $('.flexview').hasClass('extended')) {
      $('.flexview').removeClass('extended')
    }
  })

  if ($('#repeatcheck').length) {
    $('#password_repeat').on('keyup', pwcheck)
    $('#password').on('keyup', function (e) {
      if ($('#password_repeat').val()) {
        pwcheck(e)
      }
    })
  }

  if ($('.newsfeed').length) {
    $.ajax({
      type: 'get',
      url: '/api/news',
      dataType: 'json',
      success: function (data) {
        if (!data.length) {
          return $('.newsfeed').html('There is nothing to show at this moment.')
        }
        var html = ''
        for (var i in data) {
          var article = data[i]
          html += '<div class="prvarticle">'
          html += '<a class="title" href="/news/' + article.id + '-' + article.slug + '">' + article.title + '</a>'
          html += '<span class="timestamp">Published at ' + new Date(article.created_at) + '</span>'
          html += '<div class="prvcontent">' + article.content + '</div>'
          html += '<a href="/news/' + article.id + '-' + article.slug + '">Read More</a>'
          html += '</div>'
        }
        $('.newsfeed').html(html)
      }
    })
  }

  if ($('#newAvatar').length) {
    $('#newAvatar').click(function (e) {
      e.preventDefault()
      window.Dialog.openPartial('Change Avatar', 'avatar')
    })

    $('#removeAvatar').click(function (e) {
      e.preventDefault()
      $.ajax({
        type: 'POST',
        url: '/api/avatar/remove',
        success: function (data) {
          window.location.reload()
        }
      })
    })
  }

  window.checkLoginState = function () {
    var FB = window.FB
    FB.getLoginStatus(function (response) {
      $.ajax({
        type: 'post',
        url: '/api/external/facebook/callback',
        dataType: 'json',
        data: response,
        success: function (data) {
          if (data.error) {
            $('.message').addClass('error')
            $('.message span').text(data.error)
            return
          }

          window.location.reload()
        }
      }).fail(function () {
        $('.message').addClass('error')
        $('.message span').text('An error occured.')
      })
    })
  }

  $('.loginDiag').click(function (e) {
    e.preventDefault()
    var url = $(this).attr('href')
    var popup = PopupCenter(url, '_blank', 800, 620)
    var timer = setInterval(function () {
      if (popup.closed) {
        clearInterval(timer)
        window.location.reload()
      }
    }, 1000)
  })

  $('.accdisconnect').click(function (e) {
    e.preventDefault()
    var url = $(this).attr('href')
    $.get({
      url: url,
      success: function (e) {
        window.location.reload()
      }
    })
  })
})
