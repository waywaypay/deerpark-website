import { useEffect } from "react";
import { useLocation } from "wouter";

const SITE_ORIGIN = "https://www.deerpark.io";

// Homepage values shipped in index.html. Used as the fallback when a route has
// no override so we always restore the defaults when navigating back to "/".
const HOME_TITLE = "DeerPark — From AI curious to AI capable.";
const HOME_DESCRIPTION =
  "AI enablement for organizations. We assess your readiness, ship the applications your team needs, and train people to run them — six to eight weeks from kickoff to handoff.";
const HOME_OG_DESCRIPTION =
  "We assess, build, deploy, and train — so your team actually uses what we ship. Kickoff to handoff in six to eight weeks.";
const HOME_TWITTER_DESCRIPTION =
  "AI enablement for organizations. Kickoff to handoff in six to eight weeks.";

type RouteMeta = {
  title: string;
  description: string;
  ogDescription?: string;
  twitterDescription?: string;
};

const ROUTE_META: Record<string, RouteMeta> = {
  "/dispatch": {
    title: "Dispatch — Live AI headline feed | DeerPark",
    description:
      "A live feed of the AI landscape for operators — the top enterprise-relevant releases and research, ranked and refreshed throughout the day.",
  },
  "/privacy": {
    title: "Privacy | DeerPark",
    description:
      "How DeerPark handles personal data, cookies, and email subscriptions.",
  },
  "/terms": {
    title: "Terms of Service | DeerPark",
    description: "Terms of service for DeerPark.io.",
  },
};

type MetaResolution = RouteMeta | null;

function resolveMeta(path: string): MetaResolution {
  return ROUTE_META[path] ?? null;
}

function setLinkHref(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setMetaContent(selector: string, attr: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [key, value] = attr.split("=");
    el.setAttribute(key, value);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setOg(property: string, content: string) {
  setMetaContent(
    `meta[property="${property}"]`,
    `property=${property}`,
    content,
  );
}

function setNamed(name: string, content: string) {
  setMetaContent(`meta[name="${name}"]`, `name=${name}`, content);
}

export function CanonicalUrl() {
  const [path] = useLocation();
  useEffect(() => {
    const normalized = path === "/" ? "" : path.replace(/\/+$/, "");
    const url = `${SITE_ORIGIN}${normalized}`;
    setLinkHref("canonical", url);
    setOg("og:url", url);

    const meta = resolveMeta(path);

    const title = meta?.title ?? HOME_TITLE;
    const description = meta?.description ?? HOME_DESCRIPTION;
    const ogDescription =
      meta?.ogDescription ?? meta?.description ?? HOME_OG_DESCRIPTION;
    const twitterDescription =
      meta?.twitterDescription ?? meta?.description ?? HOME_TWITTER_DESCRIPTION;

    document.title = title;
    setNamed("description", description);
    setOg("og:title", title);
    setOg("og:description", ogDescription);
    setNamed("twitter:title", title);
    setNamed("twitter:description", twitterDescription);
  }, [path]);
  return null;
}
