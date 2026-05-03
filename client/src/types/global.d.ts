// React 18's built-in JSX typings don't yet expose the `fetchpriority`
// HTML attribute even though the runtime understands it. Augment the
// shared HTML attribute interfaces so we can use the lowercase attribute
// (which is what the HTML spec defines) without `as any` casts.
import "react";

declare module "react" {
  interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    fetchpriority?: "high" | "low" | "auto";
  }
  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    fetchpriority?: "high" | "low" | "auto";
  }
}

export {};
