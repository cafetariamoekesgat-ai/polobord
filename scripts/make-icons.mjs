// Maakt de PNG-iconen uit public/icon.svg (eenmalig of na wijziging draaien).
import sharp from 'sharp'
const src = 'public/icon.svg'
await sharp(src).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(src).resize(512, 512).png().toFile('public/icon-512.png')
await sharp(src).resize(180, 180).flatten({ background: '#0b2233' }).png().toFile('public/apple-touch-icon.png')
// maskable: extra rand zodat Android het icoon mag bijsnijden
await sharp(src).resize(400, 400).extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#0b2233' }).png().toFile('public/icon-512-maskable.png')
console.log('iconen klaar')
