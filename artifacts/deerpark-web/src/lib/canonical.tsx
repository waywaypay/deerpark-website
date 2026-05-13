import { useEffect } from "react";
import { useLocation } from "wouter";

const SITE_ORIGIN = "https://www.deerpark.io";

function setLinkHref(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setMetaContent(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function CanonicalUrl() {
  const [path] = useLocation();
  useEffect(() => {
    const normalized = path === "/" ? "" : path.replace(/\/+$/, "");
    const url = `${SITE_ORIGIN}${normalized}`;
    setLinkHref("canonical", url);
    setMetaContent("og:url", url);
  }, [path]);
  return null;
}
