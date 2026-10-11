/** The official BMW logo, only as the provided file /public/brand/bmw-logo.svg. Never redrawn or modified.
 *  Rendered only when that file existed at build time (see next.config.ts), so a missing file never shows
 *  a broken image. Add the file and redeploy to show it. */
export function BrandLogo() {
  if (process.env.NEXT_PUBLIC_HAS_BMW_LOGO !== "1") return null;
  return (
    <span className="flex items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/bmw-logo.svg" alt="BMW" height={40} className="my-4 h-10 w-auto" />
      <span className="h-8 w-px bg-[#BBBBBB]" aria-hidden="true" />
    </span>
  );
}
