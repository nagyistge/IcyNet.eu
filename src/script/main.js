window.$ = require('jquery')

$(document).ready(function () {
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
})
