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

          if (data.redirect) {
            window.location.href = data.redirect
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
})
