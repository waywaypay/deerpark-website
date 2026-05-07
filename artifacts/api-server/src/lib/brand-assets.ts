// Static brand assets used by outbound email. The logo is bundled at build
// time as a base64 string (esbuild loader in build.mjs) so we don't need a
// runtime fs read or a public CDN. The favicon-192 source weighs ~17KB,
// so the encoded data: URL adds ~24KB to each rendered email — small
// enough to be acceptable across mainstream clients.

import logoBase64 from "../assets/logo-icon.png";

export const LOGO_DATA_URL = `data:image/png;base64,${logoBase64}`;
