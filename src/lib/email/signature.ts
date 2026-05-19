// Wandelt Bild-URLs (nackte URLs oder als <a href="…">Logo</a> hinterlegt) in
// einer Signatur oder einem Mail-Body in <img>-Tags um, damit sie im Browser
// und im Mailclient sichtbar sind. Wirkt nur lesend — der DB-Wert bleibt
// unverändert.

const IMG_STYLE = "max-width:240px;height:auto;display:inline-block;border:0;";

// <a href="…image.ext…">label</a> → <img>
const ANCHOR_IMG_RE =
  /<a\b[^>]*\bhref=["'](https?:\/\/[^"']+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^"']*)?)["'][^>]*>[\s\S]*?<\/a>/gi;

// Nackte Bild-URL (nicht innerhalb von href="…" oder src="…")
const URL_RE =
  /(?<!["'=>])\bhttps?:\/\/[^\s<>"']+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s<>"']*)?/gi;

export function autoLinkifyImages(html: string): string {
  if (!html) return html;
  return html
    .replace(ANCHOR_IMG_RE, (_match, url: string) => {
      return `<img src="${url}" alt="" style="${IMG_STYLE}" />`;
    })
    .replace(URL_RE, (url) => {
      return `<img src="${url}" alt="" style="${IMG_STYLE}" />`;
    });
}
