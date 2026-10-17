// Builds the source images for `npx @capacitor/assets generate --android` from public/icon.svg.
// Run from the repo folder: node scripts/make-icons.cjs
const fs = require('fs');
const sharp = require('sharp');

const svg = fs.readFileSync('public/icon.svg');
// Foreground only (no green rounded square) for Android adaptive icons.
const fg = Buffer.from(
  svg.toString().replace(/<rect width="512" height="512" rx="112"[^>]*\/>/, ''),
);

(async () => {
  fs.mkdirSync('assets', { recursive: true });
  await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile('assets/icon-only.png');
  // Keep the dumbbell inside the adaptive-icon safe zone (centre ~66%).
  const fgSmall = await sharp(fg, { density: 300 }).resize(680, 680).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fgSmall, gravity: 'center' }])
    .png()
    .toFile('assets/icon-foreground.png');
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0e9f6e' } })
    .png()
    .toFile('assets/icon-background.png');
  const logo = await sharp(svg, { density: 300 }).resize(600, 600).png().toBuffer();
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({
      create: {
        width: 2732,
        height: 2732,
        channels: 4,
        background: name.includes('dark') ? '#121212' : '#ffffff',
      },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(`assets/${name}`);
  }
  console.log('assets ready');
})();
