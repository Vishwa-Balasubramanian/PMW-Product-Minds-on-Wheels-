"use client";

import { useEffect, useRef, useState } from "react";

/** The official BMW logo, only as the provided file /public/brand/bmw-logo.svg. Never redrawn or modified.
 *  If the file has not been added yet, the logo and its divider are hidden instead of showing a broken image.
 *  (The load can fail before React attaches onError, so the state is also checked after mount.) */
export function BrandLogo() {
  const [ok, setOk] = useState(true);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setOk(false);
  }, []);

  return (
    <span className={ok ? "flex items-center gap-4" : "hidden"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src="/brand/bmw-logo.svg" alt="BMW" height={40} className="my-4 h-10 w-auto" onError={() => setOk(false)} />
      <span className="h-8 w-px bg-[#BBBBBB]" aria-hidden="true" />
    </span>
  );
}
