import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Products() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/", { replace: true });
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.location.hash = "products";
      });
    }
  }, [setLocation]);
  return null;
}
