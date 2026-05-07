// esbuild's loader: { ".png": "base64" } maps a *.png import to a string
// of base64-encoded bytes. This declaration teaches tsc the same shape so
// `import logoBase64 from "../assets/logo-icon.png"` typechecks.

declare module "*.png" {
  const base64: string;
  export default base64;
}
