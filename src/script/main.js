window.$ = require('jquery')

$(document).ready(function () {
  if (window.location.hash) {
    let hash = window.location.hash 
    if ($(hash).length) {
      $(window).scrollTop($(hash).offset().top - $('.navigator').innerHeight() * 2)
    }
  }

  $(window).on('scroll', function() {
    if($(window).scrollTop() >= $('.banner').innerHeight()) {
      $('.anchor').css('height', $('.navigator').innerHeight() + 'px')
      $('#navlogo').removeClass('hidden')
      $('.navigator').addClass('fix')
    } else {
      $('#navlogo').addClass('hidden')
      $('.navigator').removeClass('fix')
      $('.anchor').css('height', '0px')
    }
  })

  if($(window).scrollTop() >= $('.banner').innerHeight()) {
    $('#navlogo').removeClass('hidden')
    $('.navigator').addClass('fix')
    $('.anchor').css('height', $('.navigator').innerHeight() + 'px')
  }

  $('a[href*=\\#]').on('click', function (e) {
    if (!$(this.hash).length) return
    e.preventDefault()

    let dest = 0
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

  $('body').click(function(e) {
    if (!$(e.target).is('#mobile') && !$(e.target).is('#mobile i') && $('.flexview').hasClass('extended')) {
      $('.flexview').removeClass('extended')
    }
  })

  if ($('#repeatcheck').length) {
    function pwcheck (e) {
      let pw = $('#password').val()
      let pwa = $('#password_repeat').val()
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

    $('#password_repeat').on('keyup', pwcheck)
    $('#password').on('keyup', function (e) {
      if ($('#password_repeat').val()) {
        pwcheck(e)
      }
    })
  }

  window.checkLoginState = function () {
    FB.getLoginStatus(function(response) {
      $.ajax({
        type: 'post',
        url: '/api/external/facebook/callback',
        dataType: 'json',
        data: response,
        success: (data) => {
          if (data.error) {
            $('.message').addClass('error')
            $('.message span').text(data.error)
            return
          }

          if (data.redirect) {
            return window.location.href = data.redirect
          }

          window.location.reload()
        }
      }).fail(function() {
        $('.message').addClass('error')
        $('.message span').text('An error occured.')
      })
    })
  }
})
