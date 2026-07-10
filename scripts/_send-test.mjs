import { render } from '@react-email/render'
import React from 'react'
import { template } from '/dev-server/src/lib/email-templates/welcome.tsx'

const el = React.createElement(template.component, { displayName: 'Lazone' })
const html = await render(el)
const text = await render(el, { plainText: true })
const out = { html, text, subject: template.subject }
await Bun.write('/tmp/rendered.json', JSON.stringify(out))
console.log('ok', html.length)
