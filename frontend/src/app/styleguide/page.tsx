import type { Metadata } from "next";
import StyleguideClient from "./StyleguideClient";

export const metadata: Metadata = {
  title: "Styleguide — Hospital MS",
  description: "Design system catalogue: tokens, type, density and every component.",
};

export default function StyleguidePage() {
  return <StyleguideClient />;
}
