"use client";

import { RouterProvider } from "react-router";
import { useSyncExternalStore } from "react";
import { router } from "./static-frontend";

const subscribe = () => () => {};

export default function FrontendClient() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted || !router) return null;
  return <RouterProvider router={router} />;
}
