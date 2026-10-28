// Sends email through Gmail SMTP (port 465, TLS) as the Workspace account in SMTP_USER, with a
// Google app password in SMTP_PASS. Small built-in client: plain/HTML body + attachments.

export interface Attachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Attachment[];
}

export class EmailNotConfigured extends Error {
  constructor() {
    super('Email is not set up yet (SMTP_USER / SMTP_PASS secrets)');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Base64 wrapped at 76 characters, as MIME requires. */
const b64Lines = (bytes: Uint8Array) => b64(bytes).replace(/.{76}/g, '$&\r\n');
const header = (text: string) => `=?UTF-8?B?${b64(enc.encode(text))}?=`;

function buildMessage(from: string, fromName: string, mail: Mail): string {
  const mixed = `mix_${crypto.randomUUID()}`;
  const alt = `alt_${crypto.randomUUID()}`;
  const lines = [
    `From: ${header(fromName)} <${from}>`,
    `To: <${mail.to}>`,
    `Subject: ${header(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(enc.encode(mail.text)),
    `--${alt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(enc.encode(mail.html)),
    `--${alt}--`,
  ];
  for (const a of mail.attachments ?? []) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      b64Lines(a.content),
    );
  }
  lines.push(`--${mixed}--`, '');
  return lines.join('\r\n');
}

export async function sendEmail(mail: Mail): Promise<void> {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass) throw new EmailNotConfigured();
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'FitCoach';

  const conn = await Deno.connectTls({ hostname: 'smtp.gmail.com', port: 465 });
  let buffer = '';

  // Reads one (possibly multi-line) reply and checks its code.
  async function reply(expect: number): Promise<string> {
    const chunk = new Uint8Array(4096);
    const deadline = Date.now() + 20_000;
    for (;;) {
      const lines = buffer.split('\r\n');
      const done = lines.findIndex((l) => /^\d{3} /.test(l));
      if (done >= 0) {
        const text = lines.slice(0, done + 1).join('\n');
        buffer = lines.slice(done + 1).join('\r\n');
        const code = Number(text.slice(text.lastIndexOf('\n') + 1).slice(0, 3));
        if (code !== expect) {
          // Only the reply code and Google's short reason – never the credentials.
          throw new Error(`Mail server said ${code}: ${text.split('\n').pop()?.slice(4, 160)}`);
        }
        return text;
      }
      if (Date.now() > deadline) throw new Error('Mail server did not answer');
      const n = await conn.read(chunk);
      if (n === null) throw new Error('Mail server closed the connection');
      buffer += dec.decode(chunk.subarray(0, n));
    }
  }
  async function send(line: string, expect: number) {
    await conn.write(enc.encode(line + '\r\n'));
    return await reply(expect);
  }

  try {
    await reply(220);
    await send('EHLO fitcoach', 250);
    await send(`AUTH PLAIN ${b64(enc.encode(`\0${user}\0${pass}`))}`, 235);
    await send(`MAIL FROM:<${user}>`, 250);
    await send(`RCPT TO:<${mail.to}>`, 250);
    await send('DATA', 354);
    // Dot-stuffing: a line that starts with "." gets another one.
    const body = buildMessage(user, fromName, mail).replace(/\r\n\./g, '\r\n..');
    await conn.write(enc.encode(body + '\r\n.\r\n'));
    await reply(250);
    await send('QUIT', 221).catch(() => undefined);
  } finally {
    try {
      conn.close();
    } catch {
      // already closed
    }
  }
}
