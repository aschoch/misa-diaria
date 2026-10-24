import webpush from 'npm:web-push@3.6.7'
import { handleReminder, liveDeps } from './handler.mjs'

const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const subject = Deno.env.get('VAPID_SUBJECT') ?? ''
const ready = Boolean(publicKey && privateKey && subject)
if (ready) webpush.setVapidDetails(subject, publicKey, privateKey)

const send = async (
  sub: { endpoint: string; p256dh: string; auth_secret: string },
  body: string,
  title = 'Misa diaria',
) => {
  if (!ready) return { status: 500 }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
      JSON.stringify({ title, body }),
      { TTL: 60 * 60 * 4 },
    )
    return { status: 201 }
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode: number }).statusCode)
      : 500
    return { status }
  }
}

Deno.serve((request) => handleReminder(request, liveDeps({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceRole: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  cronSecret: Deno.env.get('CRON_SECRET') ?? '',
}, send)))
