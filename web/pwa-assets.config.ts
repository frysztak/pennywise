import { type Preset, defineConfig } from "@vite-pwa/assets-generator/config";

export const preset: Preset = {
  transparent: {
    sizes: [64, 192, 512],
    favicons: [[48, "favicon.ico"]],
  },
  maskable: {
    sizes: [512],
    padding: 0.45,
  },
  apple: {
    sizes: [180],
  },
};

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset,
  images: ["public/logo.svg"],
});
