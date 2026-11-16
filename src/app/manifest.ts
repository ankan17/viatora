import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Travel Planner",
    short_name: "Trips",
    description: "Plan a trip together by chatting.",
    start_url: "/trips",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf3f2",
    theme_color: "#fbf3f2",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
