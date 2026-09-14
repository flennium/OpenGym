// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useState } from "react";
import { api, applyAppearance, appLogo } from "../app/runtime";
import { Setup, Login } from "./auth";
import { Shell } from "./shell";
export function App() {
  const [stage, setStage] = useState<"load" | "setup" | "login" | "app">(
    "load",
  );
  const [branding, setBranding] = useState<any>({
    gymName: "OpenGym",
    logoDataUrl: null,
  });
  useEffect(() => {
    applyAppearance("Pulse", true);
    api("setup:status")
      .then(async (x: any) => {
        if (x.complete) setBranding(await api("setup:branding"));
        setStage(x.complete ? "login" : "setup");
      })
      .catch(() => setStage("setup"));
  }, []);
  return stage === "load" ? (
    <main className="splash">
      <img className="brandMark" src={appLogo} alt="" /> Opening OpenGym…
    </main>
  ) : stage === "setup" ? (
    <Setup
      done={async () => {
        setBranding(await api("setup:branding"));
        setStage("login");
      }}
    />
  ) : stage === "login" ? (
    <Login branding={branding} done={() => setStage("app")} />
  ) : (
    <Shell
      logout={() => {
        applyAppearance("Pulse", true);
        setStage("login");
      }}
    />
  );
}