import {EmailTemplate} from 'email-templates'
import path from 'path'
import nodemailer from 'nodemailer'
import config from '../../scripts/load-config'

const templateDir = path.join(__dirname, '../../', 'templates')

let templateCache = {}
let transporter

function sendMail (email, headers) {
  if (!transporter) return
  transporter.sendMail({
    from: config.email.admin,
    to: email,
    subject: headers.subject,
    html: headers.html,
    text: headers.text
  }, (error, info) => {
    if (error) {
      return console.error(error)
    }
    console.debug(info)
  })
}

async function pushMail (template, email, context) {
  if (!transporter) return
  let templ = null

  if (!templateCache[template]) {
    templ = templateCache[template] = new EmailTemplate(path.join(templateDir, template))
  } else {
    templ = templateCache[template]
  }

  let result = await templ.render(context)

  console.debug('Mail being sent: %s to %s', template, email)

  sendMail(email, result)
}

async function init () {
  if (!config.email || config.email.enabled === false) return
  transporter = nodemailer.createTransport(config.email.transport)

  console.debug('Setting up mail transporter')

  try {
    await transporter.verify()
    console.debug('Mail transporter initialized')
  } catch (e) {
    console.error('Email server verification failed')
    console.error(e)
    transporter = null
  }
}

module.exports = {
  pushMail: pushMail,
  init: init
}
