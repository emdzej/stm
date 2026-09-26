import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount point");

mount(App, { target });

registerSW({
  onRegisteredSW(swUrl) {
    console.info("[STM] service worker registered:", swUrl);
  },
  onOfflineReady() {
    console.info("[STM] offline-ready");
  },
});
