"use client";

import { RouterProvider } from "react-router";
import { useSyncExternalStore } from "react";
import { router } from "./static-frontend";

const subscribe = (notify: () => void) => {
  queueMicrotask(notify);
  return () => {};
};

export default function FrontendClient() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted || !router) return null;
  return <RouterProvider router={router} />;
}
