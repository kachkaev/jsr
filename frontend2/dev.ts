#!/usr/bin/env -S deno run -A --watch=static/,routes/
import { tailwind } from "@fresh/plugin-tailwind";
;
import { FreshDevApp } from "@fresh/core/dev";
import { app } from "./main.ts";

const devApp = new FreshDevApp(app);
tailwind(devApp, {});

devApp.onTransformStaticFile({ filter: /\.css$/ }, async (args) => {
  return {
    content: () => transformCss(args.content) // Promise<Uint8Array>,
  }
});

if (Deno.args.includes("build")) {
  await devApp.build();
} else {
  await app.listen();
}
