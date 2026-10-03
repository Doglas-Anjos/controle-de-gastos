import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador "N" do modo dev cobria o rodape da sidebar (status Pluggy/OpenAI).
  devIndicators: false,
};

export default nextConfig;
